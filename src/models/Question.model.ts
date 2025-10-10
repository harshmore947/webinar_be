import mongoose, { Document, Schema } from "mongoose";
import { IUser } from "./User.model";
import { IWebinar } from "./Webinar.model";

export interface IQuestion extends Document {
  webinarId: IWebinar["_id"];
  userId: IUser["_id"];
  question: string;
  answer?: string;
  answeredBy?: IUser["_id"];
  answeredAt?: Date;
  upvotes: IUser["_id"][];
  upvoteCount: number;
  isPinned: boolean;
  isApproved: boolean;
  status: "pending" | "approved" | "answered" | "hidden";
  createdAt: Date;
  updatedAt: Date;
}

const QuestionSchema = new Schema<IQuestion>(
  {
    webinarId: {
      type: Schema.Types.ObjectId,
      ref: "Webinar",
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    question: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    answer: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    answeredBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    answeredAt: {
      type: Date,
    },
    upvotes: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    upvoteCount: {
      type: Number,
      default: 0,
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
    isApproved: {
      type: Boolean,
      default: true, // Auto-approve by default
    },
    status: {
      type: String,
      enum: ["pending", "approved", "answered", "hidden"],
      default: "approved",
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
QuestionSchema.index({ webinarId: 1, createdAt: -1 });
QuestionSchema.index({ webinarId: 1, upvoteCount: -1 });
QuestionSchema.index({ webinarId: 1, isPinned: -1 });

// Pre-save middleware to update upvoteCount
QuestionSchema.pre("save", function (next) {
  this.upvoteCount = this.upvotes.length;

  // Auto-update status when answered
  if (this.answer && !this.answeredAt) {
    this.answeredAt = new Date();
    this.status = "answered";
  }

  next();
});

export default mongoose.model<IQuestion>("Question", QuestionSchema);
