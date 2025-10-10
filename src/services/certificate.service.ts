/**
 * Certificate Service - Complete Certificate Management System
 * Handles template creation, certificate generation, and distribution
 */

import { createCanvas, loadImage, registerFont } from "canvas";
import { CertificateTemplateModel, GeneratedCertificate, CertificateJob } from "../models/Certificate.model";
import WebinarModel, { IWebinar } from "../models/Webinar.model";
import UserModel, { IUser } from "../models/User.model";
import { uploadCertificateTemplate, uploadGeneratedCertificate } from "../utils/cloudinaryService";
import { sendCertificateEmail } from "../utils/mailer";
import { logInfo, logError } from "../utils/logger";
import mongoose from "mongoose";
import path from "path";
import fs from "fs";

// Types
export interface CertificateField {
  id: string;
  label: string;
  value: string;
  type: "text" | "date" | "number" | "email" | "image" | "qr_code";
  position: { x: number; y: number };
  fontSize: number;
  fontColor: string;
  fontFamily: string;
  fontWeight: "normal" | "bold" | "light";
  rotation: number;
  textAlign: "left" | "center" | "right";
  opacity: number;
  width?: number;
  height?: number;
}

export interface CertificateTemplate {
  id?: string;
  name: string;
  description?: string;
  backgroundImage: string;
  fields: CertificateField[];
  dimensions: { width: number; height: number };
  category: string;
  isPublic: boolean;
}

export interface GenerateCertificateOptions {
  webinarId: string;
  userId: string;
  attendeeName: string;
  webinarTitle: string;
  webinarDate: string;
  hostName: string;
  additionalFields?: Record<string, string>;
  sendEmail?: boolean;
}

export interface BulkGenerateOptions {
  webinarId: string;
  attendeeIds: string[];
  sendEmail?: boolean;
  priority?: "low" | "normal" | "high" | "urgent";
}

export class CertificateService {
  /**
   * Save a certificate template to database and cloud
   */
  static async saveTemplate(
    template: CertificateTemplate,
    userId: string
  ): Promise<any> {
    try {
      logInfo(`Saving certificate template: ${template.name}`);

      // Upload background image to Cloudinary if it's a base64 string
      let backgroundUrl = template.backgroundImage;
      let thumbnailUrl = template.backgroundImage;

      if (template.backgroundImage.startsWith("data:image")) {
        // Extract base64 data
        const base64Data = template.backgroundImage.split(",")[1];
        const buffer = Buffer.from(base64Data, "base64");
        
        const uploadResult = await uploadCertificateTemplate(
          buffer,
          userId,
          `${template.name}_background`
        );
        
        if (uploadResult.success && uploadResult.url) {
          backgroundUrl = uploadResult.url;
          thumbnailUrl = uploadResult.url;
        }
      }

      // Create the template document
      const templateDoc = new CertificateTemplateModel({
        name: template.name,
        description: template.description || "",
        templateUrl: backgroundUrl,
        thumbnailUrl: thumbnailUrl,
        isPublic: template.isPublic || false,
        createdBy: new mongoose.Types.ObjectId(userId),
        category: template.category || "custom",
        dimensions: template.dimensions,
        defaultFields: template.fields.map((field) => ({
          id: field.id,
          label: field.label,
          type: field.type,
          position: field.position,
          fontSize: field.fontSize,
          fontColor: field.fontColor,
          fontFamily: field.fontFamily,
          fontWeight: field.fontWeight,
          rotation: field.rotation,
          width: field.width,
          height: field.height,
          placeholder: field.value,
        })),
        tags: [],
        usageCount: 0,
      });

      await templateDoc.save();

      logInfo(`Template saved successfully: ${templateDoc._id}`);

      return {
        success: true,
        templateId: templateDoc._id,
        template: templateDoc,
      };
    } catch (error) {
      logError(`Error saving template: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Get all available templates
   */
  static async getTemplates(userId?: string): Promise<any[]> {
    try {
      const query: any = {
        $or: [{ isPublic: true }],
      };

      if (userId) {
        query.$or.push({ createdBy: new mongoose.Types.ObjectId(userId) });
      }

      const templates = await CertificateTemplateModel.find(query)
        .populate("createdBy", "firstName lastName email")
        .sort({ createdAt: -1 })
        .lean();

      return templates;
    } catch (error) {
      logError(`Error fetching templates: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Generate a single certificate
   */
  static async generateCertificate(
    options: GenerateCertificateOptions
  ): Promise<any> {
    const startTime = Date.now();

    try {
      const { webinarId, userId, attendeeName, webinarTitle, webinarDate, hostName, additionalFields, sendEmail } = options;

      logInfo(`Generating certificate for user ${userId} in webinar ${webinarId}`);

      // Fetch webinar details
      const webinar = await WebinarModel.findById(webinarId);
      if (!webinar) {
        throw new Error("Webinar not found");
      }

      // Fetch user details
      const user = await UserModel.findById(userId);
      if (!user) {
        throw new Error("User not found");
      }

      // Check if certificate already exists
      const existing = await GeneratedCertificate.findOne({ webinarId, userId });
      if (existing && existing.status === "completed") {
        logInfo(`Certificate already exists for user ${userId}`);
        return {
          success: true,
          certificateId: existing._id,
          certificateUrl: existing.certificateUrl,
          certificateNumber: existing.certificateNumber,
          alreadyExists: true,
        };
      }

      // Get certificate config from webinar
      const config = webinar.certificateConfig;
      if (!config || !config.backgroundImage) {
        throw new Error("Certificate template not configured for this webinar");
      }

      // Generate unique certificate number
      const certificateNumber = await this.generateCertificateNumber(webinarId, userId);

      // Prepare field data
      const fieldData: Record<string, string> = {
        attendeeName,
        webinarTitle,
        webinarDate,
        hostName,
        certificateNumber,
        completionDate: new Date().toLocaleDateString(),
        ...additionalFields,
      };

      // Generate certificate image
      const imageBuffer = await this.createCertificateImage(
        config,
        fieldData
      );

      // Upload to Cloudinary
      const uploadResult = await uploadGeneratedCertificate(
        imageBuffer,
        webinarId,
        userId,
        certificateNumber
      );

      if (!uploadResult.success || !uploadResult.url || !uploadResult.publicId) {
        throw new Error("Failed to upload certificate to cloud storage");
      }

      // Save certificate record
      const certificate = new GeneratedCertificate({
        webinarId: new mongoose.Types.ObjectId(webinarId),
        userId: new mongoose.Types.ObjectId(userId),
        certificateNumber,
        templateUsed: webinar.title,
        certificateUrl: uploadResult.url,
        thumbnailUrl: uploadResult.url,
        publicId: uploadResult.publicId,
        fieldData,
        status: "completed",
        downloadUrl: uploadResult.url,
        certificateData: new Map(Object.entries(fieldData)),
        metadata: {
          generationDuration: Date.now() - startTime,
          templateVersion: "1.0",
        },
      });

      await certificate.save();

      // Update webinar attended users with certificate number
      await WebinarModel.updateOne(
        { _id: webinarId, "attendedUsers.userId": userId },
        { $set: { "attendedUsers.$.certificateNumber": certificateNumber } }
      );

      logInfo(`Certificate generated successfully: ${certificateNumber}`);

      // Send email if requested
      if (sendEmail) {
        try {
          await this.sendCertificateByEmail((certificate as any)._id.toString());
        } catch (emailError) {
          logError(`Failed to send certificate email: ${(emailError as Error).message}`);
          // Don't fail the generation if email fails
        }
      }

      return {
        success: true,
        certificateId: certificate._id,
        certificateUrl: certificate.certificateUrl,
        certificateNumber,
      };
    } catch (error) {
      logError(`Error generating certificate: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Create certificate image from template
   */
  private static async createCertificateImage(
    config: any,
    fieldData: Record<string, string>
  ): Promise<Buffer> {
    try {
      const dimensions = config.dimensions || { width: 800, height: 600 };

      // Create canvas
      const canvas = createCanvas(dimensions.width, dimensions.height);
      const ctx = canvas.getContext("2d");

      // Draw background
      if (config.backgroundImage) {
        try {
          const background = await loadImage(config.backgroundImage);
          ctx.drawImage(background, 0, 0, dimensions.width, dimensions.height);
        } catch (error) {
          logError(`Error loading background: ${(error as Error).message}`);
          // Fallback to white background
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, dimensions.width, dimensions.height);
        }
      } else {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, dimensions.width, dimensions.height);
      }

      // Draw fields
      if (config.fields && Array.isArray(config.fields)) {
        for (const field of config.fields) {
          await this.drawField(ctx, field, fieldData, dimensions);
        }
      }

      // Convert to buffer
      return canvas.toBuffer("image/png");
    } catch (error) {
      logError(`Error creating certificate image: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Draw a field on the canvas
   */
  private static async drawField(
    ctx: any,
    field: any,
    fieldData: Record<string, string>,
    dimensions: { width: number; height: number }
  ): Promise<void> {
    try {
      const x = (field.position.x / 100) * dimensions.width;
      const y = (field.position.y / 100) * dimensions.height;

      ctx.save();
      ctx.translate(x, y);

      if (field.rotation) {
        ctx.rotate((field.rotation * Math.PI) / 180);
      }

      // Get field value - replace placeholder with actual data
      let value = field.placeholder || field.label || "";
      
      // Replace placeholders like {{attendeeName}}
      value = value.replace(/\{\{(\w+)\}\}/g, (match: string, key: string) => {
        return fieldData[key] || match;
      });

      // Set text properties
      const fontWeight = field.fontWeight === "bold" ? "bold" : field.fontWeight === "light" ? "300" : "normal";
      ctx.font = `${fontWeight} ${field.fontSize}px ${field.fontFamily || "Arial"}`;
      ctx.fillStyle = field.fontColor || "#000000";
      ctx.globalAlpha = field.opacity !== undefined ? field.opacity : 1;
      ctx.textAlign = field.textAlign || "center";
      ctx.textBaseline = "middle";

      // Draw text
      ctx.fillText(value, 0, 0);

      ctx.restore();
    } catch (error) {
      logError(`Error drawing field: ${(error as Error).message}`);
    }
  }

  /**
   * Generate unique certificate number
   */
  private static async generateCertificateNumber(
    webinarId: string,
    userId: string
  ): Promise<string> {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    const webinarShort = webinarId.substring(webinarId.length - 4).toUpperCase();
    return `CERT-${webinarShort}-${timestamp}-${random}`;
  }

  /**
   * Bulk generate certificates for all attendees
   */
  static async bulkGenerateCertificates(
    options: BulkGenerateOptions
  ): Promise<any> {
    try {
      const { webinarId, attendeeIds, sendEmail, priority } = options;

      logInfo(`Starting bulk generation for ${attendeeIds.length} attendees`);

      // Create a job
      const job = new CertificateJob({
        webinarId: new mongoose.Types.ObjectId(webinarId),
        jobType: "batch",
        status: "pending",
        priority: priority || "normal",
        attendeeIds: attendeeIds.map(id => new mongoose.Types.ObjectId(id)),
        progress: {
          total: attendeeIds.length,
          completed: 0,
          failed: 0,
        },
        createdBy: new mongoose.Types.ObjectId(attendeeIds[0]), // Use first attendee as creator
        results: [],
      });

      await job.save();

      // Process in background (you can use a queue system like Bull)
      this.processJobInBackground((job as any)._id.toString(), sendEmail || false);

      return {
        success: true,
        jobId: job._id,
        totalCertificates: attendeeIds.length,
      };
    } catch (error) {
      logError(`Error starting bulk generation: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Process certificate job in background
   */
  private static async processJobInBackground(
    jobId: string,
    sendEmail: boolean
  ): Promise<void> {
    try {
      const job = await CertificateJob.findById(jobId);
      if (!job) return;

      job.status = "processing";
      job.startedAt = new Date();
      await job.save();

      const webinar = await WebinarModel.findById(job.webinarId).populate("hostId");
      if (!webinar) {
        job.status = "failed";
        job.errorMessage = "Webinar not found";
        await job.save();
        return;
      }

      const hostName = webinar.hostId
        ? `${(webinar.hostId as any).firstName} ${(webinar.hostId as any).lastName}`
        : "Host";

      for (const userId of job.attendeeIds) {
        try {
          const user = await UserModel.findById(userId);
          if (!user) continue;

          const result = await this.generateCertificate({
            webinarId: job.webinarId.toString(),
            userId: userId.toString(),
            attendeeName: `${user.firstName} ${user.lastName}`,
            webinarTitle: webinar.title,
            webinarDate: webinar.date,
            hostName,
            sendEmail,
          });

          job.results.push({
            userId,
            status: "success",
            certificateId: new mongoose.Types.ObjectId(result.certificateId),
            processedAt: new Date(),
          });
          job.progress.completed++;
        } catch (error) {
          job.results.push({
            userId,
            status: "failed",
            error: (error as Error).message,
            processedAt: new Date(),
          });
          job.progress.failed++;
        }

        await job.save();
      }

      job.status = "completed";
      job.completedAt = new Date();
      await job.save();

      logInfo(`Bulk generation completed: ${job.progress.completed} succeeded, ${job.progress.failed} failed`);
    } catch (error) {
      logError(`Error processing job: ${(error as Error).message}`);
      await CertificateJob.findByIdAndUpdate(jobId, {
        status: "failed",
        errorMessage: (error as Error).message,
      });
    }
  }

  /**
   * Send certificate by email
   */
  static async sendCertificateByEmail(certificateId: string): Promise<void> {
    try {
      const certificate = await GeneratedCertificate.findById(certificateId)
        .populate("userId")
        .populate("webinarId");

      if (!certificate) {
        throw new Error("Certificate not found");
      }

      const user = certificate.userId as any;
      const webinar = certificate.webinarId as any;

      await sendCertificateEmail({
        to: user.email,
        recipientName: `${user.firstName} ${user.lastName}`,
        webinarTitle: webinar.title,
        certificateNumber: certificate.certificateNumber,
        certificateAttachment: certificate.certificateUrl,
      });

      certificate.emailSent = true;
      certificate.emailSentAt = new Date();
      await certificate.save();

      logInfo(`Certificate email sent to ${user.email}`);
    } catch (error) {
      logError(`Error sending certificate email: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Get user's certificates
   */
  static async getUserCertificates(userId: string): Promise<any[]> {
    try {
      const certificates = await GeneratedCertificate.find({ userId })
        .populate("webinarId", "title date")
        .sort({ generatedAt: -1 })
        .lean();

      return certificates;
    } catch (error) {
      logError(`Error fetching user certificates: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Get certificate by ID
   */
  static async getCertificate(certificateId: string): Promise<any> {
    try {
      const certificate = await GeneratedCertificate.findById(certificateId)
        .populate("userId", "firstName lastName email")
        .populate("webinarId", "title date")
        .lean();

      if (!certificate) {
        throw new Error("Certificate not found");
      }

      return certificate;
    } catch (error) {
      logError(`Error fetching certificate: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Track certificate download
   */
  static async trackDownload(certificateId: string): Promise<void> {
    try {
      await GeneratedCertificate.findByIdAndUpdate(certificateId, {
        $inc: { downloadCount: 1 },
      });
    } catch (error) {
      logError(`Error tracking download: ${(error as Error).message}`);
    }
  }

  /**
   * Get job status
   */
  static async getJobStatus(jobId: string): Promise<any> {
    try {
      const job = await CertificateJob.findById(jobId).lean();
      if (!job) {
        throw new Error("Job not found");
      }
      return job;
    } catch (error) {
      logError(`Error fetching job status: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Auto-generate certificates after webinar ends
   */
  static async autoGenerateAfterWebinar(webinarId: string): Promise<any> {
    try {
      logInfo(`Auto-generating certificates for webinar ${webinarId}`);

      const webinar = await WebinarModel.findById(webinarId);
      if (!webinar || !webinar.hasCertification) {
        return { success: false, message: "Webinar not configured for certificates" };
      }

      // Get all attended users
      const attendeeIds = webinar.attendedUsers
        .filter(att => att.totalDuration > 0) // Only users who actually attended
        .map(att => att.userId.toString());

      if (attendeeIds.length === 0) {
        return { success: false, message: "No attendees found" };
      }

      // Start bulk generation
      return await this.bulkGenerateCertificates({
        webinarId,
        attendeeIds,
        sendEmail: true,
        priority: "high",
      });
    } catch (error) {
      logError(`Error in auto-generation: ${(error as Error).message}`);
      throw error;
    }
  }
}

export default CertificateService;
