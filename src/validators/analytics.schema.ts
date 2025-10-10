import { z } from "zod";

export const TrackAnalyticsEventSchema = z.object({
  body: z.object({
    webinarId: z.string().min(1, "Webinar ID is required"),
    eventType: z.enum(["view", "enrollment", "join", "leave", "engagement"], {
      message:
        "Event type must be one of: view, enrollment, join, leave, engagement",
    }),
    eventData: z.object({
      sessionId: z.string().optional(),
      duration: z.number().optional(),
      source: z.string().optional(),
      metadata: z.any().optional(),
    }),
  }),
});

export const GetAnalyticsSchema = z.object({
  params: z.object({
    webinarId: z.string().min(1, "Webinar ID is required"),
  }),
  query: z.object({
    timeRange: z
      .enum(["1d", "7d", "30d", "90d", "all"])
      .optional()
      .default("7d"),
  }),
});

export const GetAllAnalyticsSchema = z.object({
  query: z.object({
    page: z.string().optional().default("1"),
    limit: z.string().optional().default("10"),
    sortBy: z
      .enum([
        "totalViews",
        "totalWatchTime",
        "totalEnrollments",
        "totalAttendees",
        "createdAt",
      ])
      .optional()
      .default("totalViews"),
    sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
  }),
});
