import mongoose, { Schema, Document, Types } from "mongoose";

export interface INotification extends Document {
  userId: Types.ObjectId;
  title?: string; // optional title for notifications
  message: string;
  link?: string; // optional
  type: string; // notification type: 'info', 'success', 'warning', 'error'
  isRead: boolean;
  readAt?: Date; // when notification was read
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema: Schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true, // Index for better query performance
    },
    title: {
      type: String,
      default: "",
    },
    message: {
      type: String,
      required: true,
    },
    link: {
      type: String,
    },
    type: {
      type: String,
      enum: ["info", "success", "warning", "error"],
      default: "info",
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true, // Index for filtering read/unread
    },
    readAt: {
      type: Date,
    },
  },
  {
    timestamps: true, // Automatically add createdAt and updatedAt
  }
);

// Compound index for efficient querying
NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, isRead: 1 });

export default mongoose.model<INotification>(
  "Notification",
  NotificationSchema
);
