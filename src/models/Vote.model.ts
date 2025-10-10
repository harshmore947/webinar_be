import mongoose, { Schema, Document } from "mongoose";

export interface IVote extends Document {
  pollId: mongoose.Types.ObjectId;
  webinarId: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
  sessionId?: string; // For anonymous users
  optionId: string;
  votedAt: Date;
  userDisplayName?: string;
}

const voteSchema = new Schema({
  pollId: {
    type: Schema.Types.ObjectId,
    ref: "Poll",
    required: true,
  },
  webinarId: {
    type: Schema.Types.ObjectId,
    ref: "Webinar",
    required: true,
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  sessionId: {
    type: String,
  },
  optionId: {
    type: String,
    required: true,
  },
  votedAt: {
    type: Date,
    default: Date.now,
  },
  userDisplayName: {
    type: String,
    trim: true,
  },
});

// Ensure one vote per user per poll (unless multiple votes allowed)
voteSchema.index({ pollId: 1, userId: 1 }, { unique: true, sparse: true });
voteSchema.index({ pollId: 1, sessionId: 1 }, { unique: true, sparse: true });
voteSchema.index({ webinarId: 1 });

export const VoteModel = mongoose.model<IVote>("Vote", voteSchema);
