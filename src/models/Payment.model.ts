import mongoose, { Schema, Document } from "mongoose";

export interface IPayment extends Document {
  userId: mongoose.Types.ObjectId;
  webinarId: mongoose.Types.ObjectId;
  stripeSessionId: string;
  stripePaymentIntentId?: string;
  amount: number;
  currency: string;
  status: "pending" | "completed" | "failed" | "refunded" | "cancelled";
  paymentGateway: "stripe" | "razorpay";
  metadata: {
    webinarTitle: string;
    userEmail: string;
    userName: string;
  };
  webhookReceived: boolean;
  enrollmentCompleted: boolean;
  enrollmentAttempts: number;
  lastEnrollmentAttempt?: Date;
  errorLog: Array<{
    timestamp: Date;
    error: string;
    stack?: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  // Methods
  logError(error: Error): Promise<IPayment>;
  markCompleted(): Promise<IPayment>;
}

const PaymentSchema = new Schema<IPayment>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    webinarId: {
      type: Schema.Types.ObjectId,
      ref: "Webinar",
      required: true,
      index: true,
    },
    stripeSessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    stripePaymentIntentId: {
      type: String,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      required: true,
      uppercase: true,
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "refunded", "cancelled"],
      default: "pending",
      index: true,
    },
    paymentGateway: {
      type: String,
      enum: ["stripe", "razorpay"],
      default: "stripe",
    },
    metadata: {
      webinarTitle: String,
      userEmail: String,
      userName: String,
    },
    webhookReceived: {
      type: Boolean,
      default: false,
    },
    enrollmentCompleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    enrollmentAttempts: {
      type: Number,
      default: 0,
    },
    lastEnrollmentAttempt: {
      type: Date,
    },
    errorLog: [
      {
        timestamp: {
          type: Date,
          default: Date.now,
        },
        error: String,
        stack: String,
      },
    ],
    completedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries
PaymentSchema.index({ userId: 1, webinarId: 1 });
PaymentSchema.index({ status: 1, enrollmentCompleted: 1 });
PaymentSchema.index({ createdAt: -1 });

// Method to log errors
PaymentSchema.methods.logError = function (error: Error) {
  this.errorLog.push({
    timestamp: new Date(),
    error: error.message,
    stack: error.stack,
  });
  return this.save();
};

// Method to mark as completed
PaymentSchema.methods.markCompleted = function () {
  this.status = "completed";
  this.enrollmentCompleted = true;
  this.completedAt = new Date();
  return this.save();
};

const PaymentModel = mongoose.model<IPayment>("Payment", PaymentSchema);

export default PaymentModel;
