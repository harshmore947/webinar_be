import mongoose, { Schema, Document } from "mongoose";

export interface IPollOption {
  id: string;
  text: string;
  votes: number;
}

export interface IPoll extends Document {
  webinarId: mongoose.Types.ObjectId;
  question: string;
  options: IPollOption[];
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  expiresAt?: Date;
  isActive: boolean;
  allowMultipleVotes: boolean;
  isAnonymous: boolean;
  totalVotes: number;
}

const pollOptionSchema = new Schema({
  id: {
    type: String,
    required: true,
  },
  text: {
    type: String,
    required: true,
    trim: true,
  },
  votes: {
    type: Number,
    default: 0,
  },
});

const pollSchema = new Schema({
  webinarId: {
    type: Schema.Types.ObjectId,
    ref: "Webinar",
    required: true,
  },
  question: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500,
  },
  options: [pollOptionSchema],
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  allowMultipleVotes: {
    type: Boolean,
    default: false,
  },
  isAnonymous: {
    type: Boolean,
    default: true,
  },
  totalVotes: {
    type: Number,
    default: 0,
  },
});

// Index for efficient queries
pollSchema.index({ webinarId: 1, isActive: 1 });
pollSchema.index({ createdAt: -1 });

export const PollModel = mongoose.model<IPoll>("Poll", pollSchema);
