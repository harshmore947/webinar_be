import { Request, Response } from "express";
import Stripe from "stripe";
import WebinarModel from "../models/Webinar.model";
import UserModel from "../models/User.model";
import PaymentModel from "../models/Payment.model";
import { Types } from "mongoose";
import { createNotification } from "./notification.controller";

// Initialize Stripe with test mode
const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY ||
    "sk_test_51RqUu70T2JSa61UCxM9f0C58HHsMG546Bcn624CCT7bKikzUWVGpNDPfuM98ign4Fi69SMEsEY0yhWOJS4xfncyi00dcC5SBaX",
  {
    apiVersion: "2025-06-30.basil",
  }
);

/**
 * Helper function to enroll user in webinar with retry logic
 * This is called both from webhook and fallback verification
 */
async function enrollUserInWebinar(
  userId: string,
  webinarId: string,
  paymentRecord?: any,
  maxRetries: number = 3
): Promise<{ success: boolean; message: string; error?: any }> {
  let lastError: any = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(
        `🔄 Enrollment attempt ${attempt}/${maxRetries} for user ${userId} in webinar ${webinarId}`
      );

      // Check if user is already enrolled
      const webinar = await WebinarModel.findById(webinarId);
      if (!webinar) {
        return {
          success: false,
          message: "Webinar not found",
        };
      }

      const isAlreadyEnrolled = webinar.enrolledUsers.some(
        (enrolledUser) => enrolledUser.toString() === userId
      );

      if (isAlreadyEnrolled) {
        console.log(`✅ User ${userId} is already enrolled in webinar ${webinarId}`);
        
        // Update payment record if provided
        if (paymentRecord) {
          paymentRecord.enrollmentCompleted = true;
          paymentRecord.status = "completed";
          paymentRecord.completedAt = new Date();
          await paymentRecord.save();
        }
        
        return {
          success: true,
          message: "User already enrolled",
        };
      }

      // Enroll user
      const updatedWebinar = await WebinarModel.findByIdAndUpdate(
        webinarId,
        {
          $addToSet: { enrolledUsers: new Types.ObjectId(userId) },
        },
        { new: true }
      );

      if (!updatedWebinar) {
        throw new Error("Failed to update webinar with user enrollment");
      }

      // Get user details for notification
      const user = await UserModel.findById(userId);
      
      // Create notification
      await createNotification(
        userId,
        `Payment successful! You're now enrolled in "${webinar.title}"`,
        "payment",
        `/webinars/${webinarId}`
      );

      // Update payment record
      if (paymentRecord) {
        paymentRecord.enrollmentCompleted = true;
        paymentRecord.status = "completed";
        paymentRecord.completedAt = new Date();
        paymentRecord.enrollmentAttempts = attempt;
        paymentRecord.lastEnrollmentAttempt = new Date();
        await paymentRecord.save();
      }

      console.log(
        `✅ Successfully enrolled user ${user?.firstName} ${user?.lastName} (${user?.email}) in webinar: ${webinar.title}`
      );

      return {
        success: true,
        message: "User successfully enrolled",
      };
    } catch (error: any) {
      lastError = error;
      console.error(
        `❌ Enrollment attempt ${attempt} failed:`,
        error.message
      );

      // Update payment record with error
      if (paymentRecord) {
        paymentRecord.enrollmentAttempts = attempt;
        paymentRecord.lastEnrollmentAttempt = new Date();
        await paymentRecord.logError(error);
      }

      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        console.log(`⏳ Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }

  // All retries failed
  return {
    success: false,
    message: `Enrollment failed after ${maxRetries} attempts`,
    error: lastError,
  };
}

// Create Stripe checkout session for webinar payment
export const createPaymentSession = async (req: Request, res: Response) => {
  try {
    const { webinarId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, msg: "Unauthorized" });
    }

    // Get webinar details
    const webinar = await WebinarModel.findById(webinarId);
    if (!webinar) {
      return res.status(404).json({ success: false, msg: "Webinar not found" });
    }

    if (!webinar.isPaid || !webinar.price) {
      return res
        .status(400)
        .json({ success: false, msg: "This webinar is not a paid webinar" });
    }

    // Get user details
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, msg: "User not found" });
    }

    // Check if user already enrolled
    const isAlreadyEnrolled = webinar.enrolledUsers.some(
      (enrolledUser) => enrolledUser.toString() === userId
    );
    if (isAlreadyEnrolled) {
      return res.status(400).json({
        success: false,
        msg: "Already enrolled in this webinar",
      });
    }

    // Check if there's a pending payment for this user and webinar
    const existingPayment = await PaymentModel.findOne({
      userId: new Types.ObjectId(userId),
      webinarId: new Types.ObjectId(webinarId),
      status: { $in: ["pending", "completed"] },
    });

    if (existingPayment && existingPayment.status === "completed") {
      return res.status(400).json({
        success: false,
        msg: "Payment already completed for this webinar",
      });
    }

    // Determine redirect URLs based on webinar status
    // Include session_id in success URL for verification
    const successUrl = `${process.env.CLIENT_URL}/webinars/${webinarId}?payment_success=true&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${process.env.CLIENT_URL}/webinars/${webinarId}?payment_cancelled=true`;

    // Create Stripe checkout session with idempotency key
    const idempotencyKey = `payment_${userId}_${webinarId}_${Date.now()}`;
    
    const session = await stripe.checkout.sessions.create(
      {
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: (webinar.currency || "usd").toLowerCase(),
              product_data: {
                name: webinar.title,
                description: `Access to webinar: ${webinar.title}`,
                metadata: {
                  webinar_category: webinar.category,
                  webinar_date: webinar.date,
                  webinar_time: webinar.time,
                },
              },
              unit_amount: Math.round((webinar.price || 0) * 100), // Convert to cents
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer_email: user.email,
        metadata: {
          webinarId: webinar.id,
          userId: userId,
          webinarTitle: webinar.title,
          userEmail: user.email,
          userName: `${user.firstName} ${user.lastName}`,
        },
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30 minutes expiry
        allow_promotion_codes: true,
      },
      {
        idempotencyKey: idempotencyKey,
      }
    );

    // Create payment record in database
    const paymentRecord = await PaymentModel.create({
      userId: new Types.ObjectId(userId),
      webinarId: new Types.ObjectId(webinarId),
      stripeSessionId: session.id,
      amount: webinar.price,
      currency: (webinar.currency || "USD").toUpperCase(),
      status: "pending",
      paymentGateway: "stripe",
      metadata: {
        webinarTitle: webinar.title,
        userEmail: user.email,
        userName: `${user.firstName} ${user.lastName}`,
      },
      webhookReceived: false,
      enrollmentCompleted: false,
      enrollmentAttempts: 0,
    });

    console.log(
      `💳 Payment session created: ${session.id} for user ${user.email} - webinar ${webinar.title}`
    );

    res.json({
      success: true,
      sessionId: session.id,
      checkoutUrl: session.url,
      sessionUrl: session.url,
      paymentId: paymentRecord._id,
    });
  } catch (error: any) {
    console.error("Error creating payment session:", error);
    
    // Handle specific Stripe errors
    if (error.type === "StripeCardError") {
      return res.status(400).json({
        success: false,
        msg: "Card declined. Please use a different payment method.",
        error: error.message,
      });
    } else if (error.type === "StripeRateLimitError") {
      return res.status(429).json({
        success: false,
        msg: "Too many requests. Please try again later.",
        error: error.message,
      });
    } else if (error.type === "StripeInvalidRequestError") {
      return res.status(400).json({
        success: false,
        msg: "Invalid payment request. Please check your details.",
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      msg: "Failed to create payment session. Please try again.",
      error: error.message,
    });
  }
};

// Handle Stripe webhook for successful payments
export const handlePaymentSuccess = async (req: Request, res: Response) => {
  try {
    const sig = req.headers["stripe-signature"];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !endpointSecret) {
      console.error("❌ Missing webhook signature or secret");
      return res.status(400).json({ success: false, msg: "Missing signature" });
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err: any) {
      console.error("❌ Webhook signature verification failed:", err.message);
      return res.status(400).json({ success: false, msg: "Invalid signature" });
    }

    console.log(`📨 Webhook received: ${event.type} - ${event.id}`);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const { webinarId, userId, webinarTitle, userEmail, userName } =
        session.metadata || {};

      if (!webinarId || !userId) {
        console.error("❌ Missing metadata in webhook:", session.metadata);
        return res.status(400).json({ success: false, msg: "Missing metadata" });
      }

      try {
        console.log(
          `🔄 Processing webhook payment for user ${userId} in webinar ${webinarId}`
        );

        // Find or create payment record
        let paymentRecord = await PaymentModel.findOne({
          stripeSessionId: session.id,
        });

        if (!paymentRecord) {
          // Fallback: create payment record if webhook arrived before session creation completed
          console.log(`⚠️ Creating payment record from webhook (race condition)`);
          paymentRecord = await PaymentModel.create({
            userId: new Types.ObjectId(userId),
            webinarId: new Types.ObjectId(webinarId),
            stripeSessionId: session.id,
            stripePaymentIntentId: session.payment_intent as string,
            amount: (session.amount_total || 0) / 100,
            currency: (session.currency || "USD").toUpperCase(),
            status: "pending",
            paymentGateway: "stripe",
            metadata: {
              webinarTitle: webinarTitle || "",
              userEmail: userEmail || "",
              userName: userName || "",
            },
            webhookReceived: true,
            enrollmentCompleted: false,
            enrollmentAttempts: 0,
          });
        } else {
          // Update existing payment record
          paymentRecord.webhookReceived = true;
          paymentRecord.stripePaymentIntentId = session.payment_intent as string;
          await paymentRecord.save();
        }

        // Enroll user with retry logic
        const enrollmentResult = await enrollUserInWebinar(
          userId,
          webinarId,
          paymentRecord,
          3 // 3 retry attempts
        );

        if (enrollmentResult.success) {
          console.log(
            `✅ Webhook processing complete: ${userName} (${userEmail}) enrolled in ${webinarTitle}`
          );
          console.log(
            `💰 Payment: ${(session.amount_total || 0) / 100} ${session.currency?.toUpperCase()}`
          );
        } else {
          console.error(
            `❌ Webhook enrollment failed: ${enrollmentResult.message}`,
            enrollmentResult.error
          );
          
          // Update payment status to failed
          paymentRecord.status = "failed";
          await paymentRecord.save();
          
          // Send notification about enrollment failure
          await createNotification(
            userId,
            `Payment received but enrollment failed. Please contact support.`,
            "error",
            `/webinars/${webinarId}`
          );
        }
      } catch (enrollError: any) {
        console.error("❌ Error in webhook enrollment:", enrollError);
        
        // Log error in payment record
        const paymentRecord = await PaymentModel.findOne({
          stripeSessionId: session.id,
        });
        if (paymentRecord) {
          await paymentRecord.logError(enrollError);
        }
      }
    } else if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      
      // Update payment record to cancelled
      await PaymentModel.findOneAndUpdate(
        { stripeSessionId: session.id },
        { status: "cancelled" }
      );
      
      console.log(`⏰ Payment session expired: ${session.id}`);
    } else if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      
      // Update payment record to refunded
      await PaymentModel.findOneAndUpdate(
        { stripePaymentIntentId: charge.payment_intent as string },
        { status: "refunded" }
      );
      
      console.log(`💸 Payment refunded: ${charge.id}`);
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error("❌ Error handling payment webhook:", error);
    res.status(500).json({ success: false, msg: "Webhook error" });
  }
};

// Get payment status for a webinar
export const getPaymentStatus = async (req: Request, res: Response) => {
  try {
    const { webinarId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, msg: "Unauthorized" });
    }

    const webinar = await WebinarModel.findById(webinarId);
    if (!webinar) {
      return res.status(404).json({ success: false, msg: "Webinar not found" });
    }

    const isEnrolled = webinar.enrolledUsers.some(
      (enrolledUser) => enrolledUser.toString() === userId
    );

    res.json({
      success: true,
      isEnrolled,
      isPaid: webinar.isPaid,
      price: webinar.price,
      currency: webinar.currency,
      paymentGateway: webinar.paymentGateway,
    });
  } catch (error: any) {
    console.error("Error getting payment status:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to get payment status",
    });
  }
};

// Verify payment and ensure enrollment (fallback for webhook)
export const verifyPaymentAndEnroll = async (req: Request, res: Response) => {
  try {
    const { webinarId } = req.params;
    const userId = req.user?.id;
    const { sessionId } = req.query;

    console.log(
      `🔍 Verifying enrollment for user ${userId} in webinar ${webinarId}`
    );

    if (!userId) {
      console.log(`❌ Unauthorized access attempt for webinar ${webinarId}`);
      return res.status(401).json({ success: false, msg: "Unauthorized" });
    }

    // Get webinar details
    const webinar = await WebinarModel.findById(webinarId);
    if (!webinar) {
      console.log(`❌ Webinar ${webinarId} not found`);
      return res.status(404).json({ success: false, msg: "Webinar not found" });
    }

    // Check if user is already enrolled
    const isEnrolled = webinar.enrolledUsers.some(
      (enrolledUser) => enrolledUser.toString() === userId
    );

    if (isEnrolled) {
      console.log(`✅ User ${userId} is already enrolled`);
      return res.json({
        success: true,
        msg: "User is already enrolled",
        isEnrolled: true,
      });
    }

    // Check payment record
    let paymentRecord = null;
    
    if (sessionId) {
      // Try to find payment by session ID
      paymentRecord = await PaymentModel.findOne({
        stripeSessionId: sessionId as string,
      });
    } else {
      // Find the most recent completed payment for this user and webinar
      paymentRecord = await PaymentModel.findOne({
        userId: new Types.ObjectId(userId),
        webinarId: new Types.ObjectId(webinarId),
        status: "completed",
      }).sort({ createdAt: -1 });
    }

    if (!paymentRecord) {
      console.log(`⚠️ No payment record found for user ${userId}`);
      return res.json({
        success: false,
        msg: "No payment found. Please complete payment first.",
        isEnrolled: false,
      });
    }

    // If payment is completed but enrollment not done, this is a fallback scenario
    if (paymentRecord.status === "completed" && !paymentRecord.enrollmentCompleted) {
      console.log(`🔄 Fallback enrollment initiated for payment ${paymentRecord._id}`);

      const enrollmentResult = await enrollUserInWebinar(
        userId,
        webinarId,
        paymentRecord,
        5 // More retries for fallback
      );

      if (enrollmentResult.success) {
        console.log(`✅ Fallback enrollment successful`);
        return res.json({
          success: true,
          msg: "Successfully enrolled in webinar",
          isEnrolled: true,
        });
      } else {
        console.error(`❌ Fallback enrollment failed: ${enrollmentResult.message}`);
        return res.status(500).json({
          success: false,
          msg: "Enrollment failed. Please contact support.",
          error: enrollmentResult.error?.message,
        });
      }
    }

    // Check if payment is still pending
    if (paymentRecord.status === "pending") {
      // Verify with Stripe
      try {
        const session = await stripe.checkout.sessions.retrieve(
          paymentRecord.stripeSessionId
        );

        if (session.payment_status === "paid") {
          console.log(`💳 Stripe confirms payment is complete, initiating enrollment`);
          
          // Update payment record
          paymentRecord.status = "completed";
          paymentRecord.stripePaymentIntentId = session.payment_intent as string;
          await paymentRecord.save();

          // Enroll user
          const enrollmentResult = await enrollUserInWebinar(
            userId,
            webinarId,
            paymentRecord,
            5
          );

          if (enrollmentResult.success) {
            return res.json({
              success: true,
              msg: "Payment verified and enrolled successfully",
              isEnrolled: true,
            });
          } else {
            return res.status(500).json({
              success: false,
              msg: "Payment verified but enrollment failed. Please contact support.",
              error: enrollmentResult.error?.message,
            });
          }
        } else {
          console.log(`⏳ Payment still pending on Stripe`);
          return res.json({
            success: false,
            msg: "Payment is still pending. Please complete the payment.",
            isEnrolled: false,
            paymentStatus: session.payment_status,
          });
        }
      } catch (stripeError: any) {
        console.error(`❌ Error verifying with Stripe:`, stripeError);
        return res.status(500).json({
          success: false,
          msg: "Failed to verify payment status",
          error: stripeError.message,
        });
      }
    }

    res.json({
      success: true,
      msg: "Enrollment status checked",
      isEnrolled: false,
      paymentStatus: paymentRecord.status,
    });
  } catch (error: any) {
    console.error("❌ Error verifying payment and enrollment:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to verify enrollment",
      error: error.message,
    });
  }
};

// Test webhook endpoint for development
export const testWebhook = async (req: Request, res: Response) => {
  try {
    console.log("Test webhook called with body:", req.body);
    res.json({ success: true, msg: "Test webhook received" });
  } catch (error: any) {
    console.error("Test webhook error:", error);
    res.status(500).json({ success: false, msg: "Test webhook failed" });
  }
};

// Debug endpoint to check webhook configuration
export const debugWebhookConfig = async (req: Request, res: Response) => {
  try {
    const config = {
      webhookEndpoint: "/api/payment/webhook",
      hasWebhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
      hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
      clientUrl: process.env.CLIENT_URL,
      nodeEnv: process.env.NODE_ENV,
    };

    console.log("🔧 Webhook Configuration:", config);
    res.json({ success: true, config });
  } catch (error: any) {
    console.error("Debug config error:", error);
    res.status(500).json({ success: false, msg: "Debug failed" });
  }
};

// Get payment history for a user
export const getPaymentHistory = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { webinarId } = req.params;

    if (!userId) {
      return res.status(401).json({ success: false, msg: "Unauthorized" });
    }

    const query: any = { userId: new Types.ObjectId(userId) };
    if (webinarId) {
      query.webinarId = new Types.ObjectId(webinarId);
    }

    const payments = await PaymentModel.find(query)
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("webinarId", "title date time")
      .lean();

    res.json({
      success: true,
      payments,
      count: payments.length,
    });
  } catch (error: any) {
    console.error("Error fetching payment history:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to fetch payment history",
      error: error.message,
    });
  }
};

// Retry failed enrollment (admin endpoint)
export const retryFailedEnrollment = async (req: Request, res: Response) => {
  try {
    const { paymentId } = req.params;

    const paymentRecord = await PaymentModel.findById(paymentId);
    if (!paymentRecord) {
      return res.status(404).json({ success: false, msg: "Payment not found" });
    }

    if (paymentRecord.enrollmentCompleted) {
      return res.json({
        success: true,
        msg: "Enrollment already completed",
      });
    }

    console.log(`🔄 Manual retry enrollment for payment ${paymentId}`);

    const enrollmentResult = await enrollUserInWebinar(
      paymentRecord.userId.toString(),
      paymentRecord.webinarId.toString(),
      paymentRecord,
      5
    );

    if (enrollmentResult.success) {
      return res.json({
        success: true,
        msg: "Enrollment successful",
      });
    } else {
      return res.status(500).json({
        success: false,
        msg: enrollmentResult.message,
        error: enrollmentResult.error,
      });
    }
  } catch (error: any) {
    console.error("Error retrying enrollment:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to retry enrollment",
      error: error.message,
    });
  }
};
