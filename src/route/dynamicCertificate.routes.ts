import express from "express";
import multer from "multer";
import {
  getAvailableFields,
  uploadTemplate,
  updateCertificateConfig,
  generateSingleCertificate,
  generateBulkCertificatesForWebinar,
  regenerateSingleCertificate,
  getCertificateConfig,
  getWebinarCertificates,
  uploadTemplateFromBase64,
} from "../controller/dynamicCertificate.controller";
import { authenticateJWT } from "../middleware/auth.middleware";

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only images
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

// Get available certificate fields
router.get("/fields", authenticateJWT, getAvailableFields);

// Upload certificate template
router.post(
  "/template/:webinarId",
  authenticateJWT,
  upload.single("template"),
  uploadTemplate
);

// Upload certificate template from base64
router.post(
  "/templates/upload-base64",
  authenticateJWT,
  uploadTemplateFromBase64
);

// Update certificate configuration
router.put("/config/:webinarId", authenticateJWT, updateCertificateConfig);

// Get certificate configuration
router.get("/config/:webinarId", authenticateJWT, getCertificateConfig);

// Generate single certificate
router.post("/generate/single", authenticateJWT, generateSingleCertificate);

// Generate bulk certificates for webinar
router.post(
  "/generate/bulk",
  authenticateJWT,
  generateBulkCertificatesForWebinar
);

// Regenerate certificate
router.post(
  "/regenerate/:certificateId",
  authenticateJWT,
  regenerateSingleCertificate
);

// Get all certificates for a webinar
router.get("/webinar/:webinarId", authenticateJWT, getWebinarCertificates);

export default router;
