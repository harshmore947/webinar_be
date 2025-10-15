import {
  CertificateTemplateModel,
  ICertificateTemplate,
  GeneratedCertificate,
  CertificateJob,
  ICertificateJob,
} from "../models/Certificate.model";
import WebinarModel, { IWebinar } from "../models/Webinar.model";
import { IUser } from "../models/User.model";
import UserModel from "../models/User.model";
import {
  generateEnhancedCertificate,
  EnhancedCertificateData,
} from "./enhancedCertificateGenerator";
import { certificateQueue } from "./certificateQueue";
import { logError, logInfo } from "./logger";
import crypto from "crypto";

/**
 * Certificate Service - Handles all certificate-related operations
 */
export class CertificateService {
  /**
   * Create a new certificate template
   */
  static async createTemplate(templateData: {
    name: string;
    description?: string;
    backgroundImage?: string;
    dimensions: { width: number; height: number };
    fields: any[];
    tags?: string[];
    isPublic?: boolean;
    createdBy: string;
  }) {
    try {
      const template = new CertificateTemplateModel({
        ...templateData,
        isPublic: templateData.isPublic || false,
        usageCount: 0,
      });

      await template.save();
      logInfo(`Certificate template created: ${template._id}`);
      return { success: true, template };
    } catch (error) {
      logError("Error creating certificate template:", error as Error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Get templates with filtering
   */
  static async getTemplates(
    filters: {
      isPublic?: boolean;
      createdBy?: string;
      tags?: string[];
      search?: string;
      page?: number;
      limit?: number;
    } = {}
  ) {
    try {
      const {
        isPublic,
        createdBy,
        tags,
        search,
        page = 1,
        limit = 20,
      } = filters;

      const query: any = {};

      if (isPublic !== undefined) query.isPublic = isPublic;
      if (createdBy) query.createdBy = createdBy;
      if (tags && tags.length > 0) query.tags = { $in: tags };
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
          { tags: { $regex: search, $options: "i" } },
        ];
      }

      const templates = await CertificateTemplateModel.find(query)
        .populate("createdBy", "firstName lastName email")
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip((page - 1) * limit);

      const total = await CertificateTemplateModel.countDocuments(query);

      return {
        success: true,
        templates,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      logError("Error fetching certificate templates:", error as Error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Generate single certificate
   */
  static async generateSingleCertificate(
    webinarId: string,
    userId: string,
    certificateData: Partial<EnhancedCertificateData>,
    options?: {
      templateId?: string;
      priority?: number;
      customFields?: { [key: string]: any };
    }
  ) {
    try {
      // Generate unique certificate number
      const certificateNumber = await this.generateCertificateNumber(
        webinarId,
        userId
      );

      // Create certificate job
      const job = new CertificateJob({
        webinarId,
        userIds: [userId],
        status: "pending",
        templateId: options?.templateId,
        customData: options?.customFields,
        priority: options?.priority || 0,
        totalCertificates: 1,
        completedCertificates: 0,
        failedCertificates: 0,
      });

      await job.save();

      // Add to queue
      const queueJob = await certificateQueue.add(
        "generateSingleCertificate",
        {
          jobId: (job._id as any).toString(),
          webinarId,
          userId,
          certificateNumber,
          certificateData: {
            ...certificateData,
            certificateNumber,
          },
          templateId: options?.templateId,
          customFields: options?.customFields,
        },
        {
          priority: options?.priority || 0,
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 2000,
          },
        }
      );

      logInfo(
        `Single certificate generation queued for user ${userId} in webinar ${webinarId}`
      );

      return {
        success: true,
        jobId: (job._id as any).toString(),
        queueJobId: queueJob.id,
        certificateNumber,
      };
    } catch (error) {
      logError("Error queuing single certificate generation:", error as Error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Generate bulk certificates for webinar attendees
   */
  static async generateBulkCertificates(
    webinarId: string,
    attendeeData: Array<{
      userId: string;
      certificateData: Partial<EnhancedCertificateData>;
    }>,
    options?: {
      templateId?: string;
      priority?: number;
      batchSize?: number;
      customFields?: { [key: string]: any };
    }
  ) {
    try {
      const batchSize = options?.batchSize || 10;
      const batches = this.chunkArray(attendeeData, batchSize);

      // Create main job
      const job = new CertificateJob({
        webinarId,
        userIds: attendeeData.map((a) => a.userId),
        status: "pending",
        templateId: options?.templateId,
        customData: options?.customFields,
        priority: options?.priority || 0,
        totalCertificates: attendeeData.length,
        completedCertificates: 0,
        failedCertificates: 0,
      });

      await job.save();

      // Add batch jobs to queue
      const queueJobs = [];
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const batchData = await Promise.all(
          batch.map(async (attendee) => ({
            ...attendee,
            certificateNumber: await this.generateCertificateNumber(
              webinarId,
              attendee.userId
            ),
          }))
        );

        const queueJob = await certificateQueue.add(
          "generateBatchCertificates",
          {
            jobId: (job._id as any).toString(),
            webinarId,
            batchIndex: i,
            attendees: batchData,
            templateId: options?.templateId,
            customFields: options?.customFields,
          },
          {
            priority: options?.priority || 0,
            attempts: 3,
            backoff: {
              type: "exponential",
              delay: 2000,
            },
          }
        );

        queueJobs.push(queueJob.id);
      }

      logInfo(
        `Bulk certificate generation queued for ${attendeeData.length} users in webinar ${webinarId}`
      );

      return {
        success: true,
        jobId: (job._id as any).toString(),
        queueJobIds: queueJobs,
        totalBatches: batches.length,
        totalCertificates: attendeeData.length,
      };
    } catch (error) {
      logError("Error queuing bulk certificate generation:", error as Error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Get certificate generation status
   */
  static async getJobStatus(jobId: string) {
    try {
      const job = await CertificateJob.findById(jobId);
      if (!job) {
        return { success: false, error: "Job not found" };
      }

      return {
        success: true,
        job: {
          id: job._id,
          status: (job as any).status,
          progress:
            (job as any).totalCertificates > 0
              ? ((job as any).completedCertificates /
                  (job as any).totalCertificates) *
                100
              : 0,
          totalCertificates: (job as any).totalCertificates,
          completedCertificates: (job as any).completedCertificates,
          failedCertificates: (job as any).failedCertificates,
          error: (job as any).error,
          createdAt: (job as any).createdAt,
          updatedAt: (job as any).updatedAt,
        },
      };
    } catch (error) {
      logError("Error fetching job status:", error as Error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Get certificates for a user
   */
  static async getUserCertificates(
    userId: string,
    filters?: {
      webinarId?: string;
      status?: string;
      page?: number;
      limit?: number;
    }
  ) {
    try {
      const { webinarId, status, page = 1, limit = 20 } = filters || {};

      const query: any = { userId };
      if (webinarId) query.webinarId = webinarId;
      if (status) query.status = status;

      const certificates = await GeneratedCertificate.find(query)
        .populate("webinarId", "title description startDate")
        .sort({ generatedAt: -1 })
        .limit(limit)
        .skip((page - 1) * limit);

      const total = await GeneratedCertificate.countDocuments(query);

      return {
        success: true,
        certificates,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      logError("Error fetching user certificates:", error as Error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Get certificates for a webinar
   */
  static async getWebinarCertificates(
    webinarId: string,
    filters?: {
      status?: string;
      page?: number;
      limit?: number;
    }
  ) {
    try {
      const { status, page = 1, limit = 50 } = filters || {};

      const query: any = { webinarId };
      if (status) query.status = status;

      const certificates = await GeneratedCertificate.find(query)
        .populate("userId", "firstName lastName email")
        .sort({ generatedAt: -1 })
        .limit(limit)
        .skip((page - 1) * limit);

      const total = await GeneratedCertificate.countDocuments(query);

      return {
        success: true,
        certificates,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      logError("Error fetching webinar certificates:", error as Error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Verify certificate authenticity
   */
  static async verifyCertificate(certificateNumber: string) {
    try {
      const certificate = await GeneratedCertificate.findOne({
        certificateNumber,
        status: "completed",
      })
        .populate("userId", "firstName lastName email")
        .populate("webinarId", "title description date time")
        .populate({
          path: "webinarId",
          populate: {
            path: "hostId",
            select: "firstName lastName",
          },
        });

      if (!certificate) {
        return { success: false, error: "Certificate not found or invalid" };
      }

      return {
        success: true,
        certificate: {
          certificateNumber: certificate.certificateNumber,
          participantName: `${(certificate.userId as any).firstName} ${
            (certificate.userId as any).lastName
          }`,
          webinarTitle: (certificate.webinarId as any).title,
          generatedAt: certificate.generatedAt,
          isValid: true,
        },
      };
    } catch (error) {
      logError("Error verifying certificate:", error as Error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Auto-generate certificates when webinar ends
   */
  static async autoGenerateOnWebinarEnd(webinarId: string) {
    try {
      const webinar = await WebinarModel.findById(webinarId).populate(
        "attendedUsers.userId"
      );
      if (!webinar) {
        return { success: false, error: "Webinar not found" };
      }

      // Check if webinar has ended (using date and time)
      let webinarEndTime;
      if (webinar.date && webinar.time) {
        webinarEndTime = new Date(`${webinar.date}T${webinar.time}:00`);
        // Add 2 hours for typical webinar duration
        webinarEndTime.setHours(webinarEndTime.getHours() + 2);
      } else {
        webinarEndTime = new Date(webinar.date);
      }

      if (!webinarEndTime || new Date() < webinarEndTime) {
        return { success: false, error: "Webinar has not ended yet" };
      }

      // Get qualified attendees (those who attended for minimum duration)
      const qualifiedAttendees = webinar.attendedUsers.filter(
        (attendee: any) => {
          // Require at least 30 minutes of attendance
          return attendee.totalDuration >= 30;
        }
      );

      if (qualifiedAttendees.length === 0) {
        logInfo(`No qualified attendees found for webinar ${webinarId}`);
        return { success: true, message: "No qualified attendees" };
      }

      // Prepare certificate data for each attendee
      const attendeeData = await Promise.all(
        qualifiedAttendees.map(async (attendee: any) => {
          const user = await UserModel.findById(attendee.userId);
          return {
            userId: attendee.userId.toString(),
            certificateData: {
              attendeeName: user
                ? `${user.firstName} ${user.lastName}`
                : "Unknown Attendee",
              attendeeEmail: user?.email || "",
              webinarTitle: webinar.title,
              webinarDate:
                webinarEndTime?.toISOString() || new Date().toISOString(),
              completionDate: new Date().toISOString(),
              hostName: `${(webinar.hostId as any)?.firstName || "Host"} ${
                (webinar.hostId as any)?.lastName || ""
              }`.trim(),
              webinarDuration: this.calculateDuration(
                webinarEndTime,
                webinarEndTime
              ),
              attendanceDuration: `${attendee.totalDuration || 0} minutes`,
            },
          };
        })
      );

      // Generate certificates in bulk
      const result = await this.generateBulkCertificates(
        webinarId,
        attendeeData,
        {
          templateId: webinar.certificateTemplate?.cloudinaryTemplateId, // Use cloudinaryTemplateId from certificateTemplate
          priority: 5, // High priority for auto-generation
          batchSize: 15,
        }
      );

      if (result.success) {
        // Update webinar to mark certificates as generated
        await WebinarModel.findByIdAndUpdate(webinarId, {
          "certificateConfig.autoGenerated": true,
          "certificateConfig.generatedAt": new Date(),
          "certificateConfig.jobId": result.jobId,
        });

        logInfo(
          `Auto-certificate generation initiated for webinar ${webinarId}, ${attendeeData.length} attendees`
        );
      }

      return result;
    } catch (error) {
      logError("Error in auto-generating certificates:", error as Error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Regenerate failed certificates
   */
  static async regenerateFailedCertificates(jobId: string) {
    try {
      const failedCertificates = await GeneratedCertificate.find({
        jobId,
        status: "failed",
      });

      if (failedCertificates.length === 0) {
        return {
          success: true,
          message: "No failed certificates to regenerate",
        };
      }

      // Group by webinar for bulk processing
      const webinarGroups = failedCertificates.reduce((groups, cert) => {
        const webinarId = cert.webinarId.toString();
        if (!groups[webinarId]) groups[webinarId] = [];
        groups[webinarId].push(cert);
        return groups;
      }, {} as { [key: string]: any[] });

      const results = [];
      for (const [webinarId, certificates] of Object.entries(webinarGroups)) {
        const attendeeData = certificates.map((cert) => ({
          userId: cert.userId.toString(),
          certificateData: cert.certificateData,
        }));

        const result = await this.generateBulkCertificates(
          webinarId,
          attendeeData,
          { priority: 10 } // Highest priority for regeneration
        );

        results.push(result);
      }

      return { success: true, results };
    } catch (error) {
      logError("Error regenerating failed certificates:", error as Error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Helper methods
   */
  private static async generateCertificateNumber(
    webinarId: string,
    userId: string
  ): Promise<string> {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString("hex").toUpperCase();
    const webinarShort = webinarId.slice(-4).toUpperCase();
    const userShort = userId.slice(-4).toUpperCase();

    return `CERT-${webinarShort}-${userShort}-${timestamp}-${random}`;
  }

  private static chunkArray<T>(array: T[], size: number): T[][] {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private static calculateDuration(startDate?: Date, endDate?: Date): string {
    if (!startDate || !endDate) return "N/A";

    const duration = endDate.getTime() - startDate.getTime();
    const hours = Math.floor(duration / (1000 * 60 * 60));
    const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));

    return `${hours}h ${minutes}m`;
  }

  private static calculateAttendanceDuration(
    joinedAt?: Date,
    leftAt?: Date
  ): string {
    if (!joinedAt || !leftAt) return "N/A";

    const duration = leftAt.getTime() - joinedAt.getTime();
    const hours = Math.floor(duration / (1000 * 60 * 60));
    const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));

    return `${hours}h ${minutes}m`;
  }
}

/**
 * Statistics and Analytics
 */
export class CertificateAnalytics {
  /**
   * Get certificate generation statistics
   */
  static async getStatistics(filters?: {
    webinarId?: string;
    startDate?: Date;
    endDate?: Date;
    templateId?: string;
  }) {
    try {
      const query: any = {};

      if (filters?.webinarId) query.webinarId = filters.webinarId;
      if (filters?.templateId) query.templateId = filters.templateId;
      if (filters?.startDate || filters?.endDate) {
        query.generatedAt = {};
        if (filters.startDate) query.generatedAt.$gte = filters.startDate;
        if (filters.endDate) query.generatedAt.$lte = filters.endDate;
      }

      const [
        totalCertificates,
        completedCertificates,
        failedCertificates,
        stats,
      ] = await Promise.all([
        GeneratedCertificate.countDocuments(query),
        GeneratedCertificate.countDocuments({ ...query, status: "completed" }),
        GeneratedCertificate.countDocuments({ ...query, status: "failed" }),
        GeneratedCertificate.aggregate([
          { $match: query },
          {
            $group: {
              _id: {
                year: { $year: "$generatedAt" },
                month: { $month: "$generatedAt" },
                day: { $dayOfMonth: "$generatedAt" },
              },
              count: { $sum: 1 },
              completed: {
                $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
              },
              failed: {
                $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] },
              },
            },
          },
          { $sort: { "_id.year": -1, "_id.month": -1, "_id.day": -1 } },
          { $limit: 30 },
        ]),
      ]);

      return {
        success: true,
        statistics: {
          total: totalCertificates,
          completed: completedCertificates,
          failed: failedCertificates,
          successRate:
            totalCertificates > 0
              ? (completedCertificates / totalCertificates) * 100
              : 0,
          dailyStats: stats,
        },
      };
    } catch (error) {
      logError("Error fetching certificate statistics:", error as Error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Get popular templates
   */
  static async getPopularTemplates(limit = 10) {
    try {
      const templates = await CertificateTemplateModel.find({
        usageCount: { $gt: 0 },
      })
        .sort({ usageCount: -1 })
        .limit(limit)
        .populate("createdBy", "firstName lastName");

      return { success: true, templates };
    } catch (error) {
      logError("Error fetching popular templates:", error as Error);
      return { success: false, error: (error as Error).message };
    }
  }
}
