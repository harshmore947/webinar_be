import mongoose, { Document, Schema } from "mongoose";

// Certificate Template Model
export interface ICertificateTemplate extends Document {
  name: string;
  description?: string;
  templateUrl: string; // Cloudinary URL
  thumbnailUrl: string; // Preview image
  isPublic: boolean; // Available to all users or just creator
  createdBy: mongoose.Types.ObjectId; // User who created it
  category:
    | "business"
    | "educational"
    | "achievement"
    | "participation"
    | "custom";
  dimensions: {
    width: number;
    height: number;
  };
  defaultFields: Array<{
    id: string;
    label: string;
    type: "text" | "date" | "number" | "email" | "image" | "qr_code";
    position: { x: number; y: number };
    fontSize: number;
    fontColor: string;
    fontFamily: string;
    fontWeight: "normal" | "bold" | "light";
    rotation: number;
    width?: number;
    height?: number;
    format?: string; // For dates: "MM/DD/YYYY", "DD/MM/YYYY", etc.
    placeholder?: string;
  }>;
  tags: string[];
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const CertificateTemplateSchema = new Schema<ICertificateTemplate>(
  {
    name: { type: String, required: true },
    description: { type: String },
    templateUrl: { type: String, required: true },
    thumbnailUrl: { type: String, required: true },
    isPublic: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    category: {
      type: String,
      enum: [
        "business",
        "educational",
        "achievement",
        "participation",
        "custom",
      ],
      default: "custom",
    },
    dimensions: {
      width: { type: Number, default: 800 },
      height: { type: Number, default: 600 },
    },
    defaultFields: [
      {
        id: { type: String, required: true },
        label: { type: String, required: true },
        type: {
          type: String,
          enum: ["text", "date", "number", "email", "image", "qr_code"],
          required: true,
        },
        position: {
          x: { type: Number, required: true },
          y: { type: Number, required: true },
        },
        fontSize: { type: Number, default: 16 },
        fontColor: { type: String, default: "#000000" },
        fontFamily: { type: String, default: "Arial" },
        fontWeight: {
          type: String,
          enum: ["normal", "bold", "light"],
          default: "normal",
        },
        rotation: { type: Number, default: 0 },
        width: { type: Number },
        height: { type: Number },
        format: { type: String },
        placeholder: { type: String },
      },
    ],
    tags: [{ type: String }],
    usageCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Generated Certificate Model
export interface IGeneratedCertificate extends Document {
  webinarId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  certificateNumber: string;
  templateUsed: string; // Template name or ID
  certificateUrl: string; // Cloudinary URL
  thumbnailUrl: string; // Smaller version for previews
  publicId: string; // Cloudinary public ID for deletion
  fieldData: { [key: string]: string }; // The actual data used
  generatedAt: Date;
  emailSent: boolean;
  emailSentAt?: Date;
  downloadCount: number;
  isRevoked: boolean;
  revokedAt?: Date;
  revokedReason?: string;
  // Additional properties for SimpleCertificateService
  status: "pending" | "processing" | "completed" | "failed";
  downloadUrl?: string;
  jobId?: mongoose.Types.ObjectId;
  certificateData: Map<string, any>;
  metadata: {
    generationDuration: number; // milliseconds
    templateVersion: string;
    ipAddress?: string;
  };
}

const GeneratedCertificateSchema = new Schema<IGeneratedCertificate>(
  {
    webinarId: { type: Schema.Types.ObjectId, ref: "Webinar", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    certificateNumber: { type: String, required: true },
    templateUsed: { type: String, required: true },
    certificateUrl: { type: String, required: true },
    thumbnailUrl: { type: String, required: true },
    publicId: { type: String, required: true },
    fieldData: { type: Map, of: String },
    generatedAt: { type: Date, default: Date.now },
    emailSent: { type: Boolean, default: false },
    emailSentAt: { type: Date },
    downloadCount: { type: Number, default: 0 },
    isRevoked: { type: Boolean, default: false },
    revokedAt: { type: Date },
    revokedReason: { type: String },
    // Additional fields for SimpleCertificateService
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
    },
    downloadUrl: { type: String },
    jobId: { type: Schema.Types.ObjectId, ref: "CertificateJob" },
    certificateData: {
      type: Map,
      of: Schema.Types.Mixed,
      default: {},
    },
    metadata: {
      generationDuration: { type: Number },
      templateVersion: { type: String },
      ipAddress: { type: String },
    },
  },
  { timestamps: true }
);

// Certificate Generation Job Model (for queue system)
export interface ICertificateJob extends Document {
  webinarId: mongoose.Types.ObjectId;
  jobType: "single" | "batch" | "auto_after_webinar";
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  priority: "low" | "normal" | "high" | "urgent";
  attendeeIds: mongoose.Types.ObjectId[]; // Users to generate certificates for
  progress: {
    total: number;
    completed: number;
    failed: number;
  };
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
  retryCount: number;
  maxRetries: number;
  scheduledFor?: Date; // For delayed jobs
  createdBy: mongoose.Types.ObjectId;
  results: Array<{
    userId: mongoose.Types.ObjectId;
    status: "success" | "failed";
    certificateId?: mongoose.Types.ObjectId;
    error?: string;
    processedAt: Date;
  }>;
}

const CertificateJobSchema = new Schema<ICertificateJob>(
  {
    webinarId: { type: Schema.Types.ObjectId, ref: "Webinar", required: true },
    jobType: {
      type: String,
      enum: ["single", "batch", "auto_after_webinar"],
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed", "cancelled"],
      default: "pending",
    },
    priority: {
      type: String,
      enum: ["low", "normal", "high", "urgent"],
      default: "normal",
    },
    attendeeIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    progress: {
      total: { type: Number, default: 0 },
      completed: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
    },
    startedAt: { type: Date },
    completedAt: { type: Date },
    errorMessage: { type: String },
    retryCount: { type: Number, default: 0 },
    maxRetries: { type: Number, default: 3 },
    scheduledFor: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    results: [
      {
        userId: { type: Schema.Types.ObjectId, ref: "User" },
        status: { type: String, enum: ["success", "failed"] },
        certificateId: {
          type: Schema.Types.ObjectId,
          ref: "GeneratedCertificate",
        },
        error: { type: String },
        processedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

// Indexes for performance
CertificateTemplateSchema.index({ createdBy: 1, isPublic: 1 });
CertificateTemplateSchema.index({ category: 1, isPublic: 1 });
CertificateTemplateSchema.index({ tags: 1 });

GeneratedCertificateSchema.index({ webinarId: 1, userId: 1 }, { unique: true });
GeneratedCertificateSchema.index({ certificateNumber: 1 }, { unique: true });
GeneratedCertificateSchema.index({ userId: 1 });
GeneratedCertificateSchema.index({ generatedAt: -1 });

CertificateJobSchema.index({ status: 1, priority: -1 });
CertificateJobSchema.index({ webinarId: 1 });
CertificateJobSchema.index({ scheduledFor: 1 });

export const CertificateTemplateModel = mongoose.model<ICertificateTemplate>(
  "CertificateTemplate",
  CertificateTemplateSchema
);
export const GeneratedCertificate = mongoose.model<IGeneratedCertificate>(
  "GeneratedCertificate",
  GeneratedCertificateSchema
);
export const CertificateJob = mongoose.model<ICertificateJob>(
  "CertificateJob",
  CertificateJobSchema
);

// Default export for compatibility
export default GeneratedCertificate;
