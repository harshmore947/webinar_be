import { z } from "zod";

// Admin create user schema
export const AdminCreateUserSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email format"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    role: z.enum(["Admin", "Host", "Presenter", "Moderator", "Attendee"]),
  }),
});

// Admin update user schema
export const AdminUpdateUserSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email format").optional(),
    password: z
      .string()
      .min(6, "Password must be at least 6 characters")
      .optional(),
    firstName: z.string().min(1, "First name is required").optional(),
    lastName: z.string().min(1, "Last name is required").optional(),
    role: z
      .enum(["Admin", "Host", "Presenter", "Moderator", "Attendee"])
      .optional(),
  }),
});

// Bulk delete schema
export const BulkDeleteSchema = z.object({
  body: z.object({
    userIds: z
      .array(z.string().min(1, "User ID is required"))
      .min(1, "At least one user ID is required")
      .optional(),
    webinarIds: z
      .array(z.string().min(1, "Webinar ID is required"))
      .min(1, "At least one webinar ID is required")
      .optional(),
  }),
});

// Search schema
export const SearchSchema = z.object({
  query: z.object({
    query: z.string().optional(),
    role: z
      .enum(["Admin", "Host", "Presenter", "Moderator", "Attendee"])
      .optional(),
    category: z.string().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});
