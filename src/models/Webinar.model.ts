import mongoose, { Document, Schema } from "mongoose";
import { IUser } from "./User.model";

export interface IWebinar extends Document {
  hostId: mongoose.Types.ObjectId; //ref user
  title: string;
  category: string;
  description: string;
  youtubeLiveURL: string;
  productUSPs: string;
  agenda: string;
  tags: string[];
  date: string;
  time: string;
  timezone: string;
  isRecurring: boolean;
  recurringType: "daily" | "weekly" | "custom";
  customRecurring?: string;
  presenters: mongoose.Types.ObjectId[]; // Refs to User
  moderators: mongoose.Types.ObjectId[]; // Refs to User
  resources: Array<{
    name: string;
    url: string;
    type: "pdf" | "image";
    fileType: string; // MIME type
    size: number; // File size in bytes
    uploadedAt: Date;
    publicId: string; // Cloudinary public ID for deletion
  }>; // File resources with metadata
  enableQA: boolean;
  enablePolls: boolean;
  maxParticipants: string;
  isPublic: boolean; // TRUE = no login required
  status: "scheduled" | "live" | "ended";
  endedAt?: Date; // Timestamp when webinar was ended
  createdAt: Date;
  updatedAt: Date;
  enrolledUsers: Array<IUser["_id"]>;
  // Thumbnail
  thumbnailUrl?: string;
  thumbnailPublicId?: string;
  // Recording fields
  isRecorded?: boolean;
  recordingUrl?: string;
  recordingPublicId?: string;
  recordingDuration?: number; // in minutes
  recordingSize?: number; // in bytes
  viewCount?: number;
  allowReplayAccess?: boolean; // Allow replay-only enrollment
  replayPrice?: number; // Optional separate price for replay
  hasCertification: boolean;
  certificateTemplate?: string; // Cloudinary URL or path to certificate template
  certificateConfig?: {
    fields?: Array<{
      id: string;
      label: string;
      type: "text" | "date" | "number" | "email" | "select";
      placeholder?: string;
      required: boolean;
      position: { x: number; y: number };
      fontSize: number;
      fontColor: string;
      fontWeight: "normal" | "bold" | "light";
      rotation: number;
      width?: number;
      height?: number;
      options?: string[];
      defaultValue?: string;
      format?: string;
    }>;
    backgroundImage?: string; // Cloudinary URL
    dimensions?: { width: number; height: number };
    // Legacy fields for backward compatibility
    namePosition?: { x: number; y: number };
    numberPosition?: { x: number; y: number };
    fontSize?: number;
    fontColor?: string;
  };
  attendedUsers: Array<{
    userId: IUser["_id"];
    joinTime: Date;
    leaveTime?: Date;
    totalDuration: number; // in minutes
    certificateNumber?: string;
  }>;
  // Payment fields
  isPaid?: boolean;
  price?: number;
  currency?: string;
  paymentGateway?: "stripe" | "razorpay";
  stripeProductId?: string;
  razorpayPlanId?: string;
  paymentUrl?: string; // Direct payment link for the webinar
  // Reviews summary
  averageRating?: number;
  reviewCount?: number;
}

// const AgendaSchema = new Schema<IAgendaItem>({
//   title: { type: String, required: true },
//   description: { type: String, default: "" },
// });

const WebinarSchema = new Schema<IWebinar>(
  {
    hostId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: { type: String, required: true },
    category: { type: String, default: "" },
    description: { type: String, default: "" },
    youtubeLiveURL: { type: String, default: "" },
    productUSPs: { type: String, default: "" },
    agenda: { type: String, default: "" },
    tags: { type: [String], default: [] },
    date: {
      type: String,
      default: () => new Date().toISOString().split("T")[0], // Default to current date in YYYY-MM-DD format
      validate: {
        validator: function (v: string) {
          // First validate format (YYYY-MM-DD)
          if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
            return false;
          }

          // Then validate if it's a valid date (e.g., not 2025-02-30)
          try {
            // Create date object and check if it's valid
            const dateParts = v.split("-");
            const year = parseInt(dateParts[0]);
            const month = parseInt(dateParts[1]) - 1; // JS months are 0-indexed
            const day = parseInt(dateParts[2]);

            const dateObj = new Date(year, month, day);

            // Check if the date object has the same components we provided
            // If not, it means the date was invalid and JS auto-corrected it
            return (
              dateObj.getFullYear() === year &&
              dateObj.getMonth() === month &&
              dateObj.getDate() === day
            );
          } catch (e) {
            return false;
          }
        },
        message: (props) =>
          `${props.value} is not a valid date! Please use YYYY-MM-DD format with a valid calendar date.`,
      },
    },
    time: {
      type: String,
      default: "12:00", // Default to noon
      validate: {
        validator: function (v: string) {
          // Validate time format (HH:MM or HH:MM:SS)
          if (!/^\d{2}:\d{2}(:\d{2})?$/.test(v)) {
            return false;
          }

          // Also validate that hours and minutes are within valid ranges
          try {
            const timeParts = v.split(":");
            const hours = parseInt(timeParts[0]);
            const minutes = parseInt(timeParts[1]);
            const seconds = timeParts.length > 2 ? parseInt(timeParts[2]) : 0;

            return (
              hours >= 0 &&
              hours <= 23 &&
              minutes >= 0 &&
              minutes <= 59 &&
              seconds >= 0 &&
              seconds <= 59
            );
          } catch (e) {
            return false;
          }
        },
        message: (props) =>
          `${props.value} is not a valid time format! Use HH:MM or HH:MM:SS with valid hours (00-23) and minutes (00-59).`,
      },
    },
    timezone: { type: String, default: "UTC" },
    isRecurring: { type: Boolean, default: false },
    recurringType: {
      type: String,
      enum: ["daily", "weekly", "custom"],
      default: "daily",
    },
    customRecurring: { type: String, default: "" },
    presenters: [{ type: Schema.Types.ObjectId, ref: "User" }],
    moderators: [{ type: Schema.Types.ObjectId, ref: "User" }],
    resources: [
      {
        name: { type: String, required: true },
        url: { type: String, required: true },
        type: { type: String, enum: ["pdf", "image"], required: true },
        fileType: { type: String, required: true }, // MIME type
        size: { type: Number, required: true }, // File size in bytes
        uploadedAt: { type: Date, default: Date.now },
        publicId: { type: String, required: true }, // Cloudinary public ID
      },
    ],
    enableQA: { type: Boolean, default: false },
    enablePolls: { type: Boolean, default: false },
    maxParticipants: { type: String, default: "50" },
    isPublic: { type: Boolean, default: true },
    status: {
      type: String,
      enum: ["scheduled", "live", "ended"],
      default: "scheduled",
    },
    endedAt: { type: Date },
    // Thumbnail for listings and details
    thumbnailUrl: { type: String, default: "" },
    thumbnailPublicId: { type: String, default: "" },
    // Recording fields
    isRecorded: { type: Boolean, default: false },
    recordingUrl: { type: String, default: "" },
    recordingPublicId: { type: String, default: "" },
    recordingDuration: { type: Number }, // in minutes
    recordingSize: { type: Number }, // in bytes
    viewCount: { type: Number, default: 0 },
    allowReplayAccess: { type: Boolean, default: false },
    replayPrice: { type: Number },
    enrolledUsers: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    hasCertification: { type: Boolean, default: false },
    certificateTemplate: { type: String }, // Cloudinary URL
    certificateConfig: {
      fields: [
        {
          id: { type: String },
          label: { type: String },
          type: {
            type: String,
            enum: ["text", "date", "number", "email", "select"],
          },
          placeholder: { type: String },
          required: { type: Boolean, default: false },
          position: {
            x: { type: Number },
            y: { type: Number },
          },
          fontSize: { type: Number, default: 16 },
          fontColor: { type: String, default: "#000000" },
          fontWeight: {
            type: String,
            enum: ["normal", "bold", "light"],
            default: "normal",
          },
          rotation: { type: Number, default: 0 },
          width: { type: Number },
          height: { type: Number },
          options: [{ type: String }],
          defaultValue: { type: String },
          format: { type: String },
        },
      ],
      backgroundImage: { type: String }, // Cloudinary URL
      dimensions: {
        width: { type: Number, default: 800 },
        height: { type: Number, default: 600 },
      },
      // Legacy fields for backward compatibility
      namePosition: {
        x: { type: Number, default: 300 },
        y: { type: Number, default: 200 },
      },
      numberPosition: {
        x: { type: Number, default: 300 },
        y: { type: Number, default: 250 },
      },
      fontSize: { type: Number, default: 20 },
      fontColor: { type: String, default: "#000000" },
    },
    attendedUsers: [
      {
        userId: { type: Schema.Types.ObjectId, ref: "User" },
        joinTime: { type: Date },
        leaveTime: { type: Date },
        totalDuration: { type: Number, default: 0 }, // in minutes
        certificateNumber: { type: String },
      },
    ],
    // Payment fields
    isPaid: { type: Boolean, default: false },
    price: { type: Number },
    currency: { type: String, default: "USD" },
    paymentGateway: {
      type: String,
      enum: ["stripe", "razorpay"],
      default: "stripe",
    },
    stripeProductId: { type: String },
    razorpayPlanId: { type: String },
    paymentUrl: { type: String }, // Direct payment link for the webinar
    averageRating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Add pre-save middleware to ensure date and time are always in the correct format
WebinarSchema.pre("save", function (next) {
  // Format date if it exists but doesn't match YYYY-MM-DD format
  if (this.date && !/^\d{4}-\d{2}-\d{2}$/.test(this.date)) {
    try {
      // Try to convert to proper format
      const dateObj = new Date(this.date);
      if (!isNaN(dateObj.getTime())) {
        this.date = dateObj.toISOString().split("T")[0]; // YYYY-MM-DD format
        console.log(`Pre-save middleware: Normalized date to ${this.date}`);
      } else {
        // If invalid, set to current date
        this.date = new Date().toISOString().split("T")[0];
        console.warn(
          `Pre-save middleware: Invalid date value, using today: ${this.date}`
        );
      }
    } catch (error) {
      // On error, default to current date
      this.date = new Date().toISOString().split("T")[0];
      console.error(
        "Pre-save middleware: Error parsing date, using today:",
        error
      );
    }
  }

  // Format time if it exists but doesn't match HH:MM or HH:MM:SS format
  if (this.time && !/^\d{2}:\d{2}(:\d{2})?$/.test(this.time)) {
    try {
      // Try to extract time from the string
      const timeMatch = this.time.match(/(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
      if (timeMatch) {
        let hours = parseInt(timeMatch[1]).toString().padStart(2, "0");
        let minutes = parseInt(timeMatch[2]).toString().padStart(2, "0");
        this.time = `${hours}:${minutes}`; // Normalize to HH:MM format
        console.log(`Pre-save middleware: Normalized time to ${this.time}`);
      } else {
        // If no match, default to noon
        this.time = "12:00";
        console.warn(
          `Pre-save middleware: Invalid time value, using default: ${this.time}`
        );
      }
    } catch (error) {
      // On error, default to noon
      this.time = "12:00";
      console.error(
        "Pre-save middleware: Error parsing time, using default:",
        error
      );
    }
  }

  next();
});

export default mongoose.model<IWebinar>("Webinar", WebinarSchema);
