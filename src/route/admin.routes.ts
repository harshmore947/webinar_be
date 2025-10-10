import { Router } from "express";
import { validate } from "../middleware/validate.middleware";
import { authenticateJWT, requireAdmin } from "../middleware/auth.middleware";
import { createRateLimiter } from "../middleware/ratelimiter.middleware";
import { cacheMiddleware } from "../middleware/cache.middleware";
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

const router = Router();

// Rate limiter for admin operations
const adminLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Much more lenient for admin operations
  message: "Too many admin requests from this IP, please try again later.",
});

// All admin routes require authentication and admin role
router.use(authenticateJWT, requireAdmin, adminLimiter);

// Dashboard
router.get("/dashboard", getDashboardStats);

// User management
router.get("/users", getAllUsers);
router.get("/users/search", validate(SearchSchema), searchUsers);
router.get("/users/:id", getUserById);
router.post("/users", validate(AdminCreateUserSchema), createUser);
router.put("/users/:id", validate(AdminUpdateUserSchema), updateUser);
router.delete("/users/:id", deleteUser);
router.post("/users/bulk-delete", validate(BulkDeleteSchema), bulkDeleteUsers);

// Webinar management
router.get("/webinars", getAllWebinars);
router.get("/webinars/search", validate(SearchSchema), searchWebinars);
router.get("/webinars/:id", getWebinarById);
router.delete("/webinars/:id", adminDeleteWebinar);
router.post(
  "/webinars/bulk-delete",
  validate(BulkDeleteSchema),
  bulkDeleteWebinars
);

// Analytics routes
router.get(
  "/analytics/summary",
  cacheMiddleware({ ttl: 300 }), // 5 minutes cache for analytics summary
  getAdminAnalyticsSummary
);

router.get(
  "/analytics/webinar/:webinarId",
  cacheMiddleware({ ttl: 180 }), // 3 minutes cache for webinar analytics
  getAdminWebinarAnalytics
);

router.get("/webinars/:webinarId/chat/export", exportWebinarChat);

export default router;
