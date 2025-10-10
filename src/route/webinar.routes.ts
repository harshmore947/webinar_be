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
  "/:webinarId/resources",
  authenticateJWT,
  uploadMultipleResourceFiles,
  uploadWebinarResources
);

// Get resources for a webinar
router.get("/:webinarId/resources", getWebinarResources);

// Delete a resource from a webinar
router.delete(
  "/:webinarId/resources/:resourceId",
  authenticateJWT,
  deleteWebinarResource
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

// Certification routes
router.post("/:id/enable-certification", authenticateJWT, enableCertification);

router.post(
  "/:id/update-certificate-config",
  authenticateJWT,
  updateCertificateConfig
);

router.get(
  "/:id/attendees",
  authenticateJWT,
  requireHostOrAdmin,
  getWebinarAttendees
);

router.post(
  "/:id/add-attendee",
  authenticateJWT,
  requireHostOrAdmin,
  addAttendeeToWebinar
);

router.post(
  "/:id/generate-certificates",
  authenticateJWT,
  generateCertificates
);

router.post(
  "/:id/request-certificate",
  authenticateJWT,
  requestUserCertificate
);

router.get(
  "/:id/certificates/:certificateNumber",
  authenticateJWT,
  getUserCertificate
);

export default router;
