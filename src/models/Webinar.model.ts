import mongoose, { Document, Schema } from "mongoose";
import { IUser } from "./User.model";

export interface IWebinarCertificateField {
  id: string;
  key: string;
  label: string;
  x: number;
  y: number;
  fontFamily: string;
  fontSize: number;
  align: "left" | "center" | "right";
  color: string;
  defaultText?: string;
  format?: string;
}

export interface IWebinarCertificateTemplate {
  cloudinaryTemplateId: string;
  cloudinaryUrl?: string;
  mimeType: string;
  width: number;
  height: number;
  fields: IWebinarCertificateField[];
  lastEdited?: Date;
  version: number;
}

export interface IWebinarEnrolledUserCert {
  status: "pending" | "in_progress" | "done" | "failed";
  cloudinaryPublicId?: string;
  cloudinaryUrl?: string;
  attempts: number;
  lastError?: string;
  generatedAt?: Date;
  certificateNumber?: string;
}

export interface IWebinarEnrolledUser {
  userId: IUser["_id"];
  name: string;
  email: string;
  cert: IWebinarEnrolledUserCert;
}

export interface IWebinarCertificateGenerationSummary {
  total: number;
  succeeded: number;
  failed: number;
}

export interface IWebinarCertificateGeneration {
  lock: boolean;
  lastRunAt?: Date;
  lastSummary?: IWebinarCertificateGenerationSummary;
  lastRunId?: string;
  lastStatus?: "started" | "finished" | "failed";
}

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
    description?: string;
    url: string;
    type: "pdf" | "image" | "video";
    fileType: string; // MIME type
    size: number; // File size in bytes
    category: "presentation" | "document" | "image" | "reference" | "handout" | "recording" | "other";
    tags: string[];
    accessLevel: "public" | "enrolled" | "paid";
    uploadedBy: {
      userId: mongoose.Types.ObjectId;
      name: string;
      role: string;
    };
    uploadedAt: Date;
    publicId: string; // Cloudinary public ID for deletion
    downloadCount: number;
    isArchived: boolean;
    metadata?: {
      width?: number;
      height?: number;
      duration?: number; // for videos
      pages?: number; // for PDFs
    };
  }>; // File resources with enhanced metadata
  enableQA: boolean;
  enablePolls: boolean;
  maxParticipants: string;
  isPublic: boolean; // TRUE = no login required
  status: "scheduled" | "live" | "ended";
  endedAt?: Date; // Timestamp when webinar was ended
  createdAt: Date;
  updatedAt: Date;
  enrolledUsers: IWebinarEnrolledUser[];
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
  certificateTemplate?: IWebinarCertificateTemplate;
  certificateGeneration?: IWebinarCertificateGeneration;
  customFields?: Record<string, any>;
  certificateConfig?: any; // legacy compatibility
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

const CertificateFieldSchema = new Schema(
  {
    id: { type: String, required: true },
    key: { type: String, required: true },
    label: { type: String, default: "" },
    x: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    y: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    fontFamily: { type: String, default: "Arial" },
    fontSize: { type: Number, default: 16 },
    align: {
      type: String,
      enum: ["left", "center", "right"],
      default: "left",
    },
    color: { type: String, default: "#000000" },
    defaultText: { type: String },
    format: { type: String },
  },
  { _id: false }
);

const CertificateTemplateSchema = new Schema(
  {
    cloudinaryTemplateId: { type: String, required: true },
    cloudinaryUrl: { type: String },
    mimeType: { type: String, required: true },
  width: { type: Number, required: true },
  height: { type: Number, required: true },
    fields: { type: [CertificateFieldSchema], default: [] },
    lastEdited: { type: Date, default: Date.now },
    version: { type: Number, default: 1 },
  },
  { _id: false }
);

const CertificateStatusSchema = new Schema(
  {
    status: {
      type: String,
      enum: ["pending", "in_progress", "done", "failed"],
      default: "pending",
    },
    cloudinaryPublicId: { type: String },
    cloudinaryUrl: { type: String },
    attempts: { type: Number, default: 0 },
    lastError: { type: String },
    generatedAt: { type: Date },
  certificateNumber: { type: String },
  },
  { _id: false }
);

const EnrolledUserSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, default: "" },
    email: { type: String, default: "" },
    cert: {
      type: CertificateStatusSchema,
      default: () => ({ status: "pending", attempts: 0 }),
    },
  },
  { _id: false }
);

EnrolledUserSchema.method("toString", function toString() {
  return this.userId ? this.userId.toString() : "";
});

const CertificateGenerationSchema = new Schema(
  {
    lock: { type: Boolean, default: false },
    lastRunAt: { type: Date },
    lastSummary: {
      total: { type: Number, default: 0 },
      succeeded: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
    },
    lastRunId: { type: String },
    lastStatus: {
      type: String,
      enum: ["started", "finished", "failed"],
    },
  },
  { _id: false }
);

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
    enrolledUsers: {
      type: [EnrolledUserSchema],
      default: [],
    },
    hasCertification: { type: Boolean, default: false },
    certificateTemplate: { type: CertificateTemplateSchema },
    certificateGeneration: {
      type: CertificateGenerationSchema,
      default: () => ({
        lock: false,
        lastSummary: { total: 0, succeeded: 0, failed: 0 },
        lastStatus: "finished",
      }),
    },
    customFields: {
      type: Map,
      of: Schema.Types.Mixed,
      default: {},
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

function normalizeEnrolledUsers(doc: any) {
  if (!doc?.enrolledUsers) {
    return;
  }

  const normalized = doc.enrolledUsers.map((entry: any) => {
    if (!entry) {
      return entry;
    }

    if (entry.userId) {
      return {
        userId: entry.userId,
        name: entry.name || "",
        email: entry.email || "",
        cert: {
          status: entry.cert?.status || "pending",
          cloudinaryPublicId: entry.cert?.cloudinaryPublicId,
          cloudinaryUrl: entry.cert?.cloudinaryUrl,
          attempts: entry.cert?.attempts ?? 0,
          lastError: entry.cert?.lastError,
          generatedAt: entry.cert?.generatedAt,
        },
      };
    }

    return {
      userId: entry,
      name: "",
      email: "",
      cert: {
        status: "pending",
        attempts: 0,
      },
    };
  });

  doc.enrolledUsers = normalized;
}

// Add pre-save middleware to ensure date and time are always in the correct format
WebinarSchema.pre("save", function (next) {
  normalizeEnrolledUsers(this);

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

WebinarSchema.post("init", function () {
  normalizeEnrolledUsers(this);
});

export default mongoose.model<IWebinar>("Webinar", WebinarSchema);
