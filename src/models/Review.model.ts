import mongoose, { Schema, Document } from "mongoose";

export interface IReview extends Document {
  webinarId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  rating: number; // 1-5
  comment?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ReviewSchema = new Schema<IReview>(
  {
    webinarId: { type: Schema.Types.ObjectId, ref: "Webinar", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, default: "" },
  },
  { timestamps: true }
);

ReviewSchema.index({ webinarId: 1, userId: 1 }, { unique: true });

export default mongoose.model<IReview>("Review", ReviewSchema);
