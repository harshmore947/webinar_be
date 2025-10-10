import express from "express";
import {
  createCertificateTemplate,
  getCertificateTemplates,
  getCertificateTemplate,
  generateCertificateForParticipant,
  generateCertificatesForWebinar,
  getUserCertificates,
  getCertificateStatus,
  downloadCertificate,
} from "../controller/certificate.controller";
import { authenticateJWT } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import {
  createTemplateSchema,
  updateTemplateSchema,
  generateCertificateSchema,
  getTemplatesSchema,
  getTemplateByIdSchema,
  deleteTemplateSchema,
  getUserCertificatesSchema,
  getCertificateByIdSchema,
  getGenerationStatusSchema,
  generateWebinarCertificatesSchema,
} from "../validators/certificate.schema";

const router = express.Router();

// Certificate Template Routes
router.post(
  "/templates",
  authenticateJWT,
  validate(createTemplateSchema),
  createCertificateTemplate
);

router.get(
  "/templates",
  authenticateJWT,
  validate(getTemplatesSchema),
  getCertificateTemplates
);

router.get(
  "/templates/:templateId",
  authenticateJWT,
  validate(getTemplateByIdSchema),
  getCertificateTemplate
);

// Certificate Generation Routes
router.post(
  "/generate",
  authenticateJWT,
  validate(generateCertificateSchema),
  generateCertificateForParticipant
);

router.post(
  "/generate/webinar",
  authenticateJWT,
  validate(generateWebinarCertificatesSchema),
  generateCertificatesForWebinar
);

router.get(
  "/status/:jobId",
  authenticateJWT,
  validate(getGenerationStatusSchema),
  getCertificateStatus
);

// User Certificate Routes
router.get(
  "/user",
  authenticateJWT,
  validate(getUserCertificatesSchema),
  getUserCertificates
);

router.get(
  "/:certificateId",
  authenticateJWT,
  validate(getCertificateByIdSchema),
  getCertificateStatus // This handles getting certificate by ID
);

router.get(
  "/:certificateId/download",
  authenticateJWT,
  validate(getCertificateByIdSchema),
  downloadCertificate
);

export default router;
