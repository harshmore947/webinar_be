/**
 * Certificate Routes - Complete certificate system routes
 */

import express from "express";
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
} from "../controllers/certificate.controller.new";
import { authenticateJWT } from "../middleware/auth.middleware";

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

export default router;
