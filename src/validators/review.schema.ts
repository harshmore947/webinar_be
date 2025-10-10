import { z } from "zod";

export const UpsertReviewSchema = z.object({
  params: z.object({
    webinarId: z.string().min(1, "Webinar ID is required"),
  }),
  body: z.object({
    rating: z.preprocess((val) => {
      // Convert string to number if needed
      if (typeof val === "string") {
        const num = parseFloat(val);
        return isNaN(num) ? val : num;
      }
      return val;
    }, z.number().min(1).max(5)),
    comment: z
      .string()
      .max(1000)
      .optional()
      .transform((val) => val || undefined),
  }),
});

export const GetReviewsSchema = z.object({
  params: z.object({
    webinarId: z.string().min(1, "Webinar ID is required"),
  }),
  query: z.object({
    page: z.string().optional().default("1"),
    limit: z.string().optional().default("10"),
  }),
});
