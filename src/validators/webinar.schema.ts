import { z } from "zod";

// Simplified webinar schemas with only essential validation

export const CreateWebinarSchema = z.object({
  body: z.object({
    title: z.string().min(1, "Title is required").max(200),
    category: z.string().min(1, "Category is required"),
    description: z.string().optional(),
    youtubeLiveURL: z.string().url().optional().or(z.literal("")),
    productUSPs: z.string().optional(),
    agenda: z
      .string()
      .optional()
      .describe("HTML content from rich text editor"),
    tags: z.array(z.string()).default([]),
    date: z.string().min(1, "Date is required"),
    time: z.string().min(1, "Time is required"),
    timezone: z.string().default("UTC"),
    isRecurring: z.boolean().default(false),
    recurringType: z.enum(["daily", "weekly", "custom"]).optional(),
    customRecurring: z.string().optional(),
    presenters: z.array(z.string()).default([]),
    moderators: z.array(z.string()).default([]),
    resources: z.array(z.string()).default([]),
    enableQA: z.boolean().default(false),
    enablePolls: z.boolean().default(false),
    maxParticipants: z.string().optional(),
    isPublic: z.boolean().default(true),
    hasCertification: z.boolean().default(false),
    certificateConfig: z
      .object({
        enabled: z.boolean().optional(),
        templateUrl: z.string().optional(),
        selectedFields: z.array(z.string()).optional(),
        fieldMappings: z.array(z.any()).optional(),
        dimensions: z
          .object({
            width: z.number().optional(),
            height: z.number().optional(),
          })
          .optional(),
        autoGenerate: z.boolean().optional(),
        requireAttendance: z.boolean().optional(),
        minimumDuration: z.number().optional(),
      })
      .optional(),
    certificateTemplate: z.string().optional(),
    isPaid: z.boolean().default(false),
    price: z
      .union([z.string(), z.number()])
      .optional()
      .transform((val) => val?.toString()),
    currency: z.string().default("USD"),
    paymentGateway: z.enum(["stripe", "razorpay"]).default("stripe"),
    paymentUrl: z.string().url().optional().or(z.literal("")),
  }),
});

export const UpdateWebinarSchema = z.object({
  params: z.object({
    id: z.string().min(1, "Webinar ID is required"),
  }),
  body: z.object({
    title: z.string().min(1).max(200).optional(),
    category: z.string().min(1).optional(),
    description: z.string().optional(),
    youtubeLiveURL: z.string().url().optional().or(z.literal("")),
    productUSPs: z.string().optional(),
    agenda: z
      .string()
      .optional()
      .describe("HTML content from rich text editor"),
    tags: z.array(z.string()).optional(),
    date: z.string().min(1).optional(),
    time: z.string().min(1).optional(),
    timezone: z.string().optional(),
    isRecurring: z.boolean().optional(),
    recurringType: z.enum(["daily", "weekly", "custom"]).optional(),
    customRecurring: z.string().optional(),
    presenters: z.array(z.string()).optional(),
    moderators: z.array(z.string()).optional(),
    resources: z.array(z.string()).optional(),
    enableQA: z.boolean().optional(),
    enablePolls: z.boolean().optional(),
    maxParticipants: z.string().optional(),
    isPublic: z.boolean().optional(),
    hasCertification: z.boolean().optional(),
    certificateConfig: z
      .object({
        enabled: z.boolean().optional(),
        templateUrl: z.string().optional(),
        selectedFields: z.array(z.string()).optional(),
        fieldMappings: z.array(z.any()).optional(),
        dimensions: z
          .object({
            width: z.number().optional(),
            height: z.number().optional(),
          })
          .optional(),
        autoGenerate: z.boolean().optional(),
        requireAttendance: z.boolean().optional(),
        minimumDuration: z.number().optional(),
      })
      .optional(),
    certificateTemplate: z.string().optional(),
    isPaid: z.boolean().optional(),
    price: z
      .union([z.string(), z.number()])
      .optional()
      .transform((val) => val?.toString()),
    currency: z.string().optional(),
    paymentGateway: z.enum(["stripe", "razorpay"]).optional(),
    paymentUrl: z.string().url().optional().or(z.literal("")),
  }),
});
