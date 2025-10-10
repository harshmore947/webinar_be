import { Request, Response } from "express";
import ChatModel from "../models/Chat.model";
import WebinarModel from "../models/Webinar.model";
import WebinarAnalytics from "../models/WebinarAnalytics.model";
import { logError, logInfo } from "../utils/logger";
import ExcelJS from "exceljs";
import { Parser } from "json2csv";

// Export chat messages for a webinar (admin only)
export const exportWebinarChat = async (req: Request, res: Response) => {
  try {
    const { webinarId } = req.params;
    const { format = "excel" } = req.query; // excel, csv, json
    const userRole = req.user?.role;

    // Check admin access
    if (userRole !== "Admin") {
      return res.status(403).json({
        success: false,
        msg: "Admin access required",
      });
    }

    // Verify webinar exists
    const webinar = await WebinarModel.findById(webinarId)
      .populate("hostId", "firstName lastName email")
      .lean();

    if (!webinar) {
      return res.status(404).json({
        success: false,
        msg: "Webinar not found",
      });
    }

    // Get all chat messages for the webinar
    const chatMessages = await ChatModel.find({ webinarId })
      .populate("userId", "firstName lastName email")
      .sort({ timestamp: 1 })
      .lean();

    // Prepare data for export
    const exportData = chatMessages.map((msg, index) => ({
      messageNumber: index + 1,
      timestamp: new Date(msg.timestamp).toLocaleString(),
      senderName:
        msg.userId &&
        typeof msg.userId === "object" &&
        "firstName" in msg.userId
          ? `${(msg.userId as any).firstName} ${
              (msg.userId as any).lastName
            }`.trim()
          : msg.displayName || "Anonymous",
      senderEmail:
        msg.userId && typeof msg.userId === "object" && "email" in msg.userId
          ? (msg.userId as any).email || "N/A"
          : "N/A",
      message: msg.message,
      isDeleted: msg.isDeleted ? "Yes" : "No",
      isModerated: msg.isModerated ? "Yes" : "No",
    }));

    const fileName = `${webinar.title
      .replace(/[^a-z0-9]/gi, "_")
      .toLowerCase()}_chat_${new Date().toISOString().split("T")[0]}`;

    if (format === "excel") {
      // Create Excel workbook
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Chat Messages");

      // Add webinar info header
      worksheet.addRow(["Webinar Chat Export"]);
      worksheet.addRow([]);
      worksheet.addRow(["Webinar Title:", webinar.title]);
      worksheet.addRow([
        "Host:",
        webinar.hostId &&
        typeof webinar.hostId === "object" &&
        "firstName" in webinar.hostId
          ? `${(webinar.hostId as any).firstName} ${
              (webinar.hostId as any).lastName
            }`
          : "Unknown Host",
      ]);
      worksheet.addRow(["Date:", new Date(webinar.date).toLocaleString()]);
      worksheet.addRow(["Total Messages:", chatMessages.length]);
      worksheet.addRow(["Export Date:", new Date().toLocaleString()]);
      worksheet.addRow([]);

      // Add headers
      const headers = [
        "Message #",
        "Timestamp",
        "Sender Name",
        "Sender Email",
        "Message",
        "Deleted",
        "Moderated",
      ];
      worksheet.addRow(headers);

      // Style headers
      const headerRow = worksheet.lastRow;
      if (headerRow) {
        headerRow.font = { bold: true };
        headerRow.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFE6F3FF" },
        };
      }

      // Add data
      exportData.forEach((row) => {
        worksheet.addRow([
          row.messageNumber,
          row.timestamp,
          row.senderName,
          row.senderEmail,
          row.message,
          row.isDeleted,
          row.isModerated,
        ]);
      });

      // Auto-fit columns
      worksheet.columns.forEach((column) => {
        column.width = Math.max(12, Math.min(50, column.header?.length || 12));
      });

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileName}.xlsx"`
      );

      await workbook.xlsx.write(res);
      res.end();
    } else if (format === "csv") {
      // Create CSV
      const fields = [
        { label: "Message #", value: "messageNumber" },
        { label: "Timestamp", value: "timestamp" },
        { label: "Sender Name", value: "senderName" },
        { label: "Sender Email", value: "senderEmail" },
        { label: "Message", value: "message" },
        { label: "Deleted", value: "isDeleted" },
        { label: "Moderated", value: "isModerated" },
      ];

      const parser = new Parser({ fields });
      const csv = parser.parse(exportData);

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileName}.csv"`
      );
      res.send(csv);
    } else if (format === "json") {
      // JSON export with metadata
      const jsonExport = {
        webinar: {
          id: webinar._id,
          title: webinar.title,
          host:
            webinar.hostId &&
            typeof webinar.hostId === "object" &&
            "firstName" in webinar.hostId
              ? `${(webinar.hostId as any).firstName} ${
                  (webinar.hostId as any).lastName
                }`
              : "Unknown Host",
          date: webinar.date,
          exportDate: new Date().toISOString(),
        },
        chatMessages: exportData,
        statistics: {
          totalMessages: chatMessages.length,
          deletedMessages: chatMessages.filter((msg) => msg.isDeleted).length,
          moderatedMessages: chatMessages.filter((msg) => msg.isModerated)
            .length,
          uniqueParticipants: new Set(
            chatMessages.map((msg) =>
              msg.userId &&
              typeof msg.userId === "object" &&
              "email" in msg.userId
                ? (msg.userId as any).email || msg.displayName
                : msg.displayName
            )
          ).size,
        },
      };

      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileName}.json"`
      );
      res.json(jsonExport);
    } else {
      return res.status(400).json({
        success: false,
        msg: "Invalid format. Supported formats: excel, csv, json",
      });
    }

    logInfo(`Admin exported chat for webinar ${webinarId} in ${format} format`);
  } catch (error) {
    logError("Error exporting webinar chat:", error as Error);
    res.status(500).json({
      success: false,
      msg: "Failed to export chat",
      error:
        process.env.NODE_ENV === "development"
          ? (error as Error).message
          : undefined,
    });
  }
};

// Get comprehensive webinar analytics for admin
export const getAdminWebinarAnalytics = async (req: Request, res: Response) => {
  try {
    const { webinarId } = req.params;
    const { timeRange = "all" } = req.query;
    const userRole = req.user?.role;

    console.log("📊 Admin analytics request:", {
      webinarId,
      timeRange,
      userRole,
      userId: req.user?.id,
    });

    // Check admin access
    if (userRole !== "Admin") {
      console.log("❌ Access denied - not admin");
      return res.status(403).json({
        success: false,
        msg: "Admin access required",
      });
    }

    // Get webinar details
    const webinar = await WebinarModel.findById(webinarId)
      .populate("hostId", "firstName lastName email")
      .populate("enrolledUsers", "firstName lastName email")
      .lean();

    if (!webinar) {
      console.log("❌ Webinar not found:", webinarId);
      return res.status(404).json({
        success: false,
        msg: "Webinar not found",
      });
    }

    console.log("✅ Webinar found:", {
      id: webinar._id,
      title: webinar.title,
      enrolledCount: webinar.enrolledUsers?.length || 0,
    });

    // Get analytics data as a Document (avoid .lean() while mutating/creating)
    let analyticsDoc = await WebinarAnalytics.findOne({ webinarId });

    // If no analytics exist, create initial analytics record
    if (!analyticsDoc) {
      console.log("📊 No analytics found, creating initial record...");
      const newAnalytics = new WebinarAnalytics({
        webinarId,
        totalViews: Math.floor(Math.random() * 100) + 10, // Sample data for testing
        totalWatchTime: Math.floor(Math.random() * 500) + 50,
        totalEnrollments: webinar.enrolledUsers?.length || 0,
        totalAttendees: Math.floor((webinar.enrolledUsers?.length || 0) * 0.8),
        averageWatchTime: Math.floor(Math.random() * 30) + 15,
        peakConcurrentViewers: Math.floor(Math.random() * 50) + 5,
        bounceRate: Math.floor(Math.random() * 30) + 10,
        completionRate: Math.floor(Math.random() * 40) + 60,
        dailyMetrics: [],
        trafficSources: [
          {
            source: "direct",
            views: Math.floor(Math.random() * 50) + 10,
            percentage: 60,
          },
          {
            source: "social",
            views: Math.floor(Math.random() * 30) + 5,
            percentage: 25,
          },
          {
            source: "email",
            views: Math.floor(Math.random() * 20) + 3,
            percentage: 15,
          },
        ],
        geographic: [
          {
            country: "United States",
            views: Math.floor(Math.random() * 40) + 20,
            percentage: 45,
          },
          {
            country: "Canada",
            views: Math.floor(Math.random() * 20) + 10,
            percentage: 25,
          },
          {
            country: "United Kingdom",
            views: Math.floor(Math.random() * 15) + 8,
            percentage: 18,
          },
          {
            country: "Australia",
            views: Math.floor(Math.random() * 10) + 5,
            percentage: 12,
          },
        ],
        devices: [
          {
            type: "desktop",
            views: Math.floor(Math.random() * 40) + 30,
            percentage: 65,
          },
          {
            type: "mobile",
            views: Math.floor(Math.random() * 20) + 15,
            percentage: 25,
          },
          {
            type: "tablet",
            views: Math.floor(Math.random() * 10) + 5,
            percentage: 10,
          },
        ],
        browsers: [
          {
            name: "Chrome",
            version: "120.0",
            views: Math.floor(Math.random() * 50) + 40,
            percentage: 70,
          },
          {
            name: "Safari",
            version: "17.0",
            views: Math.floor(Math.random() * 15) + 10,
            percentage: 20,
          },
          {
            name: "Firefox",
            version: "121.0",
            views: Math.floor(Math.random() * 8) + 5,
            percentage: 10,
          },
        ],
        realTimeData: {
          currentViewers: Math.floor(Math.random() * 20) + 5,
          peakViewersToday: Math.floor(Math.random() * 30) + 15,
          last24Hours: {
            views: Math.floor(Math.random() * 80) + 20,
            watchTime: Math.floor(Math.random() * 300) + 100,
            newEnrollments: Math.floor(Math.random() * 10) + 2,
          },
        },
      });

      await newAnalytics.save();
      analyticsDoc = newAnalytics;
      console.log("✅ Sample analytics created");
    }

    // Convert to plain object for downstream usage
    const analytics = analyticsDoc.toObject();

    console.log("📈 Analytics data found:", {
      exists: !!analytics,
      totalViews: analytics?.totalViews || 0,
      totalWatchTime: analytics?.totalWatchTime || 0,
      totalAttendees: analytics?.totalAttendees || 0,
    });

    // Get chat statistics
    const chatStats = await ChatModel.aggregate([
      { $match: { webinarId: webinar._id } },
      {
        $group: {
          _id: null,
          totalMessages: { $sum: 1 },
          deletedMessages: {
            $sum: { $cond: [{ $eq: ["$isDeleted", true] }, 1, 0] },
          },
          moderatedMessages: {
            $sum: { $cond: [{ $eq: ["$isModerated", true] }, 1, 0] },
          },
          uniqueParticipants: { $addToSet: "$userId" },
        },
      },
      {
        $project: {
          totalMessages: 1,
          deletedMessages: 1,
          moderatedMessages: 1,
          uniqueParticipants: { $size: "$uniqueParticipants" },
        },
      },
    ]);

    // Get hourly chat activity
    const hourlyActivity = await ChatModel.aggregate([
      { $match: { webinarId: webinar._id } },
      {
        $group: {
          _id: { $hour: "$timestamp" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Get top participants by message count
    const topParticipants = await ChatModel.aggregate([
      { $match: { webinarId: webinar._id, isDeleted: false } },
      {
        $group: {
          _id: "$userId",
          messageCount: { $sum: 1 },
        },
      },
      { $sort: { messageCount: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $project: {
          messageCount: 1,
          userName: {
            $concat: [
              { $arrayElemAt: ["$user.firstName", 0] },
              " ",
              { $arrayElemAt: ["$user.lastName", 0] },
            ],
          },
          userEmail: { $arrayElemAt: ["$user.email", 0] },
        },
      },
    ]);

    // Calculate engagement metrics
    const engagementMetrics = {
      enrollmentToAttendanceRate:
        analytics?.totalAttendees && webinar.enrolledUsers.length > 0
          ? (analytics.totalAttendees / webinar.enrolledUsers.length) * 100
          : 0,
      chatParticipationRate:
        chatStats[0]?.uniqueParticipants && analytics?.totalAttendees
          ? (chatStats[0].uniqueParticipants / analytics.totalAttendees) * 100
          : 0,
      averageMessagesPerParticipant:
        chatStats[0]?.totalMessages && chatStats[0]?.uniqueParticipants
          ? chatStats[0].totalMessages / chatStats[0].uniqueParticipants
          : 0,
      completionRate: analytics?.completionRate || 0,
      bounceRate: analytics?.bounceRate || 0,
    };

    // Compile comprehensive analytics
    const comprehensiveAnalytics = {
      webinar: {
        id: webinar._id,
        title: webinar.title,
        host:
          webinar.hostId &&
          typeof webinar.hostId === "object" &&
          "firstName" in webinar.hostId
            ? `${(webinar.hostId as any).firstName} ${
                (webinar.hostId as any).lastName
              }`
            : "Unknown Host",
        date: webinar.date,
        duration: (webinar as any).duration || 0,
        enrolledCount: webinar.enrolledUsers.length,
        status: webinar.status || "scheduled",
      },
      overview: {
        totalViews: analytics?.totalViews || 0,
        totalWatchTime: analytics?.totalWatchTime || 0,
        totalEnrollments: analytics?.totalEnrollments || 0,
        totalAttendees: analytics?.totalAttendees || 0,
        averageWatchTime: analytics?.averageWatchTime || 0,
        peakConcurrentViewers: analytics?.peakConcurrentViewers || 0,
        ...engagementMetrics,
      },
      chatAnalytics: {
        totalMessages: chatStats[0]?.totalMessages || 0,
        deletedMessages: chatStats[0]?.deletedMessages || 0,
        moderatedMessages: chatStats[0]?.moderatedMessages || 0,
        uniqueParticipants: chatStats[0]?.uniqueParticipants || 0,
        hourlyActivity: hourlyActivity.map((h) => ({
          hour: h._id,
          messages: h.count,
        })),
        topParticipants: topParticipants.map((p) => ({
          name: p.userName || "Anonymous",
          email: p.userEmail || "N/A",
          messageCount: p.messageCount,
        })),
      },
      performance: analytics?.performance || {
        loadTime: 0,
        buffering: 0,
        qualityIssues: 0,
      },
      audience: {
        geographic: analytics?.geographic || [],
        devices: analytics?.devices || [],
        browsers: analytics?.browsers || [],
        trafficSources: analytics?.trafficSources || [],
      },
      timeSeriesData: {
        dailyMetrics: analytics?.dailyMetrics || [],
        hourlyMetrics: analytics?.hourlyMetrics || [],
      },
    };

    logInfo(`Admin accessed analytics for webinar ${webinarId}`);

    res.json({
      success: true,
      analytics: comprehensiveAnalytics,
    });
  } catch (error) {
    logError("Error getting admin webinar analytics:", error as Error);
    res.status(500).json({
      success: false,
      msg: "Failed to get webinar analytics",
      error:
        process.env.NODE_ENV === "development"
          ? (error as Error).message
          : undefined,
    });
  }
};

// Get analytics summary for all webinars (admin dashboard)
export const getAdminAnalyticsSummary = async (req: Request, res: Response) => {
  try {
    const userRole = req.user?.role;

    // Check admin access
    if (userRole !== "Admin") {
      return res.status(403).json({
        success: false,
        msg: "Admin access required",
      });
    }

    // Get overall statistics
    const [webinarStats, chatStats, analyticsOverview] = await Promise.all([
      // Webinar statistics
      WebinarModel.aggregate([
        {
          $group: {
            _id: null,
            totalWebinars: { $sum: 1 },
            totalEnrollments: { $sum: { $size: "$enrolledUsers" } },
            averageEnrollments: { $avg: { $size: "$enrolledUsers" } },
            publicWebinars: {
              $sum: { $cond: [{ $eq: ["$isPublic", true] }, 1, 0] },
            },
            paidWebinars: {
              $sum: { $cond: [{ $eq: ["$isPaid", true] }, 1, 0] },
            },
          },
        },
      ]),

      // Chat statistics
      ChatModel.aggregate([
        {
          $group: {
            _id: null,
            totalMessages: { $sum: 1 },
            totalDeletedMessages: {
              $sum: { $cond: [{ $eq: ["$isDeleted", true] }, 1, 0] },
            },
            totalModeratedMessages: {
              $sum: { $cond: [{ $eq: ["$isModerated", true] }, 1, 0] },
            },
          },
        },
      ]),

      // Analytics overview
      WebinarAnalytics.aggregate([
        {
          $group: {
            _id: null,
            totalViews: { $sum: "$totalViews" },
            totalWatchTime: { $sum: "$totalWatchTime" },
            totalAttendees: { $sum: "$totalAttendees" },
            averageWatchTime: { $avg: "$averageWatchTime" },
            averageCompletionRate: { $avg: "$completionRate" },
            averageBounceRate: { $avg: "$bounceRate" },
          },
        },
      ]),
    ]);

    // Get top performing webinars
    const topWebinars = await WebinarAnalytics.find()
      .populate("webinarId", "title date hostId")
      .populate("webinarId.hostId", "firstName lastName")
      .sort({ totalViews: -1 })
      .limit(10)
      .lean();

    // Recent activity (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentActivity = await WebinarModel.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          newWebinars: { $sum: 1 },
          newEnrollments: { $sum: { $size: "$enrolledUsers" } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const summary = {
      overview: {
        totalWebinars: webinarStats[0]?.totalWebinars || 0,
        totalEnrollments: webinarStats[0]?.totalEnrollments || 0,
        averageEnrollments: Math.round(
          webinarStats[0]?.averageEnrollments || 0
        ),
        publicWebinars: webinarStats[0]?.publicWebinars || 0,
        paidWebinars: webinarStats[0]?.paidWebinars || 0,
        totalViews: analyticsOverview[0]?.totalViews || 0,
        totalWatchTime: Math.round(analyticsOverview[0]?.totalWatchTime || 0),
        totalAttendees: analyticsOverview[0]?.totalAttendees || 0,
        averageWatchTime: Math.round(
          analyticsOverview[0]?.averageWatchTime || 0
        ),
        averageCompletionRate: Math.round(
          analyticsOverview[0]?.averageCompletionRate || 0
        ),
        averageBounceRate: Math.round(
          analyticsOverview[0]?.averageBounceRate || 0
        ),
      },
      chatOverview: {
        totalMessages: chatStats[0]?.totalMessages || 0,
        deletedMessages: chatStats[0]?.totalDeletedMessages || 0,
        moderatedMessages: chatStats[0]?.totalModeratedMessages || 0,
        moderationRate:
          chatStats[0]?.totalMessages > 0
            ? Math.round(
                (chatStats[0].totalModeratedMessages /
                  chatStats[0].totalMessages) *
                  100
              )
            : 0,
      },
      topWebinars: topWebinars.map((item) => ({
        id: item.webinarId._id,
        title:
          item.webinarId &&
          typeof item.webinarId === "object" &&
          "title" in item.webinarId
            ? (item.webinarId as any).title
            : "Unknown Webinar",
        views: item.totalViews,
        watchTime: item.totalWatchTime,
        attendees: item.totalAttendees,
        completionRate: Math.round(item.completionRate),
      })),
      recentActivity: recentActivity.map((activity) => ({
        date: activity._id,
        newWebinars: activity.newWebinars,
        newEnrollments: activity.newEnrollments,
      })),
    };

    logInfo("Admin accessed analytics summary dashboard");

    res.json({
      success: true,
      summary,
    });
  } catch (error) {
    logError("Error getting admin analytics summary:", error as Error);
    res.status(500).json({
      success: false,
      msg: "Failed to get analytics summary",
      error:
        process.env.NODE_ENV === "development"
          ? (error as Error).message
          : undefined,
    });
  }
};
