import { z } from "zod";

// Get notifications schema
export const GetNotificationsSchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    isRead: z.enum(["true", "false"]).optional(),
  }),
});

// Bulk mark notifications as read schema
export const BulkMarkReadSchema = z.object({
  body: z.object({
    notificationIds: z
      .array(z.string().min(1, "Notification ID is required"))
      .min(1, "At least one notification ID is required"),
  }),
});

// Bulk delete notifications schema
export const BulkDeleteNotificationsSchema = z.object({
  body: z.object({
    notificationIds: z
      .array(z.string().min(1, "Notification ID is required"))
      .min(1, "At least one notification ID is required"),
  }),
});

// Create notification schema (for internal use)
export const CreateNotificationSchema = z.object({
  body: z.object({
    userId: z.string().min(1, "User ID is required"),
    message: z.string().min(1, "Message is required"),
    link: z.string().optional(),
    type: z.enum(["info", "success", "warning", "error"]).optional(),
  }),
});
