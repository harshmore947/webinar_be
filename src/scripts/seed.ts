import "dotenv/config";
import mongoose, { Types } from "mongoose";
import { connectDB } from "../utils/databaseConnection";
import UserModel from "../models/User.model";
import WebinarModel from "../models/Webinar.model";
import WebinarAnalytics from "../models/WebinarAnalytics.model";

async function getOrCreateSeedUser() {
  let user = await UserModel.findOne();
  if (!user) {
    user = new UserModel({
      firstName: "Demo",
      lastName: "Host",
      email: `demo.host+${Date.now()}@example.com`,
      password: "Password@123", // hashed by pre-save hook if present; otherwise placeholder
      role: "Admin",
    } as any);
    await user.save();
  }
  return user;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(12, 0, 0, 0);
  return d;
}

async function seedWebinars(hostId: Types.ObjectId) {
  const demoThumb =
    "https://res.cloudinary.com/demo/image/upload/w_800,h_450,c_fill/sample.jpg";
  const demoCert =
    "https://res.cloudinary.com/demo/image/upload/c_fit,w_1200/sample.jpg";

  const webinars = [
    {
      title: "AI for Beginners",
      category: "Technology",
      description: "Introduction to AI concepts and real-world demos",
      youtubeLiveURL: "",
      productUSPs: "Live Q&A, resources, certificate",
      agenda: "<p>Basics of AI, ML vs DL, Use cases</p>",
      tags: ["ai", "ml", "beginner"],
      date: daysAgo(3).toISOString().split("T")[0],
      time: "15:00",
      timezone: "UTC",
      isRecurring: false,
      recurringType: "daily" as const,
      presenters: [],
      moderators: [],
      resources: [],
      enableQA: true,
      enablePolls: true,
      maxParticipants: "500",
      isPublic: true,
      status: "ended" as const,
      hostId,
      enrolledUsers: [hostId],
      thumbnailUrl: demoThumb,
      hasCertification: true,
      certificateTemplate: demoCert,
      certificateConfig: {
        dimensions: { width: 1200, height: 900 },
        fields: [
          {
            id: "attendee_name",
            label: "Attendee Name",
            type: "text",
            placeholder: "",
            required: true,
            position: { x: 420, y: 420 },
            fontSize: 28,
            fontColor: "#111111",
            fontWeight: "bold",
            rotation: 0,
            width: 360,
            height: 40,
          },
          {
            id: "webinar_title",
            label: "Webinar Title",
            type: "text",
            placeholder: "",
            required: true,
            position: { x: 420, y: 360 },
            fontSize: 20,
            fontColor: "#333333",
            fontWeight: "normal",
            rotation: 0,
            width: 500,
            height: 30,
          },
        ],
      },
      attendedUsers: [
        {
          userId: hostId as any,
          joinTime: daysAgo(3),
          leaveTime: daysAgo(3),
          totalDuration: 62,
        },
      ],
      isPaid: false,
    },
    {
      title: "Marketing Analytics Deep Dive",
      category: "Business",
      description: "Attribution, funnels and dashboards",
      youtubeLiveURL: "",
      productUSPs: "Templates and examples",
      agenda: "<p>Attribution models, cohort analysis</p>",
      tags: ["marketing", "analytics"],
      date: daysAgo(1).toISOString().split("T")[0],
      time: "17:00",
      timezone: "UTC",
      isRecurring: false,
      recurringType: "daily" as const,
      presenters: [],
      moderators: [],
      resources: [],
      enableQA: true,
      enablePolls: true,
      maxParticipants: "300",
      isPublic: true,
      status: "ended" as const,
      hostId,
      enrolledUsers: [hostId],
      thumbnailUrl: demoThumb,
      hasCertification: false,
      attendedUsers: [],
      isPaid: true,
      price: 19,
      currency: "USD",
      paymentGateway: "stripe" as const,
    },
    {
      title: "Live: Next.js Performance",
      category: "Development",
      description: "Optimizing Next.js apps",
      youtubeLiveURL: "",
      productUSPs: "Live demo",
      agenda: "<p>Profiling, code-splitting, caching</p>",
      tags: ["nextjs", "performance"],
      date: daysAgo(-1).toISOString().split("T")[0], // upcoming/live
      time: "11:00",
      timezone: "UTC",
      isRecurring: false,
      recurringType: "daily" as const,
      presenters: [],
      moderators: [],
      resources: [],
      enableQA: true,
      enablePolls: true,
      maxParticipants: "800",
      isPublic: true,
      status: "live" as const,
      hostId,
      enrolledUsers: [hostId],
      thumbnailUrl: demoThumb,
      hasCertification: true,
      certificateTemplate: demoCert,
      certificateConfig: {
        dimensions: { width: 1200, height: 900 },
        fields: [
          {
            id: "attendee_name",
            label: "Attendee Name",
            type: "text",
            placeholder: "",
            required: true,
            position: { x: 420, y: 420 },
            fontSize: 28,
            fontColor: "#111111",
            fontWeight: "bold",
            rotation: 0,
            width: 360,
            height: 40,
          },
        ],
      },
      attendedUsers: [],
      isPaid: false,
    },
  ];

  const created = await WebinarModel.insertMany(webinars as any[]);
  return created;
}

async function seedAnalytics(webinarId: Types.ObjectId) {
  const now = new Date();
  const dailyMetrics = Array.from({ length: 7 }).map((_, i) => ({
    date: daysAgo(6 - i),
    views: 100 + i * 15,
    watchTime: 250 + i * 20,
    enrollments: 10 + i,
    attendees: 60 + i * 5,
    uniqueViewers: 80 + i * 10,
  }));

  const retentionTimeline = Array.from({ length: 30 }).map((_, i) => ({
    timestamp: new Date(now.getTime() - (30 - i) * 60 * 1000),
    viewers: Math.max(5, 50 - i + Math.round(Math.sin(i / 3) * 5)),
  }));

  await WebinarAnalytics.findOneAndUpdate(
    { webinarId },
    {
      webinarId,
      totalViews: 1234,
      totalWatchTime: 4321,
      totalEnrollments: 345,
      totalAttendees: 210,
      averageWatchTime: 20.5,
      peakConcurrentViewers: 98,
      bounceRate: 12.3,
      completionRate: 64.2,
      dailyMetrics,
      hourlyMetrics: [],
      trafficSources: [
        { source: "direct", views: 600, percentage: 48.6 },
        { source: "search", views: 400, percentage: 32.4 },
        { source: "social", views: 234, percentage: 19.0 },
      ],
      geographic: [
        {
          country: "United States",
          countryCode: "US",
          views: 500,
          watchTime: 1600,
        },
        { country: "India", countryCode: "IN", views: 400, watchTime: 1400 },
        { country: "Germany", countryCode: "DE", views: 150, watchTime: 500 },
      ],
      devices: [
        { type: "desktop", views: 800, percentage: 64 },
        { type: "mobile", views: 400, percentage: 32 },
        { type: "tablet", views: 34, percentage: 4 },
      ],
      browsers: [
        { name: "Chrome", version: "124", views: 900, percentage: 73 },
        { name: "Firefox", version: "126", views: 150, percentage: 12 },
        { name: "Safari", version: "17", views: 120, percentage: 10 },
      ],
      engagementEvents: [],
      realTimeData: {
        currentViewers: 42,
        peakViewersToday: 91,
        last24Hours: { views: 320, watchTime: 980, newEnrollments: 23 },
      },
      performance: { loadTime: 1100, buffering: 30, qualityIssues: 2 },
      conversion: {
        impressions: 4500,
        clicks: 800,
        enrollments: 345,
        conversions: 210,
        conversionRate: 26.25,
        revenue: 3990,
      },
      retentionTimeline,
      lastUpdated: new Date(),
    },
    { upsert: true, new: true }
  );
}

async function main() {
  await connectDB();
  const user = await getOrCreateSeedUser();
  const created = await seedWebinars(user._id as any);
  for (const w of created) {
    await seedAnalytics(w._id as any);
  }
  console.log(`✅ Seeded ${created.length} webinars with analytics.`);
  await mongoose.connection.close();
}

main().catch(async (err) => {
  console.error("Seed error:", err);
  try {
    await mongoose.connection.close();
  } catch {}
  process.exit(1);
});
