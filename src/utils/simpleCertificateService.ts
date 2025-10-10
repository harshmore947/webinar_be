import {
  GeneratedCertificate,
  ICertificateJob,
} from "../models/Certificate.model";
import WebinarModel, { IWebinar } from "../models/Webinar.model";
import UserModel from "../models/User.model";
import { logError, logInfo } from "./logger";

export class SimpleCertificateService {
  /**
   * Get certificate for a specific user and webinar
   */
  static async getUserCertificateForWebinar(userId: string, webinarId: string) {
    try {
      const certificate = await GeneratedCertificate.findOne({
        userId,
        webinarId,
        status: "completed",
      });

      if (!certificate) {
        return { success: false, message: "Certificate not found" };
      }

      return {
        success: true,
        certificate: {
          certificateNumber: certificate.certificateNumber,
          downloadUrl: certificate.downloadUrl,
          issuedDate: certificate.generatedAt,
          status: certificate.status,
          attendeeName:
            certificate.certificateData.get("attendeeName") || "Unknown",
        },
      };
    } catch (error) {
      logError("Error getting user certificate:", error as Error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Request certificate generation for a user
   */
  static async requestCertificateForUser(
    userId: string,
    webinarId: string
  ): Promise<{
    success: boolean;
    jobId?: string;
    message?: string;
    error?: string;
  }> {
    try {
      // Check if webinar exists
      const webinar = await WebinarModel.findById(webinarId).populate(
        "hostId",
        "firstName lastName"
      );
      if (!webinar) {
        return { success: false, error: "Webinar not found" };
      }

      // Check if user attended the webinar
      const attendedUser = webinar.attendedUsers.find(
        (attended: any) => attended.userId.toString() === userId
      );

      if (!attendedUser) {
        return { success: false, error: "User did not attend this webinar" };
      }

      // Check if user has minimum attendance duration (30 minutes)
      if (attendedUser.totalDuration < 30) {
        return {
          success: false,
          error: "Minimum attendance requirement not met (30 minutes required)",
        };
      }

      // Check if certificate already exists
      const existingCertificate = await GeneratedCertificate.findOne({
        userId,
        webinarId,
        status: { $in: ["completed", "processing"] },
      });

      if (existingCertificate) {
        if (existingCertificate.status === "completed") {
          return {
            success: true,
            message: "Certificate already exists",
            jobId: existingCertificate.jobId?.toString(),
          };
        } else {
          return {
            success: true,
            message: "Certificate is being processed",
            jobId: existingCertificate.jobId?.toString(),
          };
        }
      }

      // Get user details
      const user = await UserModel.findById(userId);
      if (!user) {
        return { success: false, error: "User not found" };
      }

      // Calculate webinar end time
      let webinarEndTime;
      if (webinar.date && webinar.time) {
        webinarEndTime = new Date(`${webinar.date}T${webinar.time}:00`);
        webinarEndTime.setHours(webinarEndTime.getHours() + 2);
      } else {
        webinarEndTime = new Date(webinar.date);
      }

      // Check if webinar has ended
      if (new Date() < webinarEndTime) {
        return {
          success: false,
          error: "Certificate can only be requested after webinar ends",
        };
      }

      // Generate certificate number
      const certificateNumber = await this.generateCertificateNumber(
        webinarId,
        userId
      );

      // Create certificate record
      const certificateData = new Map();
      certificateData.set("attendeeName", `${user.firstName} ${user.lastName}`);
      certificateData.set("attendeeEmail", user.email);
      certificateData.set("webinarTitle", webinar.title);
      certificateData.set("webinarDate", webinarEndTime.toISOString());
      certificateData.set("completionDate", new Date().toISOString());
      certificateData.set(
        "hostName",
        `${(webinar.hostId as any)?.firstName || "Host"} ${
          (webinar.hostId as any)?.lastName || ""
        }`.trim()
      );
      certificateData.set("webinarDuration", "2 hours"); // Default duration
      certificateData.set(
        "attendanceDuration",
        `${attendedUser.totalDuration} minutes`
      );

      const certificate = new GeneratedCertificate({
        userId,
        webinarId,
        certificateNumber,
        status: "processing",
        jobId: `req_${Date.now()}_${userId}`,
        certificateData,
        templateUsed: webinar.certificateTemplate || "default",
        certificateUrl: "", // Will be set after generation
        thumbnailUrl: "", // Will be set after generation
        publicId: "", // Will be set after generation
        generatedAt: new Date(),
      });

      await certificate.save();

      // Simulate certificate processing (in real implementation, this would be queued)
      setTimeout(async () => {
        try {
          // Update certificate status to completed
          certificate.status = "completed";
          certificate.downloadUrl = `https://certificates.example.com/${certificate.certificateNumber}.pdf`;
          await certificate.save();

          logInfo(
            `Certificate generated for user ${userId} in webinar ${webinarId}`
          );
        } catch (error) {
          logError("Error updating certificate status:", error as Error);
          certificate.status = "failed";
          await certificate.save();
        }
      }, 3000); // 3 second delay to simulate processing

      return {
        success: true,
        jobId: certificate.jobId?.toString(),
        message: "Certificate generation requested successfully",
      };
    } catch (error) {
      logError("Error requesting certificate:", error as Error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Get job status
   */
  static async getJobStatus(jobId: string) {
    try {
      const certificate = await GeneratedCertificate.findOne({ jobId });

      if (!certificate) {
        return { success: false, message: "Job not found" };
      }

      return {
        success: true,
        status: certificate.status,
        progress:
          certificate.status === "completed"
            ? 100
            : certificate.status === "processing"
            ? 50
            : 0,
        downloadUrl: certificate.downloadUrl,
        message:
          certificate.status === "failed"
            ? "Certificate generation failed"
            : undefined,
      };
    } catch (error) {
      logError("Error getting job status:", error as Error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Verify certificate by number
   */
  static async verifyCertificate(certificateNumber: string) {
    try {
      const certificate = await GeneratedCertificate.findOne({
        certificateNumber,
        status: "completed",
      }).populate([
        { path: "userId", select: "firstName lastName email" },
        { path: "webinarId", select: "title date time" },
      ]);

      if (!certificate) {
        return {
          success: false,
          verified: false,
          message: "Certificate not found or invalid",
        };
      }

      return {
        success: true,
        verified: true,
        certificate: {
          certificateNumber: certificate.certificateNumber,
          attendeeName:
            certificate.certificateData.get("attendeeName") || "Unknown",
          webinarTitle:
            certificate.certificateData.get("webinarTitle") || "Webinar",
          issuedDate: certificate.generatedAt,
          downloadUrl: certificate.downloadUrl,
        },
      };
    } catch (error) {
      logError("Error verifying certificate:", error as Error);
      return { success: false, error: (error as Error).message };
    }
  }

  private static async generateCertificateNumber(
    webinarId: string,
    userId: string
  ): Promise<string> {
    const timestamp = Date.now().toString(36);
    const webinarCode = webinarId.slice(-6);
    const userCode = userId.slice(-4);
    return `CERT-${webinarCode}-${userCode}-${timestamp}`.toUpperCase();
  }
}
