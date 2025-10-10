import mongoose, { Document, Schema } from "mongoose";

export interface IChat extends Document {
  webinarId: mongoose.Types.ObjectId; // Reference to the webinar
  userId: mongoose.Types.ObjectId; // Who sent the message
  message: string;
  timestamp: Date;
  isModerated: boolean; // Whether this message has been reviewed by a moderator
  isDeleted: boolean; // Soft delete flag
  displayName?: string; // Display name for anonymous users
}

const ChatSchema = new Schema<IChat>(
  {
    webinarId: {
      type: Schema.Types.ObjectId,
      ref: "Webinar",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: false, // Allow null for anonymous users
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500, // Reasonable limit for chat messages
    },
    displayName: {
      type: String,
      required: false,
      trim: true,
      maxlength: 50,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    isModerated: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries by webinar
ChatSchema.index({ webinarId: 1, timestamp: -1 });

// Create the model
const ChatModel = mongoose.model<IChat>("Chat", ChatSchema);

export default ChatModel;
