import { Router, Request, Response } from "express";
import { validate } from "../middleware/validate.middleware";
import {
  ForgotPasswordSchema,
  LoginSchema,
  RegisterSchema,
  ResetPasswordSchema,
  SearchUsersSchema,
  VerifyResetCodeSchema,
} from "../validators/auth.schema";
import {
  forgotPassword,
  getProfile,
  loginUser,
  logoutUser,
  registerUser,
  resetPassword,
  searchUsersAll,
  verifyResetCode,
} from "../controller/auth.controller";
import {
  authenticateJWT,
  requireAdmin,
  requireHostOrAdmin,
} from "../middleware/auth.middleware";
import { cacheMiddleware } from "../middleware/cache.middleware";
import {
  uploadMultipleResourceFiles,
  uploadCertificateTemplate as uploadCertificateTemplateMiddleware,
  uploadWebinarThumbnail as uploadWebinarThumbnailMiddleware,
} from "../middleware/upload.middleware";
import {
  trackAnalyticsEvent,
  getWebinarAnalytics,
  getRealTimeAnalytics,
  getAllWebinarsAnalytics,
  getAnalyticsOverview,
} from "../controller/analytics.controller";
import {
  TrackAnalyticsEventSchema,
  GetAnalyticsSchema,
  GetAllAnalyticsSchema,
} from "../validators/analytics.schema";
import testRoutes from "./test.routes";
import {
  createOrUpdateReview,
  getWebinarReviews,
} from "../controller/review.controller";
import {
  GetReviewsSchema,
  UpsertReviewSchema,
} from "../validators/review.schema";
import {
  uploadWebinarResources,
  deleteWebinarResource,
  getWebinarResources,
  uploadCertificateTemplate as uploadCertificateTemplateController,
  uploadWebinarThumbnail as uploadWebinarThumbnailController,
} from "../controller/resourceUpload.controller";
import { createRateLimiter } from "../middleware/ratelimiter.middleware";
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
  endWebinar,
  enableCertification,
  updateCertificateConfig,
  uploadCertificateTemplate as uploadCertificateTemplateToWebinar,
  trackAttendance,
  generateCertificates,
  requestUserCertificate,
  getUserCertificate,
  addAttendeeToWebinar,
  removeAttendeeFromWebinar,
  updateAttendeeInWebinar,
  getWebinarAttendees,
  createPaymentSession,
  verifyPayment,
  getPaymentStatus,
} from "../controller/webinar.controller";

import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  deleteReadNotifications,
  getNotificationStats,
  bulkMarkNotificationsRead,
  bulkDeleteNotifications,
  createNotification,
} from "../controller/notification.controller";

import {
  sendMessage,
  getChatMessages,
  deleteMessage,
  moderateMessage,
} from "../controller/chat.controller";

import {
  sendMessageSchema,
  getChatMessagesSchema,
  deleteMessageSchema,
  moderateMessageSchema,
} from "../validators/chat.schema";
import {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getAllWebinars,
  getWebinarById,
  deleteWebinar as adminDeleteWebinar,
  getDashboardStats,
  searchUsers,
  searchWebinars,
  bulkDeleteUsers,
  bulkDeleteWebinars,
  createWebinarAsAdmin,
  updateWebinarAsAdmin,
  promoteToHost,
  demoteFromHost,
  reassignWebinars,
  assignPresenter,
  removePresenter,
  assignModerator,
  removeModerator,
  setWebinarVisibility,
} from "../controller/admin.controller";

import {
  exportWebinarChat,
  getAdminWebinarAnalytics,
  getAdminAnalyticsSummary,
} from "../controller/adminAnalytics.controller";
import {
  AdminCreateUserSchema,
  AdminUpdateUserSchema,
  BulkDeleteSchema,
  SearchSchema,
} from "../validators/admin.schema";
import {
  createReminder,
  getUserReminders,
  getWebinarReminder,
  deleteReminder,
} from "../controller/reminder.controller";
import { CreateReminderSchema } from "../validators/reminder.schema";
// import { getQueueDashboard, testQueue } from "../controller/queue.controller";

const router = Router();

// Rate limiters
const webinarLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  message: "Too many webinar requests from this IP, please try again later.",
});

const adminLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Much more lenient for admin operations
  message: "Too many admin requests from this IP, please try again later.",
});

// ================================
// AUTHENTICATION ROUTES
// ================================
router.post("/register", validate(RegisterSchema), registerUser);
router.post("/login", validate(LoginSchema), loginUser);
router.post("/logout", authenticateJWT, logoutUser);
router.get("/profile", authenticateJWT, getProfile);
router.get("/users/search", authenticateJWT, searchUsersAll);

// Password reset routes
router.post("/forgot-password", validate(ForgotPasswordSchema), forgotPassword);
router.post(
  "/verify-reset-code",
  validate(VerifyResetCodeSchema),
  verifyResetCode
);
router.post("/reset-password", validate(ResetPasswordSchema), resetPassword);

router.post("/reset-password", validate(ResetPasswordSchema), resetPassword);

// ================================
// WEBINAR ROUTES (NO CACHING - instant updates)
// ================================

// Public webinar routes
router.get("/webinars/:id", getWebinar); // No cache - always fresh data

// Protected webinar routes
router.post(
  "/webinars",
  authenticateJWT,
  validate(CreateWebinarSchema),
  createWebinar
);

router.put(
  "/webinars/:id",
  authenticateJWT,
  validate(UpdateWebinarSchema),
  updateWebinar
);

router.delete("/webinars/:id", authenticateJWT, deleteWebinar);

// Webinar management routes
router.get(
  "/webinars",
  authenticateJWT,
  listWebinars // No cache - always fresh
);

// Reviews
router.post(
  "/webinars/:webinarId/reviews",
  authenticateJWT,
  validate(UpsertReviewSchema),
  createOrUpdateReview
);
router.get(
  "/webinars/:webinarId/reviews",
  validate(GetReviewsSchema),
  getWebinarReviews
);

// Enrollment routes
router.post("/webinars/:id/enroll", authenticateJWT, enrollInWebinar);

router.get(
  "/webinars/:id/enrolled-users",
  authenticateJWT,
  getEnrolledUsers // No cache - always fresh
);

router.get(
  "/my-webinars",
  authenticateJWT,
  getEnrolledWebinars // No cache - always fresh
);

router.get(
  "/my-created-webinars",
  authenticateJWT,
  webinarLimiter,
  getCreatedWebinars // No cache - always fresh
);
// Add a co-host to a webinar (main host only)
router.post("/webinars/:id/add-host", authenticateJWT, addHostToWebinar);

// Add a moderator to a webinar (main host only)
router.post(
  "/webinars/:id/add-moderator",
  authenticateJWT,
  addModeratorToWebinar
);

// End a webinar (Admin, Host, or Presenter only)
router.post("/webinars/:id/end", authenticateJWT, endWebinar);

// ================================
// CERTIFICATION ROUTES
// ================================
// Enable certification for a webinar (Admin, Host, or Presenter only)
router.post(
  "/webinars/:id/enable-certification",
  authenticateJWT,
  enableCertification
);

// Update certificate config (fields, coordinates, dimensions)
router.post(
  "/webinars/:id/update-certificate-config",
  authenticateJWT,
  updateCertificateConfig
);

// Upload certificate template (Admin, Host, or Presenter only)
router.post(
  "/webinars/:id/certificate-template",
  authenticateJWT,
  uploadCertificateTemplateToWebinar
);

// Upload certificate template to Cloudinary
router.post(
  "/upload-certificate-template",
  authenticateJWT,
  uploadCertificateTemplateMiddleware,
  uploadCertificateTemplateController
);

// Upload webinar thumbnail to Cloudinary
router.post(
  "/upload-webinar-thumbnail",
  authenticateJWT,
  uploadWebinarThumbnailMiddleware,
  uploadWebinarThumbnailController
);

// Track user attendance (join/leave)
router.post("/webinars/:id/track-attendance", authenticateJWT, trackAttendance);

// Generate and send certificates (Admin, Host, or Presenter only)
router.post(
  "/webinars/:id/generate-certificates",
  authenticateJWT,
  generateCertificates
);

// Request certificate for current user
router.post(
  "/webinars/:id/request-certificate",
  authenticateJWT,
  requestUserCertificate
);

// Get certificate for current user
router.get("/webinars/:id/certificate", authenticateJWT, getUserCertificate);

// Attendee management routes (Host, Presenter, or Admin only)
router.get("/webinars/:id/attendees", authenticateJWT, getWebinarAttendees);
router.post("/webinars/:id/attendees", authenticateJWT, addAttendeeToWebinar);
router.put(
  "/webinars/:id/attendees/:attendeeId",
  authenticateJWT,
  updateAttendeeInWebinar
);
router.delete(
  "/webinars/:id/attendees/:attendeeId",
  authenticateJWT,
  removeAttendeeFromWebinar
);

// Payment routes for paid webinars
router.post(
  "/webinars/:id/payment/create",
  authenticateJWT,
  createPaymentSession
);
router.post("/webinars/payment/verify", verifyPayment);
router.get("/webinars/:id/payment/status", authenticateJWT, getPaymentStatus);

// ================================
// NOTIFICATION ROUTES (NO CACHING - instant updates)
// ================================
router.get(
  "/notifications",
  authenticateJWT,
  getNotifications // No cache - always fresh
);

router.get(
  "/notifications/stats",
  authenticateJWT,
  getNotificationStats // No cache - always fresh
);

router.post("/notifications/:id/read", authenticateJWT, markNotificationRead);

router.post(
  "/notifications/mark-all-read",
  authenticateJWT,
  markAllNotificationsRead
);

router.post(
  "/notifications/bulk-mark-read",
  authenticateJWT,
  bulkMarkNotificationsRead
);

router.delete("/notifications/:id", authenticateJWT, deleteNotification);

router.delete(
  "/notifications/read/clear",
  authenticateJWT,
  deleteReadNotifications
);

router.post(
  "/notifications/bulk-delete",
  authenticateJWT,
  bulkDeleteNotifications
);

// Test notification route (development only)
if (process.env.NODE_ENV === "development") {
  router.post(
    "/notifications/test",
    authenticateJWT,
    async (req: Request, res: Response) => {
      try {
        const userId = req.user?.id;
        if (!userId) {
          return res
            .status(401)
            .json({ success: false, msg: "Authentication required" });
        }

        const { message, type, link } = req.body;

        const notification = await createNotification(
          userId,
          message || "Test notification message",
          link || "/dashboard",
          type || "info"
        );

        res.json({
          success: true,
          msg: "Test notification created successfully",
          notification,
        });
      } catch (error) {
        console.error("Error creating test notification:", error);
        res
          .status(500)
          .json({ success: false, msg: "Failed to create test notification" });
      }
    }
  );
}

// ================================
// REMINDER ROUTES
// ================================
router.post(
  "/reminders",
  authenticateJWT,
  validate(CreateReminderSchema),
  createReminder
);

router.get(
  "/reminders",
  authenticateJWT,
  getUserReminders // No cache - always fresh
);

router.get(
  "/reminders/webinar/:webinarId",
  authenticateJWT,
  getWebinarReminder // No cache - always fresh
);

router.delete("/reminders/webinar/:webinarId", authenticateJWT, deleteReminder);

// ================================
// ANALYTICS ROUTES (NO CACHING - instant updates)
// ================================

// Track analytics events (public for webinar viewers)
router.post(
  "/analytics/track",
  validate(TrackAnalyticsEventSchema),
  trackAnalyticsEvent
);

// Get webinar analytics (host or admin only)
router.get(
  "/analytics/webinar/:webinarId",
  authenticateJWT,
  requireHostOrAdmin,
  validate(GetAnalyticsSchema),
  getWebinarAnalytics // No cache - always fresh
);

// Get real-time analytics (host or admin only)
router.get(
  "/analytics/webinar/:webinarId/realtime",
  authenticateJWT,
  requireHostOrAdmin,
  getRealTimeAnalytics
);

// Get all webinars analytics (admin only)
router.get(
  "/analytics/webinars",
  authenticateJWT,
  requireAdmin,
  validate(GetAllAnalyticsSchema),
  getAllWebinarsAnalytics // No cache - always fresh
);

// Get analytics overview (for dashboard)
router.get(
  "/analytics/overview",
  authenticateJWT,
  getAnalyticsOverview // No cache - always fresh
);

// ================================
// ADMIN ROUTES (NO CACHING - instant updates)
// ================================

// Admin Dashboard
router.get(
  "/admin/dashboard",
  authenticateJWT,
  requireHostOrAdmin,
  adminLimiter,
  getDashboardStats // No cache - always fresh
);

// Admin Analytics Routes
router.get(
  "/admin/analytics/summary",
  authenticateJWT,
  requireAdmin,
  getAdminAnalyticsSummary // No cache - always fresh
);

router.get(
  "/admin/analytics/webinar/:webinarId",
  authenticateJWT,
  requireAdmin,
  getAdminWebinarAnalytics // No cache - always fresh
);

router.get(
  "/admin/webinars/:webinarId/chat/export",
  authenticateJWT,
  requireAdmin,
  exportWebinarChat
);

// Admin User Management (NO CACHING - instant updates)
router.get(
  "/admin/users",
  authenticateJWT,
  requireAdmin,
  getAllUsers // No cache - always fresh
);

router.get(
  "/admin/users/search",
  authenticateJWT,
  requireAdmin,
  searchUsers // No cache - always fresh
);

router.get(
  "/admin/users/:id",
  authenticateJWT,
  requireAdmin,
  getUserById // No cache - always fresh
);

router.post(
  "/admin/users",
  authenticateJWT,
  requireAdmin,
  validate(AdminCreateUserSchema),
  createUser
);

router.put(
  "/admin/users/:id",
  authenticateJWT,
  requireAdmin,
  validate(AdminUpdateUserSchema),
  updateUser
);

router.delete("/admin/users/:id", authenticateJWT, requireAdmin, deleteUser);

router.post(
  "/admin/users/bulk-delete",
  authenticateJWT,
  requireAdmin,
  validate(BulkDeleteSchema),
  bulkDeleteUsers
);

// Admin Webinar Management (NO CACHING - instant updates)
router.get(
  "/admin/webinars",
  authenticateJWT,
  requireAdmin,
  getAllWebinars // No cache - always fresh
);

router.get(
  "/admin/my-created-webinars",
  authenticateJWT,
  webinarLimiter,
  adminLimiter,
  getCreatedWebinars // No cache - always fresh
);
router.get(
  "/admin/webinars/search",
  authenticateJWT,
  requireAdmin,
  searchWebinars // No cache - always fresh
);

router.get(
  "/admin/webinars/:id",
  authenticateJWT,
  requireAdmin,
  getWebinarById // No cache - always fresh
);

router.delete(
  "/admin/webinars/:id",
  authenticateJWT,
  requireAdmin,
  adminDeleteWebinar
);

router.post(
  "/admin/webinars/bulk-delete",
  authenticateJWT,
  requireAdmin,
  validate(BulkDeleteSchema),
  bulkDeleteWebinars
);

// New admin webinar management routes
router.post(
  "/admin/webinars/create",
  authenticateJWT,
  requireAdmin,
  createWebinarAsAdmin
);

router.put(
  "/admin/webinars/:id/update",
  authenticateJWT,
  requireAdmin,
  updateWebinarAsAdmin
);

// Role management routes
router.post(
  "/admin/users/:userId/promote-to-host",
  authenticateJWT,
  requireAdmin,
  promoteToHost
);

router.post(
  "/admin/users/:userId/demote-from-host",
  authenticateJWT,
  requireAdmin,
  demoteFromHost
);

router.post(
  "/admin/webinars/reassign",
  authenticateJWT,
  requireAdmin,
  reassignWebinars
);

// Webinar presenters and moderators management
router.post(
  "/admin/webinars/assign-presenter",
  authenticateJWT,
  requireAdmin,
  assignPresenter
);

router.post(
  "/admin/webinars/remove-presenter",
  authenticateJWT,
  requireAdmin,
  removePresenter
);

router.post(
  "/admin/webinars/assign-moderator",
  authenticateJWT,
  requireAdmin,
  assignModerator
);

router.post(
  "/admin/webinars/remove-moderator",
  authenticateJWT,
  requireAdmin,
  removeModerator
);

router.post(
  "/admin/webinars/set-visibility",
  authenticateJWT,
  requireAdmin,
  setWebinarVisibility
);

// Chat routes
router.post(
  "/chat/messages",
  authenticateJWT,
  validate(sendMessageSchema),
  sendMessage
);

router.get(
  "/chat/:webinarId/messages",
  authenticateJWT,
  validate(getChatMessagesSchema),
  getChatMessages
);

router.delete(
  "/chat/messages/:messageId",
  authenticateJWT,
  validate(deleteMessageSchema),
  deleteMessage
);

router.patch(
  "/chat/messages/:messageId/moderate",
  authenticateJWT,
  validate(moderateMessageSchema),
  moderateMessage
);

// ================================
// CACHE MANAGEMENT ROUTES
// ================================
import {
  getCacheStatistics,
  clearAllCache,
  clearCacheByPattern,
} from "../controller/cache.controller";
import { inviteWebinarParticipant } from "../controller/mail.send";

// Cache management routes (admin only)
router.get(
  "/admin/cache/stats",
  authenticateJWT,
  requireAdmin,
  getCacheStatistics
);

router.post("/admin/cache/clear", authenticateJWT, requireAdmin, clearAllCache);

router.post(
  "/admin/cache/clear-pattern",
  authenticateJWT,
  requireAdmin,
  clearCacheByPattern
);

// ================================
// Email invite send api
// ================================

router.post(
  "/send-invite",
  authenticateJWT,
  requireHostOrAdmin,
  adminLimiter,
  inviteWebinarParticipant
);

// ================================
// Resource Upload APIs
// ================================

// Upload resources for a webinar
router.post(
  "/webinars/:webinarId/resources",
  authenticateJWT,
  uploadMultipleResourceFiles,
  uploadWebinarResources
);

// Get resources for a webinar
router.get("/webinars/:webinarId/resources", getWebinarResources);

// Delete a resource from a webinar
router.delete(
  "/webinars/:webinarId/resources/:resourceId",
  authenticateJWT,
  deleteWebinarResource
);

// ================================
// CERTIFICATE MANAGEMENT ROUTES
// ================================
import certificateRoutes from "./certificate.routes";
router.use("/certificates", certificateRoutes);

// Test routes for email functionality
router.use("/test", testRoutes);

export default router;
