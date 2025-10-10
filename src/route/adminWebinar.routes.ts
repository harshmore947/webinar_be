import { Router } from "express";
import {
  getWebinarForEdit,
  updateWebinarAdmin,
  getWebinarEditHistory,
  deleteWebinarAdmin,
} from "../controller/adminWebinar.controller";
import { authenticateJWT, requireAdmin } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { UpdateWebinarSchema } from "../validators/webinar.schema";
import { cacheMiddleware } from "../middleware/cache.middleware";

const router = Router();

// Admin webinar editing routes
router.get(
  "/admin/webinars/:id/edit",
  authenticateJWT,
  requireAdmin,
  cacheMiddleware({ ttl: 60 }), // 1 minute cache for edit data
  getWebinarForEdit
);

router.put(
  "/admin/webinars/:id",
  authenticateJWT,
  requireAdmin,
  validate(UpdateWebinarSchema),
  updateWebinarAdmin
);

router.get(
  "/admin/webinars/:id/history",
  authenticateJWT,
  requireAdmin,
  getWebinarEditHistory
);

router.delete(
  "/admin/webinars/:id",
  authenticateJWT,
  requireAdmin,
  deleteWebinarAdmin
);

export default router;
