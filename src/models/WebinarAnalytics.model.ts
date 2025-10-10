import mongoose, { Document, Schema } from "mongoose";
import { IUser } from "./User.model";
import { IWebinar } from "./Webinar.model";

export interface IWebinarAnalytics extends Document {
  webinarId: mongoose.Types.ObjectId;

  // Basic metrics
  totalViews: number;
  totalWatchTime: number; // in minutes
  totalEnrollments: number;
  totalAttendees: number;

  // Engagement metrics
  averageWatchTime: number; // in minutes
  peakConcurrentViewers: number;
  bounceRate: number; // percentage of users who left within first 5 minutes
  completionRate: number; // percentage of users who stayed until end

  // Daily breakdown for charts
  dailyMetrics: Array<{
    date: Date;
    views: number;
    watchTime: number; // in minutes
    enrollments: number;
    attendees: number;
    uniqueViewers: number;
  }>;

  // Hourly breakdown for detailed view
  hourlyMetrics: Array<{
    hour: number; // 0-23
    date: Date;
    viewers: number;
    totalWatchTime: number;
  }>;

  // Minute-level retention timeline while live
  retentionTimeline?: Array<{
    timestamp: Date;
    viewers: number;
  }>;

  // Traffic sources
  trafficSources: Array<{
    source: string; // 'direct', 'search', 'social', 'email', 'referral'
    views: number;
    percentage: number;
  }>;

  // Geographic data
  geographic: Array<{
    country: string;
    countryCode: string;
    views: number;
    watchTime: number;
  }>;

  // Device breakdown
  devices: Array<{
    type: string; // 'desktop', 'mobile', 'tablet'
    views: number;
    percentage: number;
  }>;

  // Browser breakdown
  browsers: Array<{
    name: string; // 'Chrome', 'Firefox', 'Safari', etc.
    version: string;
    views: number;
    percentage: number;
  }>;

  // Engagement events
  engagementEvents: Array<{
    userId?: mongoose.Types.ObjectId;
    sessionId: string;
    event:
      | "join"
      | "leave"
      | "chat"
      | "poll_vote"
      | "qa_question"
      | "resource_download";
    timestamp: Date;
    metadata?: any; // Additional data specific to the event
  }>;

  // Real-time data
  realTimeData: {
    currentViewers: number;
    peakViewersToday: number;
    last24Hours: {
      views: number;
      watchTime: number;
      newEnrollments: number;
    };
  };

  // Performance metrics
  performance: {
    loadTime: number; // average page load time in ms
    buffering: number; // total buffering time in seconds
    qualityIssues: number; // number of quality-related issues reported
  };

  // Conversion metrics (for paid webinars)
  conversion: {
    impressions: number; // times webinar was shown/promoted
    clicks: number; // clicks on webinar link
    enrollments: number;
    conversions: number; // actual payments for paid webinars
    conversionRate: number; // percentage
    revenue?: number; // total revenue generated
  };

  // Last updated timestamp
  lastUpdated: Date;

  createdAt: Date;
  updatedAt: Date;
}

export interface IAnalyticsEvent extends Document {
  webinarId: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
  sessionId: string;
  eventType: "view" | "enrollment" | "join" | "leave" | "engagement";
  eventData: {
    timestamp: Date;
    duration?: number; // for watch events
    source?: string; // traffic source
    device?: string;
    browser?: string;
    country?: string;
    ip?: string;
    userAgent?: string;
  };
  processed: boolean; // whether this event has been processed into analytics
  createdAt: Date;
}

const WebinarAnalyticsSchema = new Schema<IWebinarAnalytics>(
  {
    webinarId: {
      type: Schema.Types.ObjectId,
      ref: "Webinar",
      required: true,
      unique: true,
    },

    // Basic metrics
    totalViews: { type: Number, default: 0 },
    totalWatchTime: { type: Number, default: 0 },
    totalEnrollments: { type: Number, default: 0 },
    totalAttendees: { type: Number, default: 0 },

    // Engagement metrics
    averageWatchTime: { type: Number, default: 0 },
    peakConcurrentViewers: { type: Number, default: 0 },
    bounceRate: { type: Number, default: 0 },
    completionRate: { type: Number, default: 0 },

    // Daily breakdown
    dailyMetrics: [
      {
        date: { type: Date, required: true },
        views: { type: Number, default: 0 },
        watchTime: { type: Number, default: 0 },
        enrollments: { type: Number, default: 0 },
        attendees: { type: Number, default: 0 },
        uniqueViewers: { type: Number, default: 0 },
      },
    ],

    // Hourly breakdown
    hourlyMetrics: [
      {
        hour: { type: Number, min: 0, max: 23, required: true },
        date: { type: Date, required: true },
        viewers: { type: Number, default: 0 },
        totalWatchTime: { type: Number, default: 0 },
      },
    ],

    // Minute-level retention timeline (appended during live sessions)
    retentionTimeline: [
      {
        timestamp: { type: Date, required: true },
        viewers: { type: Number, required: true },
      },
    ],

    // Traffic sources
    trafficSources: [
      {
        source: { type: String, required: true },
        views: { type: Number, default: 0 },
        percentage: { type: Number, default: 0 },
      },
    ],

    // Geographic data
    geographic: [
      {
        country: { type: String, required: true },
        countryCode: { type: String, required: true },
        views: { type: Number, default: 0 },
        watchTime: { type: Number, default: 0 },
      },
    ],

    // Device breakdown
    devices: [
      {
        type: { type: String, required: true },
        views: { type: Number, default: 0 },
        percentage: { type: Number, default: 0 },
      },
    ],

    // Browser breakdown
    browsers: [
      {
        name: { type: String, required: true },
        version: { type: String },
        views: { type: Number, default: 0 },
        percentage: { type: Number, default: 0 },
      },
    ],

    // Engagement events
    engagementEvents: [
      {
        userId: { type: Schema.Types.ObjectId, ref: "User" },
        sessionId: { type: String, required: true },
        event: {
          type: String,
          enum: [
            "join",
            "leave",
            "chat",
            "poll_vote",
            "qa_question",
            "resource_download",
          ],
          required: true,
        },
        timestamp: { type: Date, default: Date.now },
        metadata: { type: Schema.Types.Mixed },
      },
    ],

    // Real-time data
    realTimeData: {
      currentViewers: { type: Number, default: 0 },
      peakViewersToday: { type: Number, default: 0 },
      last24Hours: {
        views: { type: Number, default: 0 },
        watchTime: { type: Number, default: 0 },
        newEnrollments: { type: Number, default: 0 },
      },
    },

    // Performance metrics
    performance: {
      loadTime: { type: Number, default: 0 },
      buffering: { type: Number, default: 0 },
      qualityIssues: { type: Number, default: 0 },
    },

    // Conversion metrics
    conversion: {
      impressions: { type: Number, default: 0 },
      clicks: { type: Number, default: 0 },
      enrollments: { type: Number, default: 0 },
      conversions: { type: Number, default: 0 },
      conversionRate: { type: Number, default: 0 },
      revenue: { type: Number, default: 0 },
    },

    lastUpdated: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const AnalyticsEventSchema = new Schema<IAnalyticsEvent>(
  {
    webinarId: {
      type: Schema.Types.ObjectId,
      ref: "Webinar",
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    sessionId: { type: String, required: true },
    eventType: {
      type: String,
      enum: ["view", "enrollment", "join", "leave", "engagement"],
      required: true,
    },
    eventData: {
      timestamp: { type: Date, default: Date.now },
      duration: { type: Number },
      source: { type: String },
      device: { type: String },
      browser: { type: String },
      country: { type: String },
      ip: { type: String },
      userAgent: { type: String },
    },
    processed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Indexes for better performance
WebinarAnalyticsSchema.index({ webinarId: 1 });
WebinarAnalyticsSchema.index({ lastUpdated: 1 });
WebinarAnalyticsSchema.index({ "dailyMetrics.date": 1 });

AnalyticsEventSchema.index({ webinarId: 1, createdAt: -1 });
AnalyticsEventSchema.index({ processed: 1, createdAt: 1 });
AnalyticsEventSchema.index({ sessionId: 1 });

export const WebinarAnalytics = mongoose.model<IWebinarAnalytics>(
  "WebinarAnalytics",
  WebinarAnalyticsSchema
);

export const AnalyticsEvent = mongoose.model<IAnalyticsEvent>(
  "AnalyticsEvent",
  AnalyticsEventSchema
);

export default WebinarAnalytics;
