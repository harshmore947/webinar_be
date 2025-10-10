import { z } from "zod";

export const sendMessageSchema = z.object({
  body: z.object({
    webinarId: z
      .string()
      .min(1, "Webinar ID is required")
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid webinar ID format"),
    message: z
      .string()
      .min(1, "Message cannot be empty")
      .max(500, "Message cannot exceed 500 characters"),
  }),
});

export const getChatMessagesSchema = z.object({
  params: z.object({
    webinarId: z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid webinar ID format"),
  }),
  query: z
    .object({
      limit: z
        .string()
        .regex(/^\d+$/, "Limit must be a number")
        .transform(Number)
        .refine(
          (val) => val > 0 && val <= 100,
          "Limit must be between 1 and 100"
        )
        .optional(),
      before: z.string().datetime("Invalid timestamp format").optional(),
    })
    .partial(),
});

export const deleteMessageSchema = z.object({
  params: z.object({
    messageId: z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid message ID format"),
  }),
});

export const moderateMessageSchema = z.object({
  params: z.object({
    messageId: z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid message ID format"),
  }),
});
