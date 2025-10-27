import { Router } from "express";
import express from "express";
import { validate } from "../middleware/validate.middleware";
import {
  authenticateJWT,
  requireHostOrAdmin,
} from "../middleware/auth.middleware";
import { cacheMiddleware } from "../middleware/cache.middleware";
import { createRateLimiter } from "../middleware/ratelimiter.middleware";
import { 
  uploadWebinarThumbnail,
  uploadMultipleResourceFiles,
} from "../middleware/upload.middleware";

import {
  CreateWebinarSchema,
  UpdateWebinarSchema,
} from "../validators/webinar.schema";
import {
  createWebinar,
  deleteWebinar,
  enrollInWebinar,
  getEnrolledUsers,
  getEnrolledWebinars,
  getWebinar,
  listWebinars,
  updateWebinar,
  addHostToWebinar,
  addModeratorToWebinar,
  getCreatedWebinars,
  checkIsPaid,
  endWebinar,
  enableCertification,
  updateCertificateConfig,
  getWebinarAttendees,
  addAttendeeToWebinar,
  generateCertificates,
  requestUserCertificate,
  getUserCertificate,
} from "../controller/webinar.controller";
import {
  uploadThumbnail,
  deleteThumbnail,
} from "../controller/thumbnailUpload.controller";
import {
  uploadWebinarResources,
  deleteWebinarResource,
  getWebinarResources,
} from "../controller/resourceUpload.controller";
import {
  uploadWebinarResourcesV2,
  getWebinarResourcesV2,
  updateWebinarResourceV2,
  deleteWebinarResourceV2,
  bulkResourceOperationsV2,
  trackResourceDownloadV2,
  getResourceStatsV2,
} from "../controller/resourceUploadV2.controller";
import {
  createPaymentSession,
  getPaymentStatus,
  verifyPaymentAndEnroll,
  debugWebhookConfig,
  handlePaymentSuccess,
  getPaymentHistory,
  retryFailedEnrollment,
} from "../controller/stripe.controller";
import {
  createOrUpdateReview,
  getWebinarReviews,
} from "../controller/review.controller";
import {
  GetReviewsSchema,
  UpsertReviewSchema,
} from "../validators/review.schema";
import { getWebinarAnalytics } from "../controller/analytics.controller";
import { GetAnalyticsSchema } from "../validators/analytics.schema";

const router = Router();

// Rate limiter for webinar operations
const webinarLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: "Too many webinar requests from this IP, please try again later.",
});

// Public routes
router.get("/:id", cacheMiddleware({ ttl: 120 }), getWebinar);

// Stripe webhook route (must be before authenticateJWT middleware)
router.post(
  "/payment/webhook",
  express.raw({ type: "application/json" }),
  handlePaymentSuccess
);

// Protected routes
router.use(authenticateJWT);
router.get("/", cacheMiddleware({ ttl: 120 }), listWebinars);
router.post("/", webinarLimiter, validate(CreateWebinarSchema), createWebinar);

// Thumbnail upload route (must be authenticated)
router.post("/upload-thumbnail", uploadWebinarThumbnail, uploadThumbnail);
router.post("/delete-thumbnail", deleteThumbnail);

router.put("/:id", validate(UpdateWebinarSchema), updateWebinar);
router.delete("/:id", deleteWebinar);
router.get("/:id/check-ispaid", checkIsPaid);
router.post("/:id/enroll", enrollInWebinar);
router.get("/:id/enrolled-users", requireHostOrAdmin, getEnrolledUsers);
router.get("/user/enrolled", getEnrolledWebinars);
router.get("/user/created", getCreatedWebinars);
router.post("/:id/add-host", addHostToWebinar);
router.post("/:id/add-moderator", addModeratorToWebinar);

// End webinar route
router.post("/:id/end", endWebinar);

// ================================
// Resource Upload Routes
// ================================

// Upload resources for a webinar
router.post(
  "/:id/resources",
  authenticateJWT,
  uploadMultipleResourceFiles,
  uploadWebinarResources
);

// Get resources for a webinar
router.get("/:id/resources", getWebinarResources);

// Delete a resource from a webinar
router.delete(
  "/:id/resources/:resourceId",
  authenticateJWT,
  deleteWebinarResource
);

// ================================
// Resource Upload Routes V2 (Enhanced)
// ================================

// Upload resources with metadata (V2)
router.post(
  "/:id/resources/v2",
  authenticateJWT,
  uploadMultipleResourceFiles,
  uploadWebinarResourcesV2
);

// Get resources with filters and stats (V2)
router.get("/:id/resources/v2", getWebinarResourcesV2);

// Get resource statistics (V2)
router.get("/:id/resources/v2/stats", getResourceStatsV2);

// Update resource metadata (V2)
router.patch(
  "/:id/resources/v2/:resourceId",
  authenticateJWT,
  updateWebinarResourceV2
);

// Delete a resource (V2)
router.delete(
  "/:id/resources/v2/:resourceId",
  authenticateJWT,
  deleteWebinarResourceV2
);

// Bulk operations (V2)
router.post(
  "/:id/resources/v2/bulk",
  authenticateJWT,
  bulkResourceOperationsV2
);

// Track download (V2)
router.post(
  "/:id/resources/v2/:resourceId/download",
  trackResourceDownloadV2
);

// ================================
// Payment Routes
// ================================

// Payment routes
router.post(
  "/:webinarId/payment/create-session",
  authenticateJWT,
  createPaymentSession
);
router.get("/:webinarId/payment/status", authenticateJWT, getPaymentStatus);
router.post(
  "/:webinarId/payment/verify-enrollment",
  authenticateJWT,
  verifyPaymentAndEnroll
);
router.get("/:webinarId/payment/history", authenticateJWT, getPaymentHistory);
router.post("/payment/:paymentId/retry-enrollment", authenticateJWT, retryFailedEnrollment);
router.get("/debug/webhook-config", debugWebhookConfig);

// Review routes
router.post(
  "/:webinarId/reviews",
  authenticateJWT,
  validate(UpsertReviewSchema),
  createOrUpdateReview
);
router.get(
  "/:webinarId/reviews",
  validate(GetReviewsSchema),
  getWebinarReviews
);

// Analytics route
router.get(
  "/:webinarId/analytics",
  authenticateJWT,
  validate(GetAnalyticsSchema),
  getWebinarAnalytics
);

// ================================
// Certification Routes
// ================================
// NOTE: Main certificate operations are in /api/certificates/*
// These routes are convenience endpoints for webinar-specific certificate operations

/**
 * @route   POST /api/webinars/:id/enable-certification
 * @desc    Enable certification for a webinar
 * @access  Private (Host, Admin)
 */
router.post("/:id/enable-certification", authenticateJWT, enableCertification);

/**
 * @route   POST /api/webinars/:id/update-certificate-config
 * @desc    Update certificate configuration (template, fields, etc.)
 * @access  Private (Host, Admin)
 */
router.post(
  "/:id/update-certificate-config",
  authenticateJWT,
  updateCertificateConfig
);

/**
 * @route   GET /api/webinars/:id/attendees
 * @desc    Get all attendees of a webinar (for certificate generation)
 * @access  Private (Host, Admin)
 */
router.get(
  "/:id/attendees",
  authenticateJWT,
  requireHostOrAdmin,
  getWebinarAttendees
);

/**
 * @route   POST /api/webinars/:id/add-attendee
 * @desc    Manually add an attendee to webinar
 * @access  Private (Host, Admin)
 */
router.post(
  "/:id/add-attendee",
  authenticateJWT,
  requireHostOrAdmin,
  addAttendeeToWebinar
);

/**
 * @route   POST /api/webinars/:id/generate-certificates
 * @desc    Generate certificates for all eligible attendees (host-initiated)
 * @access  Private (Host, Admin)
 */
router.post(
  "/:id/generate-certificates",
  authenticateJWT,
  generateCertificates
);

/**
 * @route   POST /api/webinars/:id/request-certificate
 * @desc    Request certificate generation for authenticated user
 * @access  Private (User must be enrolled/attended)
 * @note    This is the PRIMARY endpoint for users to request their certificate
 */
router.post(
  "/:id/request-certificate",
  authenticateJWT,
  requestUserCertificate
);

/**
 * @route   GET /api/webinars/:id/certificate
 * @desc    Get user's certificate for this specific webinar
 * @access  Private
 * @note    Alias endpoint - also available at /api/certificates/webinar/:id/certificate
 */
router.get(
  "/:id/certificate",
  authenticateJWT,
  getUserCertificate
);

export default router;
