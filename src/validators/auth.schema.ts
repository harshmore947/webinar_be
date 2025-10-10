import { z } from "zod";

// Simplified auth schemas with minimal but effective validation

export const RegisterSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email format"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    role: z
      .enum(["Admin", "Host", "Presenter", "Moderator", "Attendee"])
      .default("Attendee"),
  }),
});

export const LoginSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email format"),
    password: z.string().min(1, "Password is required"),
  }),
});

export const ForgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email format"),
  }),
});

export const VerifyResetCodeSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email format"),
    code: z.string().length(6, "Verification code must be 6 digits"),
  }),
});

export const ResetPasswordSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email format"),
    code: z.string().length(6, "Verification code must be 6 digits"),
    password: z.string().min(6, "Password must be at least 6 characters"),
  }),
});

export const SearchUsersSchema = z.object({
  query: z.object({
    query: z.string().min(1, "Search query is required"),
  }),
});
