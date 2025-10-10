import { z } from "zod";

// Field schema for certificate template
const fieldSchema = z.object({
  id: z.string(),
  type: z.enum([
    "text",
    "participant_name",
    "webinar_title",
    "completion_date",
    "instructor_name",
  ]),
  x: z.number().min(0).max(800),
  y: z.number().min(0).max(600),
  width: z.number().min(10).max(400),
  height: z.number().min(10).max(100),
  fontSize: z.number().min(8).max(72).optional(),
  fontFamily: z.string().optional(),
  color: z.string().optional(),
  text: z.string().optional(), // For static text fields
});

// Create certificate template schema
export const createTemplateSchema = z.object({
  body: z.object({
    name: z
      .string()
      .min(3, "Template name must be at least 3 characters")
      .max(100, "Template name must not exceed 100 characters"),
    description: z
      .string()
      .max(500, "Description must not exceed 500 characters")
      .optional(),
    fields: z.array(fieldSchema).min(1, "At least one field is required"),
    background: z.object({
      type: z.enum(["color", "image"]),
      value: z.string(), // Color hex code or image URL
    }),
    dimensions: z.object({
      width: z.number().min(400).max(1200),
      height: z.number().min(300).max(900),
    }),
  }),
});

// Update certificate template schema
export const updateTemplateSchema = z.object({
  params: z.object({
    templateId: z.string().min(1, "Template ID is required"),
  }),
  body: z.object({
    name: z
      .string()
      .min(3, "Template name must be at least 3 characters")
      .max(100, "Template name must not exceed 100 characters")
      .optional(),
    description: z
      .string()
      .max(500, "Description must not exceed 500 characters")
      .optional(),
    fields: z
      .array(fieldSchema)
      .min(1, "At least one field is required")
      .optional(),
    background: z
      .object({
        type: z.enum(["color", "image"]),
        value: z.string(),
      })
      .optional(),
    dimensions: z
      .object({
        width: z.number().min(400).max(1200),
        height: z.number().min(300).max(900),
      })
      .optional(),
    isActive: z.boolean().optional(),
  }),
});

// Generate certificate schema
export const generateCertificateSchema = z.object({
  body: z.object({
    templateId: z.string().min(1, "Template ID is required"),
    webinarId: z.string().min(1, "Webinar ID is required"),
    participantId: z.string().min(1, "Participant ID is required").optional(),
    participantName: z
      .string()
      .min(1, "Participant name is required")
      .optional(),
    participantEmail: z.string().email("Valid email is required").optional(),
    customData: z.record(z.string(), z.any()).optional(),
  }),
});

// Get templates schema
export const getTemplatesSchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/).transform(Number).optional(),
    limit: z.string().regex(/^\d+$/).transform(Number).optional(),
    search: z.string().optional(),
    isActive: z
      .enum(["true", "false"])
      .transform((val) => val === "true")
      .optional(),
  }),
});

// Get template by ID schema
export const getTemplateByIdSchema = z.object({
  params: z.object({
    templateId: z.string().min(1, "Template ID is required"),
  }),
});

// Delete template schema
export const deleteTemplateSchema = z.object({
  params: z.object({
    templateId: z.string().min(1, "Template ID is required"),
  }),
});

// Get user certificates schema
export const getUserCertificatesSchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/).transform(Number).optional(),
    limit: z.string().regex(/^\d+$/).transform(Number).optional(),
    webinarId: z.string().optional(),
  }),
});

// Get certificate by ID schema
export const getCertificateByIdSchema = z.object({
  params: z.object({
    certificateId: z.string().min(1, "Certificate ID is required"),
  }),
});

// Get generation status schema
export const getGenerationStatusSchema = z.object({
  params: z.object({
    jobId: z.string().min(1, "Job ID is required"),
  }),
});

// Generate certificates for webinar schema
export const generateWebinarCertificatesSchema = z.object({
  body: z.object({
    templateId: z.string().min(1, "Template ID is required"),
    webinarId: z.string().min(1, "Webinar ID is required"),
    participantIds: z
      .array(z.string())
      .min(1, "At least one participant is required")
      .optional(),
    sendEmail: z.boolean().optional().default(true),
  }),
});

// Upload template from base64 schema
export const uploadTemplateBase64Schema = z.object({
  body: z.object({
    base64Data: z.string().min(1, "Base64 data is required"),
    webinarId: z.string().optional(),
    fileName: z.string().optional(),
  }),
});
