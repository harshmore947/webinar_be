import { z } from "zod";

export const CreateReminderSchema = z.object({
  webinarId: z.string().min(1, "Webinar ID is required"),
  reminderTime: z.string().datetime("Invalid reminder time format"),
  message: z
    .string()
    .min(1, "Message is required")
    .max(500, "Message too long"),
});
