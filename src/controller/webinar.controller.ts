import { Request, Response } from "express";
import WebinarModel from "../models/Webinar.model";
import { Types } from "mongoose";
import { createNotification } from "./notification.controller";
import { combineDateTime } from "../utils/dateTimeUtils";
import logger from "../utils/logger";
import { sanitizeHtml } from "../utils/sanitizeHtml";
import { sendCertificateEmail } from "../utils/mailer";
import {
  generateCertificate,
  CertificateData,
} from "../utils/certificateGenerator";
import crypto from "crypto";
import { initializeWebinarAnalytics } from "./analytics.controller";
import { SimpleCertificateService } from "../utils/simpleCertificateService";
import { addBatchCertificateJob } from "../utils/certificateQueue";

// Helper function to generate certificates after webinar ends
const generateCertificatesAfterWebinarEnd = async (webinarId: string) => {
  try {
    console.log(`📜 Starting certificate generation for webinar ${webinarId}`);

    const webinar = await WebinarModel.findById(webinarId)
      .populate("hostId", "firstName lastName email")
      .populate("attendedUsers.userId", "firstName lastName email");

    if (!webinar || !webinar.hasCertification) {
      console.log(
        `⏭️ Skipping certificate generation - certification not enabled for webinar ${webinarId}`
      );
      return;
    }

    console.log(`✅ Webinar found with certification enabled: ${webinar.title}`);

    // Filter eligible attendees (minimum 30 minutes attendance)
    const minimumDuration = 30;
    const eligibleAttendees = webinar.attendedUsers.filter(
      (attendance) => attendance.totalDuration >= minimumDuration
    );

    console.log(`👥 Total attendees: ${webinar.attendedUsers.length}, Eligible (30+ min): ${eligibleAttendees.length}`);

    if (eligibleAttendees.length === 0) {
      console.log(
        `⚠️ No eligible attendees for certificate generation in webinar ${webinarId}`
      );
      return;
    }

    // Generate certificate numbers for eligible attendees if not already generated
    let certificateCount = 0;
    for (const attendance of eligibleAttendees) {
      if (!attendance.certificateNumber) {
        certificateCount++;
        attendance.certificateNumber = `${webinar.title
          .replace(/\s+/g, "")
          .toUpperCase()}-${Date.now()}-${certificateCount
          .toString()
          .padStart(3, "0")}`;
      }
    }

    // Save updated certificate numbers
    await webinar.save();

    // Option A: Queue-based async generation (preferred for scale)
    try {
      const attendeesList = eligibleAttendees.map((a) => ({
        userId:
          (a.userId as any)._id?.toString?.() || (a.userId as any).toString?.(),
        name: `${(a.userId as any)?.firstName || ""} ${
          (a.userId as any)?.lastName || ""
        }`.trim(),
        email: (a.userId as any)?.email,
        totalDuration: a.totalDuration,
        joinTime: a.joinTime || new Date(),
      }));

      if (process.env.CERT_USE_QUEUE !== "false") {
        await addBatchCertificateJob(webinarId, attendeesList, {
          batchSize: 10,
          delayBetweenJobs: 500,
          priority: "normal",
        });
        console.log(
          `Queued batch certificate generation for webinar ${webinarId}`
        );
        return;
      }
    } catch (queueError) {
      console.warn(
        "Queue unavailable, falling back to inline generation:",
        queueError
      );
    }

    // Option B: Inline generation (simple fallback)
    const results: any[] = [];
    for (const attendance of eligibleAttendees) {
      try {
        const user = attendance.userId as any;
        if (!user || !user.email) {
          console.log(
            `Skipping certificate for user ${attendance.userId} - no email found`
          );
          continue;
        }

        // Prepare certificate data
        const certificateData: CertificateData = {
          attendeeName: `${user.firstName} ${user.lastName}`.trim(),
          webinarTitle: webinar.title,
          completionDate: new Date().toISOString(),
          certificateNumber: attendance.certificateNumber || "N/A",
          customFields: {
            webinar_date: new Date(webinar.date).toLocaleDateString(),
            host_name: webinar.hostId
              ? `${(webinar.hostId as any).firstName} ${
                  (webinar.hostId as any).lastName
                }`
              : "Unknown Host",
          },
        };

        // Generate certificate
        const result = await generateCertificate({
          webinar,
          certificateData,
          userId: user._id.toString(),
          uploadToCloudinary: true,
        });

        if (result.success) {
          // Send email with certificate IMMEDIATELY
          console.log(`📧 Sending certificate email to ${user.email}...`);
          await sendCertificateEmail({
            to: user.email,
            recipientName: certificateData.attendeeName,
            webinarTitle: webinar.title,
            certificateNumber: attendance.certificateNumber || "N/A",
            certificateAttachment: result.cloudinaryUrl,
          });

          // Send in-app notification
          try {
            await createNotification(
              user._id.toString(),
              `🎓 Your certificate for "${webinar.title}" has been sent to your email!`,
              `/webinars/${webinarId}`,
              "success",
              "Certificate Issued",
              false // Don't send another email since we already sent the certificate
            );
          } catch (notifError) {
            console.warn(`Failed to send notification to ${user.email}:`, notifError);
          }

          results.push({
            userId: user._id,
            email: user.email,
            status: "sent",
            certificateUrl: result.cloudinaryUrl,
          });

          console.log(
            `✅ Certificate generated and emailed successfully to ${user.email}`
          );
        } else {
          throw new Error(`Certificate generation failed: ${result.error}`);
        }
      } catch (error) {
        const user = attendance.userId as any;
        console.error(
          `Failed to generate certificate for user ${user?.email}:`,
          error
        );
        results.push({
          userId: attendance.userId,
          email: user?.email || "unknown",
          status: "failed",
          error: (error as Error).message,
        });
      }
    }

    console.log(`Certificate generation completed for webinar ${webinarId}:`, {
      total: eligibleAttendees.length,
      sent: results.filter((r) => r.status === "sent").length,
      failed: results.filter((r) => r.status === "failed").length,
    });
  } catch (error) {
    console.error(
      `Error in certificate generation for webinar ${webinarId}:`,
      error
    );
  }
};

export const addHostToWebinar = async (req: Request, res: Response) => {
  try {
    const { id } = req.params; // webinar id
    const { userIdToAdd } = req.body; // user id to add as co-host
    const userId = req.user?.id;

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, msg: "Authentication required" });
    }
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(userIdToAdd)) {
      return res
        .status(400)
        .json({ success: false, msg: "Invalid webinar or user ID" });
    }
    const webinar = await WebinarModel.findById(id);
    if (!webinar) {
      return res.status(404).json({ success: false, msg: "Webinar not found" });
    }
    // Only main host can add co-hosts
    if (webinar.hostId.toString() !== userId) {
      return res
        .status(403)
        .json({ success: false, msg: "Only the main host can add co-hosts" });
    }
    // Prevent duplicate
    if (webinar.presenters.includes(userIdToAdd)) {
      return res
        .status(400)
        .json({ success: false, msg: "User is already a co-host" });
    }
    webinar.presenters.push(userIdToAdd);
    await webinar.save();
    res.json({ success: true, msg: "Co-host added successfully", webinar });
  } catch (error) {
    console.error("Error adding co-host:", error);
    res.status(500).json({ success: false, msg: "Failed to add co-host" });
  }
};

export const addModeratorToWebinar = async (req: Request, res: Response) => {
  try {
    const { id } = req.params; // webinar id
    const { userIdToAdd } = req.body; // user id to add as moderator
    const userId = req.user?.id;

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, msg: "Authentication required" });
    }
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(userIdToAdd)) {
      return res
        .status(400)
        .json({ success: false, msg: "Invalid webinar or user ID" });
    }
    const webinar = await WebinarModel.findById(id);
    if (!webinar) {
      return res.status(404).json({ success: false, msg: "Webinar not found" });
    }
    // Only main host can add moderators
    if (webinar.hostId.toString() !== userId) {
      return res
        .status(403)
        .json({ success: false, msg: "Only the main host can add moderators" });
    }
    // Prevent duplicate
    if (webinar.moderators.includes(userIdToAdd)) {
      return res
        .status(400)
        .json({ success: false, msg: "User is already a moderator" });
    }
    webinar.moderators.push(userIdToAdd);
    await webinar.save();
    res.json({ success: true, msg: "Moderator added successfully", webinar });
  } catch (error) {
    console.error("Error adding moderator:", error);
    res.status(500).json({ success: false, msg: "Failed to add moderator" });
  }
};

export const createWebinar = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        msg: "Authentication required",
      });
    }

    // Normalize date and time if they exist
    let processedData = { ...req.body };

    if (req.body.date) {
      // Handle ISO date format or any other format and convert to YYYY-MM-DD
      try {
        const dateObj = new Date(req.body.date);
        if (!isNaN(dateObj.getTime())) {
          processedData.date = dateObj.toISOString().split("T")[0]; // Convert to YYYY-MM-DD
        }
      } catch (e) {
        console.warn("Could not parse date:", req.body.date);
      }
    }

    if (req.body.time) {
      // Ensure time is in HH:MM format
      try {
        const timeStr = req.body.time.toString();
        // If time includes seconds, remove them
        if (timeStr.includes(":") && timeStr.split(":").length >= 2) {
          const [hours, minutes] = timeStr.split(":");
          processedData.time = `${hours.padStart(2, "0")}:${minutes.padStart(
            2,
            "0"
          )}`;
        }
      } catch (e) {
        console.warn("Could not parse time:", req.body.time);
      }
    } else if (req.body.date && req.body.date.includes("T")) {
      // Extract time from ISO date string if time is not provided separately
      try {
        const dateObj = new Date(req.body.date);
        if (!isNaN(dateObj.getTime())) {
          const hours = dateObj.getHours().toString().padStart(2, "0");
          const minutes = dateObj.getMinutes().toString().padStart(2, "0");
          processedData.time = `${hours}:${minutes}`;
          processedData.date = dateObj.toISOString().split("T")[0];
        }
      } catch (e) {
        console.warn("Could not extract time from date:", req.body.date);
      }
    }

    console.log("Original data:", { date: req.body.date, time: req.body.time });
    console.log("Processed data:", {
      date: processedData.date,
      time: processedData.time,
    });

    // Log certification data being saved
    console.log("Certification data being saved:", {
      hasCertification: processedData.hasCertification,
      certificateTemplate: processedData.certificateTemplate,
      certificateConfig: processedData.certificateConfig,
    });

    // Sanitize HTML content from rich text editor
    if (processedData.agenda) {
      processedData.agenda = sanitizeHtml(processedData.agenda);
    }

    // Any authenticated user can create a webinar and will be the host
    const newWebinar = new WebinarModel({
      ...processedData,
      hostId: userId,
      enrolledUsers: [userId],
    });

    await newWebinar.save();

    console.log("Saved webinar certification data:", {
      hasCertification: newWebinar.hasCertification,
      certificateTemplate: newWebinar.certificateTemplate,
      certificateConfig: newWebinar.certificateConfig,
    });

    // Initialize analytics for the new webinar
    try {
      await initializeWebinarAnalytics(
        (newWebinar._id as Types.ObjectId).toString()
      );
    } catch (analyticsError) {
      logger.error(
        "Failed to initialize analytics for webinar:",
        analyticsError
      );
      // Continue without failing the webinar creation
    }

    res.status(201).json({
      success: true,
      msg: "Webinar created successfully. You are the host.",
      webinar: newWebinar,
    });
  } catch (error) {
    console.error("Error creating webinar:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to create webinar",
      error:
        process.env.NODE_ENV === "development"
          ? (error as Error).message
          : undefined,
    });
  }
};

export const getWebinar = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid webinar ID",
      });
    }

    const webinar = await WebinarModel.findById(id)
      .populate("hostId", "firstName lastName email")
      .populate("presenters", "firstName lastName email")
      .populate("moderators", "firstName lastName email");

    if (!webinar) {
      return res.status(404).json({
        success: false,
        msg: "Webinar not found",
      });
    }

    // Check if webinar is private and user is not authenticated
    if (!webinar.isPublic && !req.user) {
      return res.status(401).json({
        success: false,
        msg: "Login required for this private webinar",
      });
    }

    // Log certification data being returned
    console.log("Returning webinar certification data:", {
      id: webinar._id,
      hasCertification: webinar.hasCertification,
      certificateTemplate: webinar.certificateTemplate,
      certificateConfig: webinar.certificateConfig,
    });

    res.json({
      success: true,
      webinar,
    });
  } catch (error) {
    console.error("Error fetching webinar:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to get webinar",
    });
  }
};

/**
 * @deprecated Use updateWebinarAdmin for admin operations
 * Legacy webinar update function - maintained for backward compatibility
 */
export const updateWebinar = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        msg: "Authentication required",
      });
    }

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid webinar ID",
      });
    }

    const webinar = await WebinarModel.findById(id).populate("enrolledUsers");

    if (!webinar) {
      return res.status(404).json({
        success: false,
        msg: "Webinar not found",
      });
    }

    // Only host or admin can update
    if (webinar.hostId.toString() !== userId && req.user?.role !== "Admin") {
      return res.status(403).json({
        success: false,
        msg: "Unauthorized: Only host or admin can update this webinar",
      });
    }

    // EDGE CASE 1: Check if webinar is currently live
    const now = new Date();
    const webinarDateTime = combineDateTime(webinar.date, webinar.time);
    const isLive = webinar.status === "live";
    const hasStarted = webinarDateTime && now >= new Date(webinarDateTime);

    // EDGE CASE 2: Validate paid webinar changes
    if (req.body.isPaid !== undefined || req.body.price !== undefined) {
      const enrolledCount = webinar.enrolledUsers?.length || 0;
      
      // Prevent changing payment status if users already enrolled
      if (enrolledCount > 0 && req.body.isPaid !== webinar.isPaid) {
        return res.status(400).json({
          success: false,
          msg: `Cannot change payment status - ${enrolledCount} user(s) already enrolled`,
        });
      }

      // Validate price if marking as paid
      if (req.body.isPaid === true) {
        const price = req.body.price !== undefined ? parseFloat(req.body.price.toString()) : webinar.price;
        if (!price || price <= 0) {
          return res.status(400).json({
            success: false,
            msg: "Price must be greater than 0 for paid webinars",
          });
        }
      }
    }

    // EDGE CASE 3: Validate max participants
    if (req.body.maxParticipants !== undefined) {
      const newMax = parseInt(req.body.maxParticipants);
      const enrolledCount = webinar.enrolledUsers?.length || 0;
      
      if (newMax < enrolledCount) {
        return res.status(400).json({
          success: false,
          msg: `Cannot reduce max participants to ${newMax} - ${enrolledCount} user(s) already enrolled`,
        });
      }
    }

    // EDGE CASE 4: Prevent critical changes to live webinars
    if (isLive && (req.body.date || req.body.time || req.body.youtubeLiveURL)) {
      return res.status(400).json({
        success: false,
        msg: "Cannot change date, time, or YouTube URL while webinar is live",
      });
    }

    // EDGE CASE 5: Validate presenters and moderators exist
    if (req.body.presenters && req.body.presenters.length > 0) {
      for (const presenterId of req.body.presenters) {
        if (!Types.ObjectId.isValid(presenterId)) {
          return res.status(400).json({
            success: false,
            msg: `Invalid presenter ID: ${presenterId}`,
          });
        }
      }
    }

    if (req.body.moderators && req.body.moderators.length > 0) {
      for (const moderatorId of req.body.moderators) {
        if (!Types.ObjectId.isValid(moderatorId)) {
          return res.status(400).json({
            success: false,
            msg: `Invalid moderator ID: ${moderatorId}`,
          });
        }
      }
    }

    // Normalize date and time if they exist in the update
    let processedData = { ...req.body };

    if (req.body.date) {
      // Handle ISO date format or any other format and convert to YYYY-MM-DD
      try {
        const dateObj = new Date(req.body.date);
        if (!isNaN(dateObj.getTime())) {
          processedData.date = dateObj.toISOString().split("T")[0]; // Convert to YYYY-MM-DD
        }
      } catch (e) {
        console.warn("Could not parse date:", req.body.date);
      }
    }

    if (req.body.time) {
      // Ensure time is in HH:MM format
      try {
        const timeStr = req.body.time.toString();
        // If time includes seconds, remove them
        if (timeStr.includes(":") && timeStr.split(":").length >= 2) {
          const [hours, minutes] = timeStr.split(":");
          processedData.time = `${hours.padStart(2, "0")}:${minutes.padStart(
            2,
            "0"
          )}`;
        }
      } catch (e) {
        console.warn("Could not parse time:", req.body.time);
      }
    } else if (req.body.date && req.body.date.includes("T")) {
      // Extract time from ISO date string if time is not provided separately
      try {
        const dateObj = new Date(req.body.date);
        if (!isNaN(dateObj.getTime())) {
          const hours = dateObj.getHours().toString().padStart(2, "0");
          const minutes = dateObj.getMinutes().toString().padStart(2, "0");
          processedData.time = `${hours}:${minutes}`;
          processedData.date = dateObj.toISOString().split("T")[0];
        }
      } catch (e) {
        console.warn("Could not extract time from date:", req.body.date);
      }
    }

    // EDGE CASE 6: Validate date is not in the past for new updates
    if (req.body.date || req.body.time) {
      const newDate = processedData.date || webinar.date;
      const newTime = processedData.time || webinar.time;
      const newDateTime = combineDateTime(newDate, newTime);
      
      if (newDateTime && new Date(newDateTime) < now && !hasStarted) {
        return res.status(400).json({
          success: false,
          msg: "Cannot set webinar date/time in the past",
        });
      }
    }

    console.log("Update - Original data:", {
      date: req.body.date,
      time: req.body.time,
    });
    console.log("Update - Processed data:", {
      date: processedData.date,
      time: processedData.time,
    });

    // Log certification data being updated
    console.log("🔄 UPDATE - Certification data being updated:", {
      hasCertification: processedData.hasCertification,
      certificateTemplate: processedData.certificateTemplate,
      certificateConfig: processedData.certificateConfig,
    });

    // Sanitize HTML content from rich text editor
    if (processedData.agenda) {
      processedData.agenda = sanitizeHtml(processedData.agenda);
    }

    // EDGE CASE 7: Clean up empty strings for URLs
    if (processedData.youtubeLiveURL === "") {
      processedData.youtubeLiveURL = undefined;
    }
    if (processedData.paymentUrl === "") {
      processedData.paymentUrl = undefined;
    }

    // EDGE CASE 8: Handle resources field - don't allow direct update of embedded documents
    // Resources should be managed through dedicated upload/delete endpoints
    if (processedData.resources) {
      console.warn("⚠️ Skipping resources update - use dedicated resource management endpoints");
      delete processedData.resources;
    }

    // Update webinar fields
    Object.assign(webinar, processedData);
    await webinar.save();

    console.log("🔄 UPDATE - Saved webinar certification data:", {
      hasCertification: webinar.hasCertification,
      certificateTemplate: webinar.certificateTemplate,
      certificateConfig: webinar.certificateConfig,
    });

    res.json({
      success: true,
      msg: "Webinar updated successfully",
      webinar,
    });
  } catch (error) {
    console.error("Error updating webinar:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to update webinar",
      error:
        process.env.NODE_ENV === "development"
          ? (error as Error).message
          : undefined,
    });
  }
};

export const deleteWebinar = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        msg: "Authentication required",
      });
    }

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid webinar ID",
      });
    }

    const webinar = await WebinarModel.findById(id);

    if (!webinar) {
      return res.status(404).json({
        success: false,
        msg: "Webinar not found",
      });
    }

    // Only host or admin can delete
    if (webinar.hostId.toString() !== userId && req.user?.role !== "Admin") {
      return res.status(403).json({
        success: false,
        msg: "Unauthorized: Only host or admin can delete this webinar",
      });
    }

    await WebinarModel.findByIdAndDelete(id);

    res.json({
      success: true,
      msg: "Webinar deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting webinar:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to delete webinar",
    });
  }
};

// Get webinars for hosts and admins
export const listWebinars = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        msg: "Authentication required",
      });
    }
    // Any authenticated user can see all webinars
    const webinars = await WebinarModel.find()
      .select(
        "title description category date time youtubeLiveURL tags isPaid price currency presenters moderators enrolledUsers"
      )
      .populate("hostId", "firstName lastName email")
      .populate("presenters", "firstName lastName email")
      .populate("moderators", "firstName lastName email")
      .sort({ createdAt: -1 });
    res.json({
      success: true,
      webinars,
    });
  } catch (error) {
    console.error("Error fetching webinars:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to fetch webinars",
    });
  }
};

export const checkIsPaid = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id: webinarId } = req.params;

    // Validate user authentication
    if (!userId) {
      return res.status(401).json({
        success: false,
        msg: "Authentication required",
      });
    }

    // Validate webinar ID format
    if (!Types.ObjectId.isValid(webinarId)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid webinar ID format",
      });
    }

    // Find the webinar
    const webinar = await WebinarModel.findById(webinarId);
    if (!webinar) {
      return res.status(404).json({
        success: false,
        msg: "Webinar not found",
      });
    }

    if (webinar.isPaid) {
      return res.status(200).json({
        success: true,
        isPaid: true,
        msg: "Webinar not found",
      });
    } else {
      return res.status(200).json({
        success: true,
        isPaid: false,
        msg: "Webinar not found",
      });
    }
  } catch (err) {}
};

export const enrollInWebinar = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id: webinarId } = req.params;

    // Validate user authentication
    if (!userId) {
      return res.status(401).json({
        success: false,
        msg: "Authentication required",
      });
    }

    // Validate webinar ID format
    if (!Types.ObjectId.isValid(webinarId)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid webinar ID format",
      });
    }

    // Find the webinar
    const webinar = await WebinarModel.findById(webinarId);
    if (!webinar) {
      return res.status(404).json({
        success: false,
        msg: "Webinar not found",
      });
    }

    // Check if webinar has ended
    if (webinar.status === "ended") {
      return res.status(400).json({
        success: false,
        msg: "Cannot enroll in a webinar that has already ended",
      });
    }

    // Check if user is already enrolled
    const isEnrolled = webinar.enrolledUsers.some(
      (id) => id.toString() === userId
    );
    if (isEnrolled) {
      return res.status(400).json({
        success: false,
        msg: "You are already enrolled in this webinar",
      });
    }

    // Enroll user (update only the enrolledUsers field to avoid validation on date/time)
    await WebinarModel.findByIdAndUpdate(
      webinarId,
      { $addToSet: { enrolledUsers: new Types.ObjectId(userId) } },
      { new: true, runValidators: false } // Skip validation to avoid date/time format issues
    );

    // Get user details for email notification
    const UserModel = (await import("../models/User.model")).default;
    const user = await UserModel.findById(userId);

    // Send email confirmation if user exists
    if (user?.email) {
      try {
        const { sendMail } = await import("../utils/mailer");
        await sendMail({
          to: user.email,
          subject: `Registration Confirmed: ${webinar.title}`,
          html: `
            <!DOCTYPE html>
            <html lang="en">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Webinar Registration Confirmation</title>
            </head>
            <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="text-align: center; margin-bottom: 20px;">
                <img src="https://changenetworks.com/logo.png" alt="Change Networks Logo" style="max-width: 180px; height: auto;">
              </div>
              
              <div style="background-color: #f0fff4; border-radius: 8px; padding: 25px; margin-bottom: 25px; border-top: 5px solid #48bb78;">
                <div style="text-align: center; margin-bottom: 20px;">
                  <img src="https://changenetworks.com/confirmation-check.png" alt="Confirmation" style="width: 70px; height: auto;">
                </div>
                <h2 style="color: #2f855a; margin-top: 0; text-align: center;">Registration Confirmed</h2>
                <p>Hello ${user.firstName || "there"},</p>
                <p>Thank you for registering for our upcoming webinar. Your spot has been reserved!</p>
              </div>
              
              <div style="background-color: #ffffff; border-radius: 8px; padding: 25px; margin-bottom: 25px; border: 1px solid #e2e8f0; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
                <h3 style="color: #2d3748; margin-top: 0; border-bottom: 1px solid #edf2f7; padding-bottom: 10px;">${
                  webinar.title
                }</h3>
                
                <table width="100%" cellpadding="10" cellspacing="0" style="border-collapse: collapse; margin-top: 15px;">
                  <tr>
                    <td width="30%" style="color: #4a5568; font-weight: 600;">Date:</td>
                    <td style="color: #2d3748;">${new Date(
                      webinar.date
                    ).toLocaleDateString("en-US", {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}</td>
                  </tr>
                  <tr>
                    <td width="30%" style="color: #4a5568; font-weight: 600;">Time:</td>
                    <td style="color: #2d3748;">${new Date(
                      webinar.date
                    ).toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    })}</td>
                  </tr>
                  <tr>
                    <td width="30%" style="color: #4a5568; font-weight: 600;">Timezone:</td>
                    <td style="color: #2d3748;">${
                      webinar.timezone || "UTC"
                    }</td>
                  </tr>
                  ${
                    webinar.category
                      ? `
                  <tr>
                    <td width="30%" style="color: #4a5568; font-weight: 600;">Category:</td>
                    <td style="color: #2d3748;">${webinar.category}</td>
                  </tr>
                  `
                      : ""
                  }
                </table>
                
                ${
                  webinar.description
                    ? `
                <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #edf2f7;">
                  <h4 style="color: #4a5568; margin-top: 0;">About this webinar:</h4>
                  <p style="color: #2d3748; margin-bottom: 0;">${webinar.description}</p>
                </div>
                `
                    : ""
                }
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${
                  process.env.FRONTEND_URL || "https://changenetworks.com"
                }/webinars/${webinar._id}" 
                  style="background-color: #48bb78; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; font-weight: 500; display: inline-block;">
                  Add to Calendar
                </a>
              </div>
              
              <div style="background-color: #f7fafc; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
                <h4 style="color: #4a5568; margin-top: 0;">What to expect:</h4>
                <ul style="padding-left: 20px; margin-bottom: 0; color: #4a5568;">
                  <li>Expert insights from our speakers</li>
                  <li>Interactive Q&A sessions</li>
                  <li>Valuable resources to download</li>
                  <li>Networking opportunities with peers</li>
                </ul>
              </div>
              
              <div style="color: #718096; font-size: 14px; text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
                <p>We're looking forward to seeing you at the event!</p>
                <p style="margin: 5px 0;">Best regards,<br>The Change Networks Team</p>
              </div>
            </body>
            </html>
          `,
        });
        logger.info(`Enrollment confirmation email sent to: ${user.email}`);
      } catch (emailError) {
        logger.error("Error sending confirmation email:", {
          error: emailError,
        });
        // Don't fail enrollment if email fails
      }
    }

    // Create notification for the user
    try {
      await createNotification(
        userId,
        `You have successfully enrolled in: ${webinar.title}`,
        `/webinars/${webinar._id}`,
        "success",
        "Enrollment Successful",
        true // Send email notification
      );
    } catch (notificationError) {
      console.error("Error creating notification:", notificationError);
      // Don't fail enrollment if notification fails
    }

    // Return success response
    res.json({
      success: true,
      msg: `Successfully enrolled in webinar: "${webinar.title}"`,
      webinarDetails: {
        id: webinar._id,
        title: webinar.title,
        date: webinar.date || "TBA",
        time: webinar.time || "TBA",
        timezone: webinar.timezone || "UTC",
      },
    });
  } catch (error) {
    console.error("Error in enrollInWebinar:", error);
    res.status(500).json({
      error: error as Error,
      success: false,
      msg: "Failed to enroll in webinar. Please try again.",
    });
  }
};

export const getEnrolledUsers = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId) {
      return res.status(401).json({
        success: false,
        msg: "Authentication required",
      });
    }

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid webinar ID",
      });
    }

    const webinar = await WebinarModel.findById(id).populate(
      "enrolledUsers",
      "firstName lastName email"
    );

    if (!webinar) {
      return res.status(404).json({
        success: false,
        msg: "Webinar not found",
      });
    }

    // Only host or admin can view enrolled users
    if (webinar.hostId.toString() !== userId && userRole !== "Admin") {
      return res.status(403).json({
        success: false,
        msg: "Unauthorized: Only host or admin can view enrolled users",
      });
    }

    res.json({
      success: true,
      enrolledUsers: webinar.enrolledUsers,
      totalEnrolled: webinar.enrolledUsers.length,
      maxParticipants: webinar.maxParticipants,
    });
  } catch (error) {
    console.error("Error fetching enrolled users:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to fetch enrolled users",
    });
  }
};

export const getEnrolledWebinars = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        msg: "Authentication required",
      });
    }

    const webinars = await WebinarModel.find({
      enrolledUsers: new Types.ObjectId(userId),
    })
      .populate("hostId", "firstName lastName email")
      .populate("presenters", "firstName lastName email")
      .populate("moderators", "firstName lastName email")
      .sort({ date: 1 });

    // Separate upcoming and past webinars
    const now = new Date();
    const upcomingWebinars = webinars.filter((webinar) => {
      const dateTime = combineDateTime(webinar.date, webinar.time);
      return dateTime !== null && dateTime >= now;
    });

    const pastWebinars = webinars.filter((webinar) => {
      const dateTime = combineDateTime(webinar.date, webinar.time);
      return dateTime !== null && dateTime < now;
    });

    res.json({
      success: true,
      webinars: webinars,
      data: webinars, // Also include as 'data' for consistency with frontend expectations
    });
  } catch (error) {
    console.error("Error fetching enrolled webinars:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to fetch enrolled webinars",
    });
  }
};

export const getCreatedWebinars = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        msg: "Authentication required",
      });
    }

    const webinars = await WebinarModel.find({
      hostId: new Types.ObjectId(userId),
    })
      .populate("hostId", "firstName lastName email")
      .populate("presenters", "firstName lastName email")
      .populate("moderators", "firstName lastName email")
      .sort({ date: 1 });

    // Separate upcoming and past webinars
    const now = new Date();

    res.json({
      success: true,
      webinars: webinars,
      data: webinars, // Also include as 'data' for consistency with frontend expectations
    });
  } catch (error) {
    console.error("Error fetching enrolled webinars:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to fetch enrolled webinars",
    });
  }
};

export const endWebinar = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId) {
      return res.status(401).json({
        success: false,
        msg: "Authentication required",
      });
    }

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid webinar ID",
      });
    }

    const webinar = await WebinarModel.findById(id);

    if (!webinar) {
      return res.status(404).json({
        success: false,
        msg: "Webinar not found",
      });
    }

    // Check if user has permission to end the webinar
    // Admin, Host, or Presenter can end the webinar
    const isHost = webinar.hostId.toString() === userId;
    const isPresenter = webinar.presenters.some(
      (presenterId) => presenterId.toString() === userId
    );
    const isAdmin = userRole === "Admin";

    if (!isAdmin && !isHost && !isPresenter) {
      return res.status(403).json({
        success: false,
        msg: "Unauthorized: Only Admin, Host, or Presenters can end this webinar",
      });
    }

    // Check if webinar is already ended
    if (webinar.status === "ended") {
      return res.status(400).json({
        success: false,
        msg: "Webinar is already ended",
      });
    }

    // Update webinar status to ended with timestamp
    const endedAt = new Date();
    const updatedWebinar = await WebinarModel.findByIdAndUpdate(
      id,
      {
        status: "ended",
        endedAt: endedAt,
      },
      { new: true, runValidators: false }
    )
      .populate("hostId", "firstName lastName email")
      .populate("presenters", "firstName lastName email")
      .populate("moderators", "firstName lastName email")
      .populate("enrolledUsers", "firstName lastName email");

    if (!updatedWebinar) {
      return res.status(404).json({
        success: false,
        msg: "Failed to update webinar",
      });
    }

    console.log(`🏁 Webinar ${id} ended at ${endedAt.toISOString()}`);

    // Post-webinar processes (run asynchronously - don't block response)
    setImmediate(async () => {
      try {
        // 1. Generate and send certificates IMMEDIATELY
        if (updatedWebinar.hasCertification) {
          console.log(`📜 Starting immediate certificate generation for webinar ${id}`);
          try {
            await generateCertificatesAfterWebinarEnd(id);
            console.log(
              `✅ Certificate generation and email sending completed for webinar ${id}`
            );
          } catch (certError) {
            console.error(
              `❌ Certificate generation failed for webinar ${id}:`,
              certError
            );
          }
        } else {
          console.log(`ℹ️ Certificates not enabled for webinar ${id} - skipping generation`);
        }

        // 2. Save final analytics
        try {
          const WebinarAnalyticsModel =
            require("../models/WebinarAnalytics.model").default;
          await WebinarAnalyticsModel.findOneAndUpdate(
            { webinarId: new Types.ObjectId(id) },
            {
              $set: {
                "overview.endTime": endedAt,
                "overview.duration": Math.floor(
                  (endedAt.getTime() -
                    new Date(updatedWebinar.date).getTime()) /
                    60000
                ), // duration in minutes
                "overview.status": "completed",
                lastUpdated: new Date(),
              },
            },
            { upsert: true }
          );
          console.log(`✅ Analytics finalized for webinar ${id}`);
        } catch (analyticsError) {
          console.error(
            `❌ Analytics finalization failed for webinar ${id}:`,
            analyticsError
          );
        }

        // 3. Send thank-you notifications to all attendees
        try {
          const attendeeIds = updatedWebinar.enrolledUsers.map((user: any) =>
            user._id.toString()
          );

          for (const attendeeId of attendeeIds) {
            await createNotification(
              attendeeId,
              `Thank you for attending "${updatedWebinar.title}"! ${
                updatedWebinar.hasCertification
                  ? "Your certificate will be sent shortly."
                  : ""
              }`,
              `/webinars/${id}`,
              "success",
              "Webinar Completed",
              true // Send email notification
            );
          }
          console.log(
            `✅ Thank-you notifications sent to ${attendeeIds.length} attendees`
          );
        } catch (notificationError) {
          console.error(
            `❌ Failed to send notifications for webinar ${id}:`,
            notificationError
          );
        }

        // 4. Emit socket event to all connected users
        try {
          const { getSocketInstance } = require("../utils/socketService");
          const io = getSocketInstance();
          if (io) {
            io.to(`webinar_${id}`).emit("webinar_ended", {
              webinarId: id,
              title: updatedWebinar.title,
              endedAt: endedAt,
              message: "This webinar has ended. Thank you for attending!",
            });
            console.log(`✅ Webinar ended event broadcasted for ${id}`);
          }
        } catch (socketError) {
          console.error(
            `❌ Failed to broadcast webinar ended event for ${id}:`,
            socketError
          );
        }
      } catch (error) {
        console.error(`❌ Post-webinar processing failed for ${id}:`, error);
      }
    });

    res.json({
      success: true,
      msg: "Webinar ended successfully",
      webinar: updatedWebinar,
    });
  } catch (error) {
    console.error("Error ending webinar:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to end webinar",
    });
  }
};

// Enable certification for a webinar
export const enableCertification = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId) {
      return res.status(401).json({
        success: false,
        msg: "Authentication required",
      });
    }

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid webinar ID",
      });
    }

    const webinar = await WebinarModel.findById(id);

    if (!webinar) {
      return res.status(404).json({
        success: false,
        msg: "Webinar not found",
      });
    }

    // Check if user has permission to modify certification
    const isHost = webinar.hostId.toString() === userId;
    const isPresenter = webinar.presenters.some(
      (presenterId) => presenterId.toString() === userId
    );
    const isAdmin = userRole === "Admin";

    if (!isAdmin && !isHost && !isPresenter) {
      return res.status(403).json({
        success: false,
        msg: "Unauthorized: Only Admin, Host, or Presenters can enable certification",
      });
    }

    // Update webinar to enable certification
    const updatedWebinar = await WebinarModel.findByIdAndUpdate(
      id,
      { hasCertification: true },
      { new: true, runValidators: false }
    );

    res.json({
      success: true,
      msg: "Certification enabled successfully",
      webinar: updatedWebinar,
    });
  } catch (error) {
    console.error("Error enabling certification:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to enable certification",
    });
  }
};

// Update certificate configuration (fields, coordinates, dimensions)
export const updateCertificateConfig = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, msg: "Authentication required" });
    }
    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, msg: "Invalid webinar ID" });
    }

    const webinar = await WebinarModel.findById(id);
    if (!webinar) {
      return res.status(404).json({ success: false, msg: "Webinar not found" });
    }

    const isHost = webinar.hostId.toString() === userId;
    const isPresenter = webinar.presenters.some((p) => p.toString() === userId);
    const isAdmin = userRole === "Admin";
    if (!isAdmin && !isHost && !isPresenter) {
      return res.status(403).json({ success: false, msg: "Unauthorized" });
    }

    const { certificateConfig } = req.body as any;
    const updated = await WebinarModel.findByIdAndUpdate(
      id,
      { certificateConfig, hasCertification: true },
      { new: true, runValidators: false }
    );

    return res.json({
      success: true,
      msg: "Certificate configuration updated",
      webinar: updated,
    });
  } catch (error) {
    console.error("Error updating certificate config:", error);
    return res
      .status(500)
      .json({ success: false, msg: "Failed to update certificate config" });
  }
};

// Upload certificate template
export const uploadCertificateTemplate = async (
  req: Request,
  res: Response
) => {
  try {
    const { id } = req.params;
    const { certificateTemplate, certificateConfig } = req.body;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId) {
      return res.status(401).json({
        success: false,
        msg: "Authentication required",
      });
    }

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid webinar ID",
      });
    }

    const webinar = await WebinarModel.findById(id);

    if (!webinar) {
      return res.status(404).json({
        success: false,
        msg: "Webinar not found",
      });
    }

    // Check if user has permission to upload certificate template
    const isHost = webinar.hostId.toString() === userId;
    const isPresenter = webinar.presenters.some(
      (presenterId) => presenterId.toString() === userId
    );
    const isAdmin = userRole === "Admin";

    if (!isAdmin && !isHost && !isPresenter) {
      return res.status(403).json({
        success: false,
        msg: "Unauthorized: Only Admin, Host, or Presenters can upload certificate template",
      });
    }

    // Update webinar with certificate template
    const updateData: any = {
      certificateTemplate,
      hasCertification: true,
    };

    if (certificateConfig) {
      updateData.certificateConfig = certificateConfig;
    }

    const updatedWebinar = await WebinarModel.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: false }
    );

    res.json({
      success: true,
      msg: "Certificate template uploaded successfully",
      webinar: updatedWebinar,
    });
  } catch (error) {
    console.error("Error uploading certificate template:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to upload certificate template",
    });
  }
};

// Track user attendance (join/leave)
export const trackAttendance = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { action } = req.body; // 'join' or 'leave'
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        msg: "Authentication required",
      });
    }

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid webinar ID",
      });
    }

    const webinar = await WebinarModel.findById(id);

    if (!webinar) {
      return res.status(404).json({
        success: false,
        msg: "Webinar not found",
      });
    }

    if (action === "join") {
      // Check if user already has an active session
      const existingAttendance = webinar.attendedUsers.find(
        (attendance) =>
          attendance.userId.toString() === userId && !attendance.leaveTime
      );

      if (existingAttendance) {
        return res.status(400).json({
          success: false,
          msg: "User already has an active session",
        });
      }

      // Add new attendance record
      webinar.attendedUsers.push({
        userId: new Types.ObjectId(userId),
        joinTime: new Date(),
        totalDuration: 0,
      });
    } else if (action === "leave") {
      // Find the active session and update leave time
      const activeAttendance = webinar.attendedUsers.find(
        (attendance) =>
          attendance.userId.toString() === userId && !attendance.leaveTime
      );

      if (activeAttendance) {
        activeAttendance.leaveTime = new Date();
        const durationMs =
          activeAttendance.leaveTime.getTime() -
          activeAttendance.joinTime.getTime();
        activeAttendance.totalDuration = Math.floor(durationMs / 60000); // Convert to minutes
      }
    }

    await webinar.save();

    res.json({
      success: true,
      msg: `Attendance ${action} recorded successfully`,
    });
  } catch (error) {
    console.error("Error tracking attendance:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to track attendance",
    });
  }
};

// Generate and send certificates after webinar ends
export const generateCertificates = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId) {
      return res.status(401).json({
        success: false,
        msg: "Authentication required",
      });
    }

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid webinar ID",
      });
    }

    const webinar = await WebinarModel.findById(id)
      .populate("hostId", "firstName lastName email")
      .populate("attendedUsers.userId", "firstName lastName email");

    if (!webinar) {
      return res.status(404).json({
        success: false,
        msg: "Webinar not found",
      });
    }

    // Check if user has permission to generate certificates
    const isHost = webinar.hostId.toString() === userId;
    const isPresenter = webinar.presenters.some(
      (presenterId) => presenterId.toString() === userId
    );
    const isAdmin = userRole === "Admin";

    if (!isAdmin && !isHost && !isPresenter) {
      return res.status(403).json({
        success: false,
        msg: "Unauthorized: Only Admin, Host, or Presenters can generate certificates",
      });
    }

    if (!webinar.hasCertification || !webinar.certificateTemplate) {
      return res.status(400).json({
        success: false,
        msg: "Certificate template not configured for this webinar",
      });
    }

    if (webinar.status !== "ended") {
      return res.status(400).json({
        success: false,
        msg: "Certificates can only be generated for ended webinars",
      });
    }

    // Filter users who attended for sufficient duration (e.g., at least 50% of webinar)
    const minimumDuration = 30; // Minimum 30 minutes attendance required
    const eligibleAttendees = webinar.attendedUsers.filter(
      (attendance) => attendance.totalDuration >= minimumDuration
    );

    // Generate certificate numbers for eligible attendees
    let certificateCount = 0;
    for (const attendance of eligibleAttendees) {
      if (!attendance.certificateNumber) {
        certificateCount++;
        attendance.certificateNumber = `${webinar.title
          .replace(/\s+/g, "")
          .toUpperCase()}-${Date.now()}-${certificateCount
          .toString()
          .padStart(3, "0")}`;
      }
    }

    await webinar.save();

    // Generate and send certificates immediately
    const emailResults = [];
    for (const attendance of eligibleAttendees) {
      try {
        const user = attendance.userId as any;
        if (!user || !user.email) {
          console.log(
            `Skipping certificate for user ${attendance.userId} - no email found`
          );
          continue;
        }

        // Prepare certificate data
        const certificateData: CertificateData = {
          attendeeName: `${user.firstName} ${user.lastName}`.trim(),
          webinarTitle: webinar.title,
          completionDate: new Date().toISOString(),
          certificateNumber: attendance.certificateNumber || "N/A",
          customFields: {
            webinar_date: new Date(webinar.date).toLocaleDateString(),
            host_name: webinar.hostId
              ? `${(webinar.hostId as any).firstName} ${
                  (webinar.hostId as any).lastName
                }`
              : "Unknown Host",
          },
        };

        // Generate certificate
        const result = await generateCertificate({
          webinar,
          certificateData,
          userId: user._id.toString(),
          uploadToCloudinary: true,
        });

        if (result.success) {
          // Send email with certificate
          await sendCertificateEmail({
            to: user.email,
            recipientName: certificateData.attendeeName,
            webinarTitle: webinar.title,
            certificateNumber: attendance.certificateNumber || "N/A",
            certificateAttachment: result.cloudinaryUrl,
          });

          emailResults.push({
            userId: user._id,
            email: user.email,
            status: "sent",
            certificateUrl: result.cloudinaryUrl,
          });
        } else {
          throw new Error(`Certificate generation failed: ${result.error}`);
        }
      } catch (emailError: any) {
        const user = attendance.userId as any;
        console.error(
          `Failed to generate certificate for user ${user?.email}:`,
          emailError
        );
        emailResults.push({
          userId: attendance.userId,
          email: user?.email || "unknown",
          status: "failed",
          error: emailError?.message || "Unknown error",
        });
      }
    }

    res.json({
      success: true,
      msg: "Certificates generated and sent successfully",
      eligibleAttendees: eligibleAttendees.length,
      emailsSent: emailResults.filter((r) => r.status === "sent").length,
      emailsFailed: emailResults.filter((r) => r.status === "failed").length,
      certificateData: eligibleAttendees.map((attendance) => ({
        userId: attendance.userId,
        certificateNumber: attendance.certificateNumber,
        duration: attendance.totalDuration,
      })),
      emailResults,
    });
  } catch (error) {
    console.error("Error generating certificates:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to generate certificates",
    });
  }
};

// Request certificate for a user (individual certificate request)
export const requestUserCertificate = async (req: Request, res: Response) => {
  try {
    const { id: webinarId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        msg: "Authentication required",
      });
    }

    if (!Types.ObjectId.isValid(webinarId)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid webinar ID",
      });
    }

    // Use SimpleCertificateService to handle the certificate request
    const result = await SimpleCertificateService.requestCertificateForUser(
      userId,
      webinarId
    );

    if (result.success) {
      return res.status(200).json({
        success: true,
        msg: result.message || "Certificate request processed successfully",
        jobId: result.jobId,
      });
    } else {
      return res.status(400).json({
        success: false,
        msg: result.error || "Failed to process certificate request",
      });
    }
  } catch (error) {
    console.error("Error requesting certificate:", error);
    res.status(500).json({
      success: false,
      msg: "Internal server error",
    });
  }
};

// Get user certificate for a webinar
export const getUserCertificate = async (req: Request, res: Response) => {
  try {
    const { id: webinarId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        msg: "Authentication required",
      });
    }

    if (!Types.ObjectId.isValid(webinarId)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid webinar ID",
      });
    }

    // Use SimpleCertificateService to get the certificate
    const result = await SimpleCertificateService.getUserCertificateForWebinar(
      userId,
      webinarId
    );

    if (result.success) {
      return res.status(200).json({
        success: true,
        certificate: result.certificate,
      });
    } else {
      return res.status(404).json({
        success: false,
        msg: result.error || "Certificate not found",
      });
    }
  } catch (error) {
    console.error("Error getting certificate:", error);
    res.status(500).json({
      success: false,
      msg: "Internal server error",
    });
  }
};

// Add attendee to webinar
export const addAttendeeToWebinar = async (req: Request, res: Response) => {
  try {
    const { id } = req.params; // webinar id
    const { name, email, duration } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, msg: "Authentication required" });
    }

    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, msg: "Invalid webinar ID" });
    }

    const webinar = await WebinarModel.findById(id);
    if (!webinar) {
      return res.status(404).json({ success: false, msg: "Webinar not found" });
    }

    // Check if user is host or admin
    const isHost =
      webinar.hostId.toString() === userId ||
      webinar.presenters.some((p) => p.toString() === userId);
    const isAdmin = req.user?.role === "admin";

    if (!isHost && !isAdmin) {
      return res.status(403).json({
        success: false,
        msg: "Only hosts or admins can manage attendees",
      });
    }

    // For manual attendee addition, we'll need to either:
    // 1. Create a user account first, or
    // 2. Store guest attendee info differently
    // For now, let's create a simple guest user approach

    // First check if a user with this email exists
    const UserModel = require("../models/User.model").default;
    let user = await UserModel.findOne({ email });

    if (!user) {
      // Create a guest user for certificate purposes
      user = new UserModel({
        firstName: name.split(" ")[0] || name,
        lastName: name.split(" ").slice(1).join(" ") || "",
        email,
        password: "guest-user-no-login", // They won't be able to login
        role: "User",
        isVerified: false,
      });
      await user.save();
    }

    // Check if attendee already exists
    const existingAttendee = webinar.attendedUsers.find(
      (att) => att.userId.toString() === user._id.toString()
    );
    if (existingAttendee) {
      return res
        .status(400)
        .json({ success: false, msg: "User is already in the attendees list" });
    }

    // Add new attendee
    const newAttendee = {
      userId: user._id,
      joinTime: new Date(),
      leaveTime: new Date(),
      totalDuration: duration || 0,
    };

    webinar.attendedUsers.push(newAttendee);
    await webinar.save();

    // Return the attendee with populated user data
    const populatedWebinar = await WebinarModel.findById(id).populate(
      "attendedUsers.userId",
      "firstName lastName email"
    );
    const addedAttendee = populatedWebinar?.attendedUsers.find(
      (att) => att.userId._id.toString() === user._id.toString()
    );

    if (!populatedWebinar || !addedAttendee) {
      return res
        .status(500)
        .json({ success: false, msg: "Failed to retrieve added attendee" });
    }

    // Type assertion for populated userId
    const populatedUserId = addedAttendee.userId as any;

    res.json({
      success: true,
      msg: "Attendee added successfully",
      attendee: {
        _id: populatedUserId._id,
        name: `${populatedUserId.firstName} ${populatedUserId.lastName}`.trim(),
        email: populatedUserId.email,
        totalDuration: addedAttendee.totalDuration,
        joinTime: addedAttendee.joinTime,
        leaveTime: addedAttendee.leaveTime,
      },
    });
  } catch (error) {
    console.error("Error adding attendee:", error);
    res.status(500).json({ success: false, msg: "Failed to add attendee" });
  }
};

// Remove attendee from webinar
export const removeAttendeeFromWebinar = async (
  req: Request,
  res: Response
) => {
  try {
    const { id, attendeeId } = req.params; // webinar id and attendee id
    const userId = req.user?.id;

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, msg: "Authentication required" });
    }

    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(attendeeId)) {
      return res
        .status(400)
        .json({ success: false, msg: "Invalid webinar or attendee ID" });
    }

    const webinar = await WebinarModel.findById(id);
    if (!webinar) {
      return res.status(404).json({ success: false, msg: "Webinar not found" });
    }

    // Check if user is host or admin
    const isHost =
      webinar.hostId.toString() === userId ||
      webinar.presenters.some((p) => p.toString() === userId);
    const isAdmin = req.user?.role === "admin";

    if (!isHost && !isAdmin) {
      return res.status(403).json({
        success: false,
        msg: "Only hosts or admins can manage attendees",
      });
    }

    // Find and remove attendee by userId (attendeeId is actually the userId)
    const attendeeIndex = webinar.attendedUsers.findIndex(
      (att) => att.userId.toString() === attendeeId
    );
    if (attendeeIndex === -1) {
      return res
        .status(404)
        .json({ success: false, msg: "Attendee not found" });
    }

    webinar.attendedUsers.splice(attendeeIndex, 1);
    await webinar.save();

    res.json({
      success: true,
      msg: "Attendee removed successfully",
    });
  } catch (error) {
    console.error("Error removing attendee:", error);
    res.status(500).json({ success: false, msg: "Failed to remove attendee" });
  }
};

// Update attendee information
export const updateAttendeeInWebinar = async (req: Request, res: Response) => {
  try {
    const { id, attendeeId } = req.params; // webinar id and attendee id (userId)
    const { name, email, duration } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, msg: "Authentication required" });
    }

    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(attendeeId)) {
      return res
        .status(400)
        .json({ success: false, msg: "Invalid webinar or attendee ID" });
    }

    const webinar = await WebinarModel.findById(id);
    if (!webinar) {
      return res.status(404).json({ success: false, msg: "Webinar not found" });
    }

    // Check if user is host or admin
    const isHost =
      webinar.hostId.toString() === userId ||
      webinar.presenters.some((p) => p.toString() === userId);
    const isAdmin = req.user?.role === "admin";

    if (!isHost && !isAdmin) {
      return res.status(403).json({
        success: false,
        msg: "Only hosts or admins can manage attendees",
      });
    }

    // Find attendee in webinar
    const attendee = webinar.attendedUsers.find(
      (att) => att.userId.toString() === attendeeId
    );
    if (!attendee) {
      return res
        .status(404)
        .json({ success: false, msg: "Attendee not found" });
    }

    // Update duration in webinar record
    if (duration !== undefined) {
      attendee.totalDuration = duration;
    }

    // Update user info if name or email changed
    if (name || email) {
      const UserModel = require("../models/User.model").default;
      const user = await UserModel.findById(attendeeId);
      if (user) {
        if (name) {
          const nameParts = name.split(" ");
          user.firstName = nameParts[0] || "";
          user.lastName = nameParts.slice(1).join(" ") || "";
        }
        if (email) {
          // Check if email is already used by another user
          const existingUser = await UserModel.findOne({
            email,
            _id: { $ne: attendeeId },
          });
          if (existingUser) {
            return res.status(400).json({
              success: false,
              msg: "Email is already in use by another user",
            });
          }
          user.email = email;
        }
        await user.save();
      }
    }

    await webinar.save();

    // Return updated attendee data
    const populatedWebinar = await WebinarModel.findById(id).populate(
      "attendedUsers.userId",
      "firstName lastName email"
    );
    const updatedAttendee = populatedWebinar?.attendedUsers.find(
      (att) => att.userId._id.toString() === attendeeId
    );

    if (!populatedWebinar || !updatedAttendee) {
      return res
        .status(500)
        .json({ success: false, msg: "Failed to retrieve updated attendee" });
    }

    // Type assertion for populated userId
    const populatedUserId = updatedAttendee.userId as any;

    res.json({
      success: true,
      msg: "Attendee updated successfully",
      attendee: {
        _id: populatedUserId._id,
        name: `${populatedUserId.firstName} ${populatedUserId.lastName}`.trim(),
        email: populatedUserId.email,
        totalDuration: updatedAttendee.totalDuration,
        joinTime: updatedAttendee.joinTime,
        leaveTime: updatedAttendee.leaveTime,
      },
    });
  } catch (error) {
    console.error("Error updating attendee:", error);
    res.status(500).json({ success: false, msg: "Failed to update attendee" });
  }
};

// Get attendees for a webinar
export const getWebinarAttendees = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, msg: "Authentication required" });
    }

    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, msg: "Invalid webinar ID" });
    }

    const webinar = await WebinarModel.findById(id).populate(
      "attendedUsers.userId",
      "firstName lastName email"
    );
    if (!webinar) {
      return res.status(404).json({ success: false, msg: "Webinar not found" });
    }

    // Check if user has permission to view attendees
    const isHost =
      webinar.hostId.toString() === userId ||
      webinar.presenters.some((p) => p.toString() === userId);
    const isAdmin = req.user?.role === "admin";

    if (!isHost && !isAdmin) {
      return res.status(403).json({
        success: false,
        msg: "Only hosts or admins can view attendees",
      });
    }

    // Format attendees data for frontend
    const attendees = webinar.attendedUsers.map((att) => {
      // Type assertion for populated userId
      const populatedUserId = att.userId as any;
      return {
        _id: populatedUserId._id,
        name: `${populatedUserId.firstName} ${populatedUserId.lastName}`.trim(),
        email: populatedUserId.email,
        totalDuration: att.totalDuration,
        duration: att.totalDuration, // Add duration field for compatibility
        joinTime: att.joinTime,
        leaveTime: att.leaveTime,
        certificateNumber: att.certificateNumber,
      };
    });

    res.json({
      success: true,
      attendees,
    });
  } catch (error) {
    console.error("Error fetching attendees:", error);
    res.status(500).json({ success: false, msg: "Failed to fetch attendees" });
  }
};

// Create payment session for paid webinars
export const createPaymentSession = async (req: Request, res: Response) => {
  try {
    const { id } = req.params; // webinar id
    const userId = req.user?.id;

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, msg: "Authentication required" });
    }

    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, msg: "Invalid webinar ID" });
    }

    const webinar = await WebinarModel.findById(id);
    if (!webinar) {
      return res.status(404).json({ success: false, msg: "Webinar not found" });
    }

    if (!webinar.isPaid || !webinar.price) {
      return res
        .status(400)
        .json({ success: false, msg: "This webinar is free" });
    }

    // Check if user is already enrolled
    const isEnrolled = webinar.enrolledUsers.some(
      (enrolledId) => enrolledId.toString() === userId
    );
    if (isEnrolled) {
      return res.status(400).json({
        success: false,
        msg: "You are already enrolled in this webinar",
      });
    }

    // Get user details
    const UserModel = require("../models/User.model").default;
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, msg: "User not found" });
    }

    const paymentId = crypto.randomUUID();
    const baseUrl = process.env.FRONTEND_URL || "http://localhost:5173";

    let paymentLink = "";
    let paymentData = {};

    if (webinar.paymentGateway === "stripe") {
      // Stripe payment link
      paymentLink = `https://checkout.stripe.com/pay/${
        webinar.stripeProductId || "demo-product"
      }#fidkdWxOYHwnPyd1blpxYHZxWjA0S2BVXU1GfGNfdl9dT01qTXZVZWNOQjRNVmB%2BdU5%2FdnNrUWN1YURcdk1AbmNUZH5dM0NuQUJESjdhYGdZZHhRdnJATWNXcGdyZk9dcWpwYlY%2BZ1x3Zmx1TTJ1Qlx0bjFtdCcpJ2N3amhWYHdzYHcnP3F3cGApJ2lkfGpwcVF8dWAnPyd2bGtiaWBabHFgaCcpJ2BrZGdpYFVpZGZgbWppYWB3dic%2FcXdwYHgl`;

      paymentData = {
        mode: "payment",
        amount: webinar.price * 100, // Convert to cents
        currency: webinar.currency?.toLowerCase() || "usd",
        product_name: webinar.title,
        customer_email: user.email,
        success_url: `${baseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}&webinar_id=${id}`,
        cancel_url: `${baseUrl}/payment/cancel?webinar_id=${id}`,
        metadata: {
          webinar_id: id,
          user_id: userId,
          payment_id: paymentId,
        },
      };
    } else if (webinar.paymentGateway === "razorpay") {
      // Razorpay payment link
      const razorpayOrderId = `order_${paymentId
        .replace(/-/g, "")
        .substring(0, 14)}`;
      paymentLink = `https://rzp.io/l/${webinar.razorpayPlanId || "demo-plan"}`;

      paymentData = {
        key: process.env.RAZORPAY_KEY_ID || "rzp_test_demo",
        amount: webinar.price * 100, // Convert to paisa
        currency: webinar.currency?.toUpperCase() || "INR",
        name: "Change Networks",
        description: webinar.title,
        order_id: razorpayOrderId,
        prefill: {
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          contact: user.phone || "",
        },
        notes: {
          webinar_id: id,
          user_id: userId,
          payment_id: paymentId,
        },
        theme: {
          color: "#3399cc",
        },
        callback_url: `${
          process.env.API_BASE_URL || "http://localhost:3000"
        }/webinars/payment/verify`,
        redirect: true,
      };
    }

    // Store payment session temporarily (you might want to use Redis for this)
    // For now, we'll store it in the database or session

    res.json({
      success: true,
      payment: {
        paymentId,
        paymentLink,
        gateway: webinar.paymentGateway,
        amount: webinar.price,
        currency: webinar.currency,
        webinarTitle: webinar.title,
        paymentData,
      },
    });
  } catch (error) {
    console.error("Error creating payment session:", error);
    res
      .status(500)
      .json({ success: false, msg: "Failed to create payment session" });
  }
};

// Verify payment and enroll user
export const verifyPayment = async (req: Request, res: Response) => {
  try {
    const { webinar_id, payment_id, gateway } = req.body;

    if (!Types.ObjectId.isValid(webinar_id)) {
      return res
        .status(400)
        .json({ success: false, msg: "Invalid webinar ID" });
    }

    const webinar = await WebinarModel.findById(webinar_id);
    if (!webinar) {
      return res.status(404).json({ success: false, msg: "Webinar not found" });
    }

    let isPaymentValid = false;
    let userId = null;

    if (gateway === "stripe") {
      // Stripe payment verification
      const { session_id } = req.body;

      // In a real implementation, you would verify with Stripe API
      // const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      // const session = await stripe.checkout.sessions.retrieve(session_id);
      // isPaymentValid = session.payment_status === 'paid';
      // userId = session.metadata.user_id;

      // For demo purposes, assume payment is valid
      isPaymentValid = true;
      userId = req.body.user_id;
    } else if (gateway === "razorpay") {
      // Razorpay payment verification
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
        req.body;

      // In a real implementation, you would verify with Razorpay API
      // const crypto = require('crypto');
      // const body = razorpay_order_id + "|" + razorpay_payment_id;
      // const expectedSignature = crypto
      //   .createHmac('sha256', process.env.RAZORPAY_SECRET)
      //   .update(body.toString())
      //   .digest('hex');
      // isPaymentValid = expectedSignature === razorpay_signature;

      // For demo purposes, assume payment is valid
      isPaymentValid = true;
      userId = req.body.user_id;
    }

    if (!isPaymentValid) {
      return res
        .status(400)
        .json({ success: false, msg: "Payment verification failed" });
    }

    if (!userId) {
      return res
        .status(400)
        .json({ success: false, msg: "User ID not found in payment data" });
    }

    // Check if user is already enrolled
    const isEnrolled = webinar.enrolledUsers.some(
      (enrolledId) => enrolledId.toString() === userId
    );
    if (isEnrolled) {
      return res
        .status(400)
        .json({ success: false, msg: "User is already enrolled" });
    }

    // Enroll user in webinar
    webinar.enrolledUsers.push(new Types.ObjectId(userId));
    await webinar.save();

    // Get user details for notification
    const UserModel = require("../models/User.model").default;
    const user = await UserModel.findById(userId);

    // Send confirmation email
    if (user?.email) {
      try {
        const { sendMail } = await import("../utils/mailer");
        await sendMail({
          to: user.email,
          subject: `Payment Successful - ${webinar.title}`,
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="UTF-8">
              <title>Payment Confirmation</title>
            </head>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
              <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #28a745;">Payment Successful!</h2>
                <p>Dear ${user.firstName || "User"},</p>
                <p>Your payment has been successfully processed and you are now enrolled in:</p>
                <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                  <h3 style="margin: 0; color: #2c3e50;">${webinar.title}</h3>
                  <p style="margin: 5px 0;"><strong>Date:</strong> ${
                    webinar.date
                  }</p>
                  <p style="margin: 5px 0;"><strong>Time:</strong> ${
                    webinar.time
                  }</p>
                  <p style="margin: 5px 0;"><strong>Amount Paid:</strong> ${
                    webinar.currency
                  } ${webinar.price}</p>
                </div>
                <p>We look forward to seeing you at the webinar!</p>
                <p>Best regards,<br>Change Networks Team</p>
              </div>
            </body>
            </html>
          `,
        });
      } catch (emailError) {
        logger.error("Error sending payment confirmation email:", emailError);
      }
    }

    // Create notification
    try {
      await createNotification(
        userId,
        `Payment successful! You are now enrolled in: ${webinar.title}`,
        `/webinars/${webinar._id}`,
        "success",
        "Payment Successful",
        true // Send email notification
      );
    } catch (notificationError) {
      console.error("Error creating notification:", notificationError);
    }

    res.json({
      success: true,
      msg: "Payment verified and enrollment successful",
      webinar: {
        id: webinar._id,
        title: webinar.title,
        date: webinar.date,
        time: webinar.time,
      },
    });
  } catch (error) {
    console.error("Error verifying payment:", error);
    res.status(500).json({ success: false, msg: "Failed to verify payment" });
  }
};

// Get payment status for a webinar enrollment
export const getPaymentStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params; // webinar id
    const userId = req.user?.id;

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, msg: "Authentication required" });
    }

    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, msg: "Invalid webinar ID" });
    }

    const webinar = await WebinarModel.findById(id);
    if (!webinar) {
      return res.status(404).json({ success: false, msg: "Webinar not found" });
    }

    const isEnrolled = webinar.enrolledUsers.some(
      (enrolledId) => enrolledId.toString() === userId
    );
    const requiresPayment =
      webinar.isPaid && webinar.price && webinar.price > 0;

    res.json({
      success: true,
      paymentStatus: {
        isEnrolled,
        requiresPayment,
        isPaid: webinar.isPaid,
        price: webinar.price,
        currency: webinar.currency,
        paymentGateway: webinar.paymentGateway,
        canEnroll: !requiresPayment || isEnrolled,
      },
    });
  } catch (error) {
    console.error("Error getting payment status:", error);
    res
      .status(500)
      .json({ success: false, msg: "Failed to get payment status" });
  }
};
