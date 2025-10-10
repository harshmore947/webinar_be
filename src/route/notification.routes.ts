import { Router } from "express";
import { authenticateJWT } from "../middleware/auth.middleware";
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  deleteReadNotifications,
  getNotificationStats,
  bulkMarkNotificationsRead,
  bulkDeleteNotifications,
  createNotificationAPI,
} from "../controller/notification.controller";

const router = Router();

// All notification routes require authentication
router.use(authenticateJWT);

router.get("/", getNotifications);
router.post("/", createNotificationAPI);
router.get("/stats", getNotificationStats);
router.post("/:id/read", markNotificationRead);
router.post("/mark-all-read", markAllNotificationsRead);
router.post("/bulk-mark-read", bulkMarkNotificationsRead);
router.delete("/:id", deleteNotification);
router.delete("/read/clear", deleteReadNotifications);
router.post("/bulk-delete", bulkDeleteNotifications);

export default router;
