import mongoose, { Schema, Document, Types } from "mongoose";

export interface IReminder extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  webinarId: Types.ObjectId;
  reminderTime: Date;
  message: string;
  isEmailSent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ReminderSchema: Schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    webinarId: {
      type: Schema.Types.ObjectId,
      ref: "Webinar",
      required: true,
    },
    reminderTime: {
      type: Date,
      required: true,
    },
    message: {
      type: String,
      required: true,
      maxlength: 500,
    },
    isEmailSent: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient querying
ReminderSchema.index({ userId: 1, webinarId: 1 });
ReminderSchema.index({ reminderTime: 1, isEmailSent: 1 });

export default mongoose.model<IReminder>("Reminder", ReminderSchema);
