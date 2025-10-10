import { Request, Response } from "express";
import WebinarAnalytics, {
  AnalyticsEvent,
  IWebinarAnalytics,
  IAnalyticsEvent,
} from "../models/WebinarAnalytics.model";
import WebinarModel from "../models/Webinar.model";
import logger from "../utils/logger";
import { getSocketInstance } from "../utils/socketService";
import { Types } from "mongoose";

// Helper function to detect device type from user agent
const detectDevice = (userAgent: string): string => {
  if (/tablet|ipad|playbook|silk/i.test(userAgent)) {
    return "tablet";
  }
  if (
    /mobile|iphone|ipod|android|blackberry|opera|mini|windows\sce|palm|smartphone|iemobile/i.test(
      userAgent
    )
  ) {
    return "mobile";
  }
  return "desktop";
};

// Helper function to detect browser from user agent
const detectBrowser = (
  userAgent: string
): { name: string; version: string } => {
  let browser = "Unknown";
  let version = "Unknown";

  if (userAgent.includes("Chrome")) {
    browser = "Chrome";
    const match = userAgent.match(/Chrome\/([0-9.]+)/);
    version = match ? match[1] : "Unknown";
  } else if (userAgent.includes("Firefox")) {
    browser = "Firefox";
    const match = userAgent.match(/Firefox\/([0-9.]+)/);
    version = match ? match[1] : "Unknown";
  } else if (userAgent.includes("Safari") && !userAgent.includes("Chrome")) {
    browser = "Safari";
    const match = userAgent.match(/Version\/([0-9.]+)/);
    version = match ? match[1] : "Unknown";
  } else if (userAgent.includes("Edge")) {
    browser = "Edge";
    const match = userAgent.match(/Edge\/([0-9.]+)/);
    version = match ? match[1] : "Unknown";
  }

  return { name: browser, version };
};

// Helper function to get country from IP (simplified - in production use a GeoIP service)
const getCountryFromIP = (
  ip: string
): { country: string; countryCode: string } => {
  // This is a simplified version - in production, integrate with MaxMind GeoIP2 or similar
  // For now, return default values
  return { country: "Unknown", countryCode: "XX" };
};

// Track analytics event
export const trackAnalyticsEvent = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { webinarId, eventType, eventData } = req.body;
    const userId = req.user?.id;
    const userAgent = req.headers["user-agent"] || "";
    const ip = req.ip || req.connection.remoteAddress || "";

    // Generate session ID if not provided
    const sessionId = eventData.sessionId || `${ip}_${Date.now()}`;

    // Detect device and browser
    const device = detectDevice(userAgent);
    const browser = detectBrowser(userAgent);
    const geographic = getCountryFromIP(ip);

    // Create analytics event
    const analyticsEvent = new AnalyticsEvent({
      webinarId,
      userId,
      sessionId,
      eventType,
      eventData: {
        ...eventData,
        timestamp: new Date(),
        device,
        browser: `${browser.name} ${browser.version}`,
        country: geographic.country,
        ip,
        userAgent,
      },
    });

    await analyticsEvent.save();

    // Process the event immediately for real-time updates
    await processAnalyticsEvent(analyticsEvent);

    res.status(200).json({
      success: true,
      msg: "Analytics event tracked successfully",
    });
  } catch (error) {
    logger.error("Error tracking analytics event:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to track analytics event",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Process analytics event and update analytics data
const processAnalyticsEvent = async (event: IAnalyticsEvent): Promise<void> => {
  try {
    let analytics = await WebinarAnalytics.findOne({
      webinarId: event.webinarId,
    });

    if (!analytics) {
      // Create new analytics document
      analytics = new WebinarAnalytics({
        webinarId: event.webinarId,
        dailyMetrics: [],
        hourlyMetrics: [],
        trafficSources: [],
        geographic: [],
        devices: [],
        browsers: [],
        engagementEvents: [],
        realTimeData: {
          currentViewers: 0,
          peakViewersToday: 0,
          last24Hours: {
            views: 0,
            watchTime: 0,
            newEnrollments: 0,
          },
        },
        performance: {
          loadTime: 0,
          buffering: 0,
          qualityIssues: 0,
        },
        conversion: {
          impressions: 0,
          clicks: 0,
          enrollments: 0,
          conversions: 0,
          conversionRate: 0,
          revenue: 0,
        },
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Update metrics based on event type
    switch (event.eventType) {
      case "view":
        analytics.totalViews += 1;
        // Update daily metrics
        updateDailyMetrics(analytics, today, "views", 1);
        // Update traffic sources
        updateTrafficSources(analytics, event.eventData.source || "direct");
        // Update geographic data
        updateGeographic(analytics, event.eventData.country || "Unknown", "XX");
        // Update device data
        updateDevices(analytics, event.eventData.device || "desktop");
        // Update browser data
        updateBrowsers(analytics, event.eventData.browser || "Unknown");
        break;

      case "enrollment":
        analytics.totalEnrollments += 1;
        updateDailyMetrics(analytics, today, "enrollments", 1);
        analytics.conversion.enrollments += 1;
        break;

      case "join":
        analytics.totalAttendees += 1;
        updateDailyMetrics(analytics, today, "attendees", 1);
        analytics.realTimeData.currentViewers += 1;
        break;

      case "leave":
        analytics.realTimeData.currentViewers = Math.max(
          0,
          analytics.realTimeData.currentViewers - 1
        );
        if (event.eventData.duration) {
          analytics.totalWatchTime += event.eventData.duration;
          updateDailyMetrics(
            analytics,
            today,
            "watchTime",
            event.eventData.duration
          );
        }
        break;

      case "engagement":
        // Track engagement events
        analytics.engagementEvents.push({
          userId: event.userId,
          sessionId: event.sessionId,
          event: "chat", // or other engagement type
          timestamp: event.eventData.timestamp,
          metadata: event.eventData,
        });
        break;
    }

    // Update peak viewers
    if (
      analytics.realTimeData.currentViewers >
      analytics.realTimeData.peakViewersToday
    ) {
      analytics.realTimeData.peakViewersToday =
        analytics.realTimeData.currentViewers;
    }

    if (
      analytics.realTimeData.currentViewers > analytics.peakConcurrentViewers
    ) {
      analytics.peakConcurrentViewers = analytics.realTimeData.currentViewers;
    }

    // Calculate derived metrics
    analytics.averageWatchTime =
      analytics.totalAttendees > 0
        ? analytics.totalWatchTime / analytics.totalAttendees
        : 0;

    analytics.lastUpdated = new Date();

    // Append minute-level retention timeline point and emit websocket update
    try {
      const io = getSocketInstance();
      if (io) {
        // Log timeline point every time we process join/leave; throttle can be added later
        if (!Array.isArray((analytics as any).retentionTimeline)) {
          (analytics as any).retentionTimeline = [];
        }
        (analytics as any).retentionTimeline.push({
          timestamp: new Date(),
          viewers: analytics.realTimeData.currentViewers,
        });

        io.to((event.webinarId as any).toString()).emit("analytics_update", {
          webinarId: (event.webinarId as any).toString(),
          currentViewers: analytics.realTimeData.currentViewers,
          peakConcurrentViewers: analytics.peakConcurrentViewers,
          totalViews: analytics.totalViews,
          totalAttendees: analytics.totalAttendees,
          totalWatchTime: analytics.totalWatchTime,
          averageWatchTime: analytics.averageWatchTime,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      // Soft-fail websocket emissions
    }

    await analytics.save();

    // Mark event as processed
    event.processed = true;
    await event.save();
  } catch (error) {
    logger.error("Error processing analytics event:", error);
  }
};

// Helper function to update daily metrics
const updateDailyMetrics = (
  analytics: IWebinarAnalytics,
  date: Date,
  metric: string,
  value: number
): void => {
  const dateStr = date.toISOString().split("T")[0];
  let dailyMetric = analytics.dailyMetrics.find(
    (dm) => dm.date.toISOString().split("T")[0] === dateStr
  );

  if (!dailyMetric) {
    dailyMetric = {
      date,
      views: 0,
      watchTime: 0,
      enrollments: 0,
      attendees: 0,
      uniqueViewers: 0,
    };
    analytics.dailyMetrics.push(dailyMetric);
  }

  // Type-safe metric update
  switch (metric) {
    case "views":
      dailyMetric.views += value;
      break;
    case "watchTime":
      dailyMetric.watchTime += value;
      break;
    case "enrollments":
      dailyMetric.enrollments += value;
      break;
    case "attendees":
      dailyMetric.attendees += value;
      break;
    case "uniqueViewers":
      dailyMetric.uniqueViewers += value;
      break;
  }
};

// Helper function to update traffic sources
const updateTrafficSources = (
  analytics: IWebinarAnalytics,
  source: string
): void => {
  let trafficSource = analytics.trafficSources.find(
    (ts) => ts.source === source
  );

  if (!trafficSource) {
    trafficSource = { source, views: 1, percentage: 0 };
    analytics.trafficSources.push(trafficSource);
  } else {
    trafficSource.views += 1;
  }

  // Recalculate percentages
  const totalViews = analytics.trafficSources.reduce(
    (sum, ts) => sum + ts.views,
    0
  );
  analytics.trafficSources.forEach((ts) => {
    ts.percentage = totalViews > 0 ? (ts.views / totalViews) * 100 : 0;
  });
};

// Helper function to update geographic data
const updateGeographic = (
  analytics: IWebinarAnalytics,
  country: string,
  countryCode: string
): void => {
  let geo = analytics.geographic.find((g) => g.country === country);

  if (!geo) {
    geo = { country, countryCode, views: 1, watchTime: 0 };
    analytics.geographic.push(geo);
  } else {
    geo.views += 1;
  }
};

// Helper function to update device data
const updateDevices = (
  analytics: IWebinarAnalytics,
  deviceType: string
): void => {
  let device = analytics.devices.find((d) => d.type === deviceType);

  if (!device) {
    device = { type: deviceType, views: 1, percentage: 0 };
    analytics.devices.push(device);
  } else {
    device.views += 1;
  }

  // Recalculate percentages
  const totalViews = analytics.devices.reduce((sum, d) => sum + d.views, 0);
  analytics.devices.forEach((d) => {
    d.percentage = totalViews > 0 ? (d.views / totalViews) * 100 : 0;
  });
};

// Helper function to update browser data
const updateBrowsers = (
  analytics: IWebinarAnalytics,
  browser: string
): void => {
  const [name, version] = browser.split(" ");
  let browserData = analytics.browsers.find((b) => b.name === name);

  if (!browserData) {
    browserData = { name, version, views: 1, percentage: 0 };
    analytics.browsers.push(browserData);
  } else {
    browserData.views += 1;
  }

  // Recalculate percentages
  const totalViews = analytics.browsers.reduce((sum, b) => sum + b.views, 0);
  analytics.browsers.forEach((b) => {
    b.percentage = totalViews > 0 ? (b.views / totalViews) * 100 : 0;
  });
};

// Get analytics overview for a webinar
export const getWebinarAnalytics = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { webinarId } = req.params;
    const { timeRange = "7d" } = req.query;

    // Validate webinar exists and user has access
    const webinar = await WebinarModel.findById(webinarId);
    if (!webinar) {
      res.status(404).json({
        success: false,
        msg: "Webinar not found",
      });
      return;
    }

    // Check if user is host or admin
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (userRole !== "Admin" && webinar.hostId.toString() !== userId) {
      res.status(403).json({
        success: false,
        msg: "Access denied. You can only view analytics for your own webinars.",
      });
      return;
    }

    const analytics = await WebinarAnalytics.findOne({ webinarId }).populate(
      "webinarId",
      "title date time status"
    );

    if (!analytics) {
      // Return empty analytics if none exist yet
      res.status(200).json({
        success: true,
        analytics: {
          webinarId,
          totalViews: 0,
          totalWatchTime: 0,
          totalEnrollments: 0,
          totalAttendees: 0,
          averageWatchTime: 0,
          peakConcurrentViewers: 0,
          bounceRate: 0,
          completionRate: 0,
          dailyMetrics: [],
          trafficSources: [],
          geographic: [],
          devices: [],
          browsers: [],
          realTimeData: {
            currentViewers: 0,
            peakViewersToday: 0,
            last24Hours: {
              views: 0,
              watchTime: 0,
              newEnrollments: 0,
            },
          },
        },
      });
      return;
    }

    // Filter daily metrics based on time range
    let filteredDailyMetrics = analytics.dailyMetrics;
    const now = new Date();

    switch (timeRange) {
      case "1d":
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        filteredDailyMetrics = analytics.dailyMetrics.filter(
          (dm) => dm.date >= yesterday
        );
        break;
      case "7d":
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        filteredDailyMetrics = analytics.dailyMetrics.filter(
          (dm) => dm.date >= weekAgo
        );
        break;
      case "30d":
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        filteredDailyMetrics = analytics.dailyMetrics.filter(
          (dm) => dm.date >= monthAgo
        );
        break;
      case "90d":
        const quarterAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        filteredDailyMetrics = analytics.dailyMetrics.filter(
          (dm) => dm.date >= quarterAgo
        );
        break;
    }

    res.status(200).json({
      success: true,
      analytics: {
        ...analytics.toObject(),
        dailyMetrics: filteredDailyMetrics,
      },
    });
  } catch (error) {
    logger.error("Error getting webinar analytics:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to get webinar analytics",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Get real-time analytics for a webinar
export const getRealTimeAnalytics = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { webinarId } = req.params;

    const analytics = await WebinarAnalytics.findOne({ webinarId });

    if (!analytics) {
      res.status(200).json({
        success: true,
        realTimeData: {
          currentViewers: 0,
          peakViewersToday: 0,
          last24Hours: {
            views: 0,
            watchTime: 0,
            newEnrollments: 0,
          },
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      realTimeData: analytics.realTimeData,
    });
  } catch (error) {
    logger.error("Error getting real-time analytics:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to get real-time analytics",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Get analytics for all webinars (admin only)
export const getAllWebinarsAnalytics = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      page = 1,
      limit = 10,
      sortBy = "totalViews",
      sortOrder = "desc",
    } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const sortOptions: any = {};
    sortOptions[sortBy as string] = sortOrder === "desc" ? -1 : 1;

    const analytics = await WebinarAnalytics.find()
      .populate("webinarId", "title date time status hostId")
      .sort(sortOptions)
      .skip(skip)
      .limit(Number(limit));

    const total = await WebinarAnalytics.countDocuments();

    res.status(200).json({
      success: true,
      analytics,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(total / Number(limit)),
        totalAnalytics: total,
        hasNext: skip + Number(limit) < total,
        hasPrev: Number(page) > 1,
      },
    });
  } catch (error) {
    logger.error("Error getting all webinars analytics:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to get webinars analytics",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Initialize analytics for a webinar
export const initializeWebinarAnalytics = async (
  webinarId: string
): Promise<void> => {
  try {
    const existingAnalytics = await WebinarAnalytics.findOne({ webinarId });

    if (!existingAnalytics) {
      const analytics = new WebinarAnalytics({
        webinarId,
        dailyMetrics: [],
        hourlyMetrics: [],
        trafficSources: [],
        geographic: [],
        devices: [],
        browsers: [],
        engagementEvents: [],
        realTimeData: {
          currentViewers: 0,
          peakViewersToday: 0,
          last24Hours: {
            views: 0,
            watchTime: 0,
            newEnrollments: 0,
          },
        },
        performance: {
          loadTime: 0,
          buffering: 0,
          qualityIssues: 0,
        },
        conversion: {
          impressions: 0,
          clicks: 0,
          enrollments: 0,
          conversions: 0,
          conversionRate: 0,
          revenue: 0,
        },
      });

      await analytics.save();
      logger.info(`Analytics initialized for webinar ${webinarId}`);
    }
  } catch (error) {
    logger.error(
      `Error initializing analytics for webinar ${webinarId}:`,
      error
    );
  }
};

// Export overview analytics (for dashboard)
export const getAnalyticsOverview = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userRole = req.user?.role;
    const userId = req.user?.id;

    let matchCondition: any = {};

    // If not admin, only show analytics for user's webinars
    if (userRole !== "Admin") {
      const userWebinars = await WebinarModel.find({ hostId: userId }).select(
        "_id"
      );
      const webinarIds = userWebinars.map((w) => w._id);
      matchCondition = { webinarId: { $in: webinarIds } };
    }

    const overview = await WebinarAnalytics.aggregate([
      { $match: matchCondition },
      {
        $group: {
          _id: null,
          totalViews: { $sum: "$totalViews" },
          totalWatchTime: { $sum: "$totalWatchTime" },
          totalEnrollments: { $sum: "$totalEnrollments" },
          totalAttendees: { $sum: "$totalAttendees" },
          averageWatchTime: { $avg: "$averageWatchTime" },
          totalWebinars: { $sum: 1 },
        },
      },
    ]);

    const result = overview[0] || {
      totalViews: 0,
      totalWatchTime: 0,
      totalEnrollments: 0,
      totalAttendees: 0,
      averageWatchTime: 0,
      totalWebinars: 0,
    };

    res.status(200).json({
      success: true,
      overview: result,
    });
  } catch (error) {
    logger.error("Error getting analytics overview:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to get analytics overview",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
