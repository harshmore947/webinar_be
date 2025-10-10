import mongoose, { Schema, Document, Types } from "mongoose";

export interface IUser extends Document {
  _id: Types.ObjectId;
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  resetPasswordToken: string | undefined;
  resetPasswordExpires: Date | undefined;
  resetPasswordCode: string | undefined;
  resetPasswordCodeExpires: Date | undefined;
  role: "Admin" | "Host" | "Presenter" | "Moderator" | "Attendee";
  webinars: Types.ObjectId[];
}

const UserSchema: Schema = new Schema({
  firstName: {
    type: String,
    required: true,
    trim: true,
  },
  lastName: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    unique: true,
    required: true,
    trim: true,
  },
  passwordHash: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ["Admin", "Host", "Presenter", "Moderator", "Attendee"],
    default: "Attendee",
  },
  resetPasswordToken: {
    type: String,
  },
  resetPasswordExpires: {
    type: Date,
  },
  resetPasswordCode: {
    type: String,
  },
  resetPasswordCodeExpires: {
    type: Date,
  },
  webinars: [
    {
      type: Schema.Types.ObjectId,
      ref: "Webinar",
    },
  ],
});

export default mongoose.model<IUser>("User", UserSchema);
