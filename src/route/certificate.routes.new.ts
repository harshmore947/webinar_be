/**
 * Certificate Routes - Complete certificate system routes
 * 
 * ARCHITECTURE NOTE:
 * ==================
 * This file handles all certificate-related operations at /api/certificates/*
 * 
 * Related Routes:
 * - Webinar routes (/webinars/:id/certificate, /webinars/:id/request-certificate)
 *   are maintained for backwards compatibility and convenience
 * 
 * Certificate Flow:
 * 1. User enrolls in webinar → /webinars/:id/enroll
 * 2. Webinar ends → Auto-generates certificates (if enabled)
 * 3. User can request certificate → /webinars/:id/request-certificate
 * 4. User downloads certificate → /certificates/:id/download
 * 
 * Data Storage:
 * - Templates: CertificateTemplateModel (separate collection)
 * - Generated Certificates: Stored in Webinar.enrolledUsers[].cert (embedded)
 *   AND GeneratedCertificate collection (for tracking)
 */

import express, { Request, Response } from "express";
import {
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
} from "../controllers/certificate.controller.new";
import { authenticateJWT } from "../middleware/auth.middleware";

// AuthRequest interface to include user from JWT
interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

const router = express.Router();

// ==================== TEMPLATE MANAGEMENT ====================

/**
 * @route   POST /api/certificates/template
 * @desc    Save a new certificate template
 * @access  Private (Host, Admin)
 */
router.post("/template", authenticateJWT, saveCertificateTemplate);

/**
 * @route   GET /api/certificates/templates
 * @desc    Get all available certificate templates
 * @access  Private
 */
router.get("/templates", authenticateJWT, getCertificateTemplates);

/**
 * @route   GET /api/certificates/templates/:id
 * @desc    Get a specific template by ID
 * @access  Private
 */
router.get("/templates/:id", authenticateJWT, getCertificateTemplate);

/**
 * @route   PUT /api/certificates/webinar/:webinarId/template
 * @desc    Update webinar's certificate template configuration
 * @access  Private (Host, Admin)
 */
router.put("/webinar/:webinarId/template", authenticateJWT, updateWebinarTemplate);

// ==================== CERTIFICATE GENERATION ====================

/**
 * @route   POST /api/certificates/generate
 * @desc    Generate a certificate for the authenticated user
 * @access  Private
 */
router.post("/generate", authenticateJWT, generateCertificateForParticipant);

/**
 * @route   POST /api/certificates/generate/webinar/:webinarId
 * @desc    Generate certificates for all webinar attendees (bulk)
 * @access  Private (Host, Admin)
 */
router.post("/generate/webinar/:webinarId", authenticateJWT, generateCertificatesForWebinar);

/**
 * @route   POST /api/certificates/generate/bulk
 * @desc    Bulk generate certificates (alias for generate/webinar)
 * @access  Private (Host, Admin)
 */
router.post("/generate/bulk", authenticateJWT, generateCertificatesForWebinar);

/**
 * @route   POST /api/certificates/auto-generate/:webinarId
 * @desc    Auto-generate certificates after webinar ends
 * @access  Private (Host, Admin)
 */
router.post("/auto-generate/:webinarId", authenticateJWT, autoGenerateCertificates);

// ==================== CERTIFICATE RETRIEVAL ====================

/**
 * @route   GET /api/certificates/my-certificates
 * @desc    Get all certificates for the authenticated user
 * @access  Private
 */
router.get("/my-certificates", authenticateJWT, getUserCertificates);

/**
 * @route   GET /api/certificates/webinar/:webinarId/certificate
 * @desc    Get certificate for a specific webinar (for download button)
 * @access  Private
 */
router.get("/webinar/:webinarId/certificate", authenticateJWT, getCertificateForWebinar);

/**
 * @route   GET /api/certificates/:certificateId/download
 * @desc    Download a certificate (returns URL and tracks download)
 * @access  Private
 */
router.get("/:certificateId/download", authenticateJWT, downloadCertificate);

// ==================== JOB STATUS ====================

/**
 * @route   GET /api/certificates/job/:jobId/status
 * @desc    Get certificate generation job status
 * @access  Private
 */
router.get("/job/:jobId/status", authenticateJWT, getCertificateStatus);

// ==================== EMAIL ====================

/**
 * @route   POST /api/certificates/:certificateId/resend
 * @desc    Resend certificate via email
 * @access  Private
 */
router.post("/:certificateId/resend", authenticateJWT, resendCertificateEmail);

// ==================== ADDITIONAL ROUTES ====================

/**
 * @route   GET /api/certificates/verify/:certificateNumber
 * @desc    Verify a certificate by certificate number (public)
 * @access  Public
 */
router.get("/verify/:certificateNumber", async (req, res) => {
  res.status(200).json({
    success: true,
    certificate: {
      certificateNumber: req.params.certificateNumber,
      isValid: true,
      message: "Certificate verification endpoint - implementation pending"
    }
  });
});

/**
 * @route   GET /api/certificates/config/:webinarId
 * @desc    Get certificate configuration for a webinar
 * @access  Private
 */
router.get("/config/:webinarId", authenticateJWT, async (req, res) => {
  try {
    const WebinarModel = (await import("../models/Webinar.model")).default;
    const webinar = await WebinarModel.findById(req.params.webinarId).select('certificateConfig certificateTemplate hasCertification');
    
    if (!webinar) {
      return res.status(404).json({ success: false, message: "Webinar not found" });
    }

    res.status(200).json({
      success: true,
      config: {
        enabled: webinar.hasCertification || false,
        templateUrl: webinar.certificateTemplate?.cloudinaryUrl || "",
        certificateConfig: webinar.certificateConfig || null
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch certificate config" });
  }
});

/**
 * @route   PUT /api/certificates/config/:webinarId
 * @desc    Update certificate configuration for a webinar
 * @access  Private (Host, Admin)
 */
router.put("/config/:webinarId", authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    const WebinarModel = (await import("../models/Webinar.model")).default;
    const webinar = await WebinarModel.findById(req.params.webinarId);
    
    if (!webinar) {
      return res.status(404).json({ success: false, message: "Webinar not found" });
    }

    // Check permissions
    if (webinar.hostId.toString() !== req.user?.id && req.user?.role !== "Admin") {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    const { enabled, certificateConfig } = req.body;
    if (enabled !== undefined) webinar.hasCertification = enabled;
    if (certificateConfig) webinar.certificateConfig = certificateConfig;

    await webinar.save();

    res.status(200).json({
      success: true,
      message: "Certificate configuration updated successfully",
      webinar
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update certificate config" });
  }
});

/**
 * @route   POST /api/certificates/templates/upload-base64
 * @desc    Upload a certificate template from base64 data
 * @access  Private (Host, Admin)
 */
router.post("/templates/upload-base64", authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    const { base64Data, fileName } = req.body;
    
    if (!base64Data) {
      return res.status(400).json({ success: false, message: "Base64 data is required" });
    }

    // Use cloudinary service to upload
    const { uploadCertificateTemplate } = await import("../utils/cloudinaryService");
    
    // Convert base64 to buffer
    const base64String = base64Data.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64String, "base64");
    
    const uploadResult = await uploadCertificateTemplate(
      buffer,
      req.user?.id || "anonymous",
      fileName || `certificate_template_${Date.now()}`
    );

    if (uploadResult.success && uploadResult.url) {
      res.status(200).json({
        success: true,
        url: uploadResult.url,
        publicId: uploadResult.publicId,
        message: "Template uploaded successfully"
      });
    } else {
      res.status(500).json({
        success: false,
        message: uploadResult.error || "Failed to upload template"
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to upload certificate template",
      error: (error as Error).message
    });
  }
});

/**
 * @route   GET /api/certificates/statistics
 * @desc    Get certificate generation statistics (for admin dashboard)
 * @access  Private (Admin)
 */
router.get("/statistics", authenticateJWT, async (req, res) => {
  try {
    const GeneratedCertificate = (await import("../models/Certificate.model")).GeneratedCertificate;
    
    const totalCertificates = await GeneratedCertificate.countDocuments();
    const completedCertificates = await GeneratedCertificate.countDocuments({ status: "completed" });
    const failedCertificates = await GeneratedCertificate.countDocuments({ status: "failed" });
    const processingCertificates = await GeneratedCertificate.countDocuments({ status: "processing" });

    res.status(200).json({
      success: true,
      statistics: {
        total: totalCertificates,
        completed: completedCertificates,
        failed: failedCertificates,
        processing: processingCertificates,
        successRate: totalCertificates > 0 ? (completedCertificates / totalCertificates) * 100 : 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch statistics" });
  }
});

/**
 * @route   GET /api/certificates/fields
 * @desc    Get available certificate fields for template customization
 * @access  Private
 */
router.get("/fields", authenticateJWT, async (req, res) => {
  res.status(200).json({
    success: true,
    fields: [
      { key: "user.name", label: "Attendee Name", type: "text" },
      { key: "user.email", label: "Attendee Email", type: "text" },
      { key: "webinar.title", label: "Webinar Title", type: "text" },
      { key: "webinar.date", label: "Webinar Date", type: "date" },
      { key: "custom.certId", label: "Certificate Number", type: "text" },
      { key: "custom.completionDate", label: "Completion Date", type: "date" },
      { key: "custom.hostName", label: "Host Name", type: "text" }
    ]
  });
});

// ==================== FALLBACK FEATURES ====================

/**
 * @route   POST /api/certificates/download-pdf/:webinarId
 * @desc    Direct PDF download with fallback generation (for attendees)
 * @access  Private (Enrolled users)
 * @note    This is the PRIMARY fallback endpoint if auto-generation fails
 */
router.post("/download-pdf/:webinarId", authenticateJWT, downloadCertificatePDF);

/**
 * @route   POST /api/certificates/retry/:webinarId
 * @desc    Retry failed certificate generation
 * @access  Private (Enrolled users)
 */
router.post("/retry/:webinarId", authenticateJWT, retryCertificateGeneration);

export default router;
