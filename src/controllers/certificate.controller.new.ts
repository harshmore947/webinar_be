/**
 * Certificate Controller - Handles all certificate-related HTTP requests
 */

import { Request, Response } from "express";
import CertificateService from "../services/certificate.service";
import { GeneratedCertificate, CertificateTemplateModel } from "../models/Certificate.model";
import WebinarModel from "../models/Webinar.model";
import UserModel from "../models/User.model";
import { logInfo, logError } from "../utils/logger";

/**
 * Save a certificate template
 * POST /api/certificates/template
 */
export const saveCertificateTemplate = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const template = req.body;

    const result = await CertificateService.saveTemplate(template, userId);

    res.status(201).json({
      success: true,
      message: "Certificate template saved successfully",
      data: result,
    });
  } catch (error) {
    logError(`Error saving template: ${(error as Error).message}`);
    res.status(500).json({
      success: false,
      message: "Failed to save certificate template",
      error: (error as Error).message,
    });
  }
};

/**
 * Get all certificate templates
 * GET /api/certificates/templates
 */
export const getCertificateTemplates = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const templates = await CertificateService.getTemplates(userId);

    res.status(200).json({
      success: true,
      count: templates.length,
      data: templates,
    });
  } catch (error) {
    logError(`Error fetching templates: ${(error as Error).message}`);
    res.status(500).json({
      success: false,
      message: "Failed to fetch templates",
      error: (error as Error).message,
    });
  }
};

/**
 * Get a specific template by ID
 * GET /api/certificates/templates/:id
 */
export const getCertificateTemplate = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const template = await CertificateTemplateModel.findById(id)
      .populate("createdBy", "firstName lastName email");

    if (!template) {
      return res.status(404).json({
        success: false,
        message: "Template not found",
      });
    }

    res.status(200).json({
      success: true,
      data: template,
    });
  } catch (error) {
    logError(`Error fetching template: ${(error as Error).message}`);
    res.status(500).json({
      success: false,
      message: "Failed to fetch template",
      error: (error as Error).message,
    });
  }
};

/**
 * Update webinar with certificate template
 * PUT /api/certificates/webinar/:webinarId/template
 */
export const updateWebinarTemplate = async (req: Request, res: Response) => {
  try {
    const { webinarId } = req.params;
    const { certificateConfig, hasCertification } = req.body;
    const userId = req.user?.id;

    const webinar = await WebinarModel.findById(webinarId);
    if (!webinar) {
      return res.status(404).json({
        success: false,
        message: "Webinar not found",
      });
    }

    // Check permissions
    if (webinar.hostId.toString() !== userId && req.user?.role !== "Admin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized to update this webinar",
      });
    }

    webinar.certificateConfig = certificateConfig;
    webinar.hasCertification = hasCertification;
    await webinar.save();

    res.status(200).json({
      success: true,
      message: "Webinar certificate configuration updated",
      data: {
        hasCertification: webinar.hasCertification,
        certificateConfig: webinar.certificateConfig,
      },
    });
  } catch (error) {
    logError(`Error updating webinar template: ${(error as Error).message}`);
    res.status(500).json({
      success: false,
      message: "Failed to update webinar template",
      error: (error as Error).message,
    });
  }
};

/**
 * Generate a single certificate for a participant
 * POST /api/certificates/generate
 */
export const generateCertificateForParticipant = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { webinarId, attendeeName, sendEmail } = req.body;

    // Fetch webinar to get details
    const webinar = await WebinarModel.findById(webinarId).populate("hostId");
    if (!webinar) {
      return res.status(404).json({
        success: false,
        message: "Webinar not found",
      });
    }

    // Check if user is enrolled or attended
    const isEnrolled = webinar.enrolledUsers.some(id => id.toString() === userId);
    const hasAttended = webinar.attendedUsers.some(att => att.userId.toString() === userId);

    if (!isEnrolled && !hasAttended) {
      return res.status(403).json({
        success: false,
        message: "You must be enrolled or have attended this webinar",
      });
    }

    // Get user details for attendee name
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const hostName = webinar.hostId
      ? `${(webinar.hostId as any).firstName} ${(webinar.hostId as any).lastName}`
      : "Host";

    const result = await CertificateService.generateCertificate({
      webinarId,
      userId,
      attendeeName: attendeeName || `${user.firstName} ${user.lastName}`,
      webinarTitle: webinar.title,
      webinarDate: webinar.date,
      hostName,
      sendEmail: sendEmail || false,
    });

    res.status(201).json({
      success: true,
      message: result.alreadyExists
        ? "Certificate already exists"
        : "Certificate generated successfully",
      data: result,
    });
  } catch (error) {
    logError(`Error generating certificate: ${(error as Error).message}`);
    res.status(500).json({
      success: false,
      message: "Failed to generate certificate",
      error: (error as Error).message,
    });
  }
};

/**
 * Generate certificates for all webinar attendees (bulk)
 * POST /api/certificates/generate/webinar/:webinarId
 * POST /api/certificates/generate/bulk (with webinarId in body)
 */
export const generateCertificatesForWebinar = async (req: Request, res: Response) => {
  try {
    // Support both params and body for webinarId
    const webinarId = req.params.webinarId || req.body.webinarId;
    const { sendEmail, priority } = req.body;
    const userId = req.user?.id;

    if (!webinarId) {
      return res.status(400).json({
        success: false,
        message: "Webinar ID is required",
      });
    }

    const webinar = await WebinarModel.findById(webinarId);
    if (!webinar) {
      return res.status(404).json({
        success: false,
        message: "Webinar not found",
      });
    }

    // Check permissions - only host or admin can bulk generate
    if (webinar.hostId.toString() !== userId && req.user?.role !== "Admin") {
      return res.status(403).json({
        success: false,
        message: "Only the host or admin can generate certificates for all attendees",
      });
    }

    if (!webinar.hasCertification) {
      return res.status(400).json({
        success: false,
        message: "Certification is not enabled for this webinar",
      });
    }

    // Get all attendee IDs
    const attendeeIds = webinar.attendedUsers.map(att => att.userId.toString());

    if (attendeeIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No attendees found for this webinar",
      });
    }

    const result = await CertificateService.bulkGenerateCertificates({
      webinarId,
      attendeeIds,
      sendEmail: sendEmail || false,
      priority: priority || "normal",
    });

    res.status(202).json({
      success: true,
      message: "Certificate generation started",
      data: result,
    });
  } catch (error) {
    logError(`Error starting bulk generation: ${(error as Error).message}`);
    res.status(500).json({
      success: false,
      message: "Failed to start certificate generation",
      error: (error as Error).message,
    });
  }
};

/**
 * Get user's certificates
 * GET /api/certificates/my-certificates
 */
export const getUserCertificates = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const certificates = await CertificateService.getUserCertificates(userId);

    res.status(200).json({
      success: true,
      count: certificates.length,
      data: certificates,
    });
  } catch (error) {
    logError(`Error fetching user certificates: ${(error as Error).message}`);
    res.status(500).json({
      success: false,
      message: "Failed to fetch certificates",
      error: (error as Error).message,
    });
  }
};

/**
 * Get certificate for a specific webinar (for download button)
 * GET /api/certificates/webinar/:webinarId/certificate
 */
export const getCertificateForWebinar = async (req: Request, res: Response) => {
  try {
    const { webinarId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const certificate = await GeneratedCertificate.findOne({
      webinarId,
      userId,
    })
      .populate("webinarId", "title date")
      .lean();

    if (!certificate) {
      return res.status(404).json({
        success: false,
        message: "Certificate not found for this webinar",
        hasCertificate: false,
      });
    }

    res.status(200).json({
      success: true,
      hasCertificate: true,
      data: certificate,
    });
  } catch (error) {
    logError(`Error fetching webinar certificate: ${(error as Error).message}`);
    res.status(500).json({
      success: false,
      message: "Failed to fetch certificate",
      error: (error as Error).message,
    });
  }
};

/**
 * Download certificate
 * GET /api/certificates/:certificateId/download
 */
export const downloadCertificate = async (req: Request, res: Response) => {
  try {
    const { certificateId } = req.params;
    const userId = req.user?.id;
    const format = (req.query.format as string) || "pdf"; // Support both PDF and PNG

    const certificate = await CertificateService.getCertificate(certificateId);

    // Verify ownership (or admin)
    if (certificate.userId._id.toString() !== userId && req.user?.role !== "Admin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized to download this certificate",
      });
    }

    // Track download
    await CertificateService.trackDownload(certificateId);

    res.status(200).json({
      success: true,
      data: {
        certificateUrl: certificate.certificateUrl,
        certificateNumber: certificate.certificateNumber,
        downloadCount: (certificate.downloadCount || 0) + 1,
        format: format,
      },
    });
  } catch (error) {
    logError(`Error downloading certificate: ${(error as Error).message}`);
    res.status(500).json({
      success: false,
      message: "Failed to download certificate",
      error: (error as Error).message,
    });
  }
};

/**
 * Get certificate generation job status
 * GET /api/certificates/job/:jobId/status
 */
export const getCertificateStatus = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    const job = await CertificateService.getJobStatus(jobId);

    res.status(200).json({
      success: true,
      data: job,
    });
  } catch (error) {
    logError(`Error fetching job status: ${(error as Error).message}`);
    res.status(500).json({
      success: false,
      message: "Failed to fetch job status",
      error: (error as Error).message,
    });
  }
};

/**
 * Resend certificate email
 * POST /api/certificates/:certificateId/resend
 */
export const resendCertificateEmail = async (req: Request, res: Response) => {
  try {
    const { certificateId } = req.params;
    const userId = req.user?.id;

    const certificate = await GeneratedCertificate.findById(certificateId);
    if (!certificate) {
      return res.status(404).json({
        success: false,
        message: "Certificate not found",
      });
    }

    // Verify ownership
    if (certificate.userId.toString() !== userId && req.user?.role !== "Admin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized",
      });
    }

    await CertificateService.sendCertificateByEmail(certificateId);

    res.status(200).json({
      success: true,
      message: "Certificate email sent successfully",
    });
  } catch (error) {
    logError(`Error resending email: ${(error as Error).message}`);
    res.status(500).json({
      success: false,
      message: "Failed to resend certificate email",
      error: (error as Error).message,
    });
  }
};

/**
 * Trigger auto-generation after webinar ends
 * POST /api/certificates/auto-generate/:webinarId
 */
export const autoGenerateCertificates = async (req: Request, res: Response) => {
  try {
    const { webinarId } = req.params;
    const userId = req.user?.id;

    const webinar = await WebinarModel.findById(webinarId);
    if (!webinar) {
      return res.status(404).json({
        success: false,
        message: "Webinar not found",
      });
    }

    // Check permissions
    if (webinar.hostId.toString() !== userId && req.user?.role !== "Admin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const result = await CertificateService.autoGenerateAfterWebinar(webinarId);

    res.status(202).json({
      success: true,
      message: "Auto-generation started",
      data: result,
    });
  } catch (error) {
    logError(`Error in auto-generation: ${(error as Error).message}`);
    res.status(500).json({
      success: false,
      message: "Failed to start auto-generation",
      error: (error as Error).message,
    });
  }
};

/**
 * Direct PDF download for attendee (Fallback feature)
 * POST /api/certificates/download-pdf/:webinarId
 */
export const downloadCertificatePDF = async (req: Request, res: Response) => {
  try {
    const { webinarId } = req.params;
    const userId = req.user?.id;
    const { format = "pdf", regenerate = false } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Check if user is enrolled/attended
    const webinar = await WebinarModel.findById(webinarId)
      .populate("hostId", "firstName lastName");

    if (!webinar) {
      return res.status(404).json({
        success: false,
        message: "Webinar not found",
      });
    }

    // Find user's enrollment
    const enrollment = webinar.enrolledUsers.find(
      (e: any) => e.userId?.toString() === userId
    );

    if (!enrollment) {
      return res.status(403).json({
        success: false,
        message: "You must be enrolled in this webinar to download certificate",
      });
    }

    // Check if certificate already exists and is valid
    if (!regenerate && enrollment.cert?.status === "done" && enrollment.cert.cloudinaryUrl) {
      return res.status(200).json({
        success: true,
        message: "Certificate already exists",
        data: {
          certificateUrl: enrollment.cert.cloudinaryUrl,
          certificateNumber: enrollment.cert.certificateNumber,
          status: "completed",
        },
      });
    }

    // Generate certificate using the generation service
    const { generateCertificateForUser } = await import("../services/certificateGeneration.service");
    
    const result = await generateCertificateForUser(webinarId, userId, {
      startAsync: false, // Generate immediately for download
      sendEmail: false,
    });

    if (result.status === "completed") {
      // Fetch the generated certificate
      const updatedWebinar = await WebinarModel.findById(webinarId);
      const updatedEnrollment = updatedWebinar?.enrolledUsers.find(
        (e: any) => e.userId?.toString() === userId
      );

      return res.status(200).json({
        success: true,
        message: "Certificate generated successfully",
        data: {
          certificateUrl: updatedEnrollment?.cert?.cloudinaryUrl,
          certificateNumber: updatedEnrollment?.cert?.certificateNumber,
          status: "completed",
          format: format,
        },
      });
    } else {
      return res.status(500).json({
        success: false,
        message: "Certificate generation failed",
        error: (result as any).message || "Unknown error",
      });
    }
  } catch (error) {
    logError(`Error in downloadCertificatePDF: ${(error as Error).message}`);
    res.status(500).json({
      success: false,
      message: "Failed to generate certificate for download",
      error: (error as Error).message,
    });
  }
};

/**
 * Retry failed certificate generation
 * POST /api/certificates/retry/:webinarId
 */
export const retryCertificateGeneration = async (req: Request, res: Response) => {
  try {
    const { webinarId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const webinar = await WebinarModel.findById(webinarId);
    if (!webinar) {
      return res.status(404).json({
        success: false,
        message: "Webinar not found",
      });
    }

    // Find user's enrollment
    const enrollment = webinar.enrolledUsers.find(
      (e: any) => e.userId?.toString() === userId
    );

    if (!enrollment) {
      return res.status(403).json({
        success: false,
        message: "You are not enrolled in this webinar",
      });
    }

    // Check if certificate failed
    if (enrollment.cert?.status !== "failed") {
      return res.status(400).json({
        success: false,
        message: "Certificate is not in failed state",
        currentStatus: enrollment.cert?.status || "pending",
      });
    }

    // Reset certificate status to pending
    await WebinarModel.updateOne(
      { _id: webinarId, "enrolledUsers.userId": userId },
      {
        $set: {
          "enrolledUsers.$.cert.status": "pending",
          "enrolledUsers.$.cert.attempts": 0,
          "enrolledUsers.$.cert.lastError": null,
        },
      }
    );

    // Trigger generation
    const { generateCertificateForUser } = await import("../services/certificateGeneration.service");
    
    const result = await generateCertificateForUser(webinarId, userId, {
      startAsync: true,
      sendEmail: true,
    });

    res.status(200).json({
      success: true,
      message: "Certificate generation retry initiated",
      data: result,
    });
  } catch (error) {
    logError(`Error in retryCertificateGeneration: ${(error as Error).message}`);
    res.status(500).json({
      success: false,
      message: "Failed to retry certificate generation",
      error: (error as Error).message,
    });
  }
};

export default {
  saveCertificateTemplate,
  getCertificateTemplates,
  getCertificateTemplate,
  updateWebinarTemplate,
  generateCertificateForParticipant,
  generateCertificatesForWebinar,
  getUserCertificates,
  getCertificateForWebinar,
  downloadCertificate,
  getCertificateStatus,
  resendCertificateEmail,
  autoGenerateCertificates,
  downloadCertificatePDF,
  retryCertificateGeneration,
};
