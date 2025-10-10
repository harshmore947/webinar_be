import { Request, Response } from "express";
import NotificationModel from "../models/Notification.model";
import { Types } from "mongoose";

// Get notifications with filtering
export const getNotifications = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    // Query parameters
    const isRead = req.query.isRead;

    // Build filter query
    let filterQuery: any = { userId: new Types.ObjectId(userId) };

    if (isRead !== undefined) {
      filterQuery.isRead = isRead === "true";
    }

    // Get all notifications
    const notifications = await NotificationModel.find(filterQuery)
      .sort({ createdAt: -1 })
      .lean(); // Use lean() for better performance

    // Get unread count
    const unreadCount = await NotificationModel.countDocuments({
      userId: new Types.ObjectId(userId),
      isRead: false,
    });

    res.json({
      success: true,
      notifications,
      unreadCount,
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to fetch notifications",
    });
  }
};

// Mark single notification as read
export const markNotificationRead = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    // Update notification directly
    const notification = await NotificationModel.findOneAndUpdate(
      {
        _id: id,
        userId: new Types.ObjectId(userId),
      },
      {
        isRead: true,
        readAt: new Date(),
      },
      { new: true }
    );

    res.json({
      success: true,
      msg: "Notification marked as read",
      notification,
    });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to mark notification as read",
    });
  }
};

// Mark all notifications as read
export const markAllNotificationsRead = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    const result = await NotificationModel.updateMany(
      {
        userId: new Types.ObjectId(userId),
        isRead: false,
      },
      {
        isRead: true,
        readAt: new Date(),
      }
    );

    res.json({
      success: true,
      msg: "All notifications marked as read",
      updatedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to mark all notifications as read",
    });
  }
};

// Delete notification
export const deleteNotification = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const result = await NotificationModel.findOneAndDelete({
      _id: id,
      userId: new Types.ObjectId(userId),
    });

    res.json({
      success: true,
      msg: "Notification deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting notification:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to delete notification",
    });
  }
};

// Delete all read notifications
export const deleteReadNotifications = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    const result = await NotificationModel.deleteMany({
      userId: new Types.ObjectId(userId),
      isRead: true,
    });

    res.json({
      success: true,
      msg: "Read notifications deleted successfully",
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Error deleting read notifications:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to delete read notifications",
    });
  }
};

// Get notification statistics
export const getNotificationStats = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    const stats = await NotificationModel.aggregate([
      { $match: { userId: new Types.ObjectId(userId) } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          unread: {
            $sum: {
              $cond: [{ $eq: ["$isRead", false] }, 1, 0],
            },
          },
          read: {
            $sum: {
              $cond: [{ $eq: ["$isRead", true] }, 1, 0],
            },
          },
        },
      },
    ]);

    const result = stats[0] || { total: 0, unread: 0, read: 0 };

    res.json({
      success: true,
      stats: result,
    });
  } catch (error) {
    console.error("Error fetching notification stats:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to fetch notification statistics",
    });
  }
};

// Bulk mark notifications as read
export const bulkMarkNotificationsRead = async (
  req: Request,
  res: Response
) => {
  try {
    const { notificationIds } = req.body;
    const userId = req.user?.id;

    const result = await NotificationModel.updateMany(
      {
        _id: { $in: notificationIds },
        userId: new Types.ObjectId(userId),
        isRead: false,
      },
      {
        isRead: true,
        readAt: new Date(),
      }
    );

    res.json({
      success: true,
      msg: "Notifications marked as read",
      updatedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error bulk marking notifications as read:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to mark notifications as read",
    });
  }
};

// Bulk delete notifications
export const bulkDeleteNotifications = async (req: Request, res: Response) => {
  try {
    const { notificationIds } = req.body;
    const userId = req.user?.id;

    const result = await NotificationModel.deleteMany({
      _id: { $in: notificationIds },
      userId: new Types.ObjectId(userId),
    });

    res.json({
      success: true,
      msg: "Notifications deleted successfully",
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Error bulk deleting notifications:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to delete notifications",
    });
  }
};

// Create notification via API (for external use)
export const createNotificationAPI = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { message, link, type = "info", title, sendEmail = false } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        msg: "Authentication required",
      });
    }

    if (!message) {
      return res.status(400).json({
        success: false,
        msg: "Message is required",
      });
    }

    const notification = await createNotification(
      userId,
      message,
      link,
      type,
      title,
      sendEmail
    );

    res.json({
      success: true,
      notification: {
        id: notification._id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        link: notification.link,
        createdAt: notification.createdAt,
        isRead: notification.isRead,
      },
      msg: "Notification created successfully",
    });
  } catch (error) {
    console.error("Error creating notification via API:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to create notification",
    });
  }
};

// Create notification (utility function for internal use)
export const createNotification = async (
  userId: string,
  message: string,
  link?: string,
  type: string = "info",
  title?: string,
  sendEmail: boolean = false
) => {
  try {
    const notification = new NotificationModel({
      userId: new Types.ObjectId(userId),
      title,
      message,
      link,
      type,
    });

    await notification.save();

    // Send email notification if requested
    if (sendEmail) {
      try {
        const UserModel = require("../models/User.model").default;
        const user = await UserModel.findById(userId);

        if (user && user.email) {
          const { sendMail } = require("../utils/mailer");
          const emailSubject = title || "New Notification";
          const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #333;">${emailSubject}</h2>
              <p style="color: #666; font-size: 16px;">${message}</p>
              ${
                link
                  ? `<p><a href="${link}" style="color: #007bff; text-decoration: none;">View Details</a></p>`
                  : ""
              }
              <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
              <p style="color: #999; font-size: 12px;">This is an automated notification from your webinar platform.</p>
            </div>
          `;

          await sendMail({
            to: user.email,
            subject: emailSubject,
            html: emailHtml,
          });

          console.log(`📧 Email notification sent to ${user.email}`);
        }
      } catch (emailError) {
        console.error("Error sending email notification:", emailError);
        // Don't fail the notification creation if email fails
      }
    }

    // Emit real-time notification via Socket.IO
    const { emitNotificationToUser } = require("../utils/socketService");
    await emitNotificationToUser(userId, {
      id: notification._id,
      title: notification.title,
      message: notification.message,
      type: notification.type,
      link: notification.link,
      createdAt: notification.createdAt,
      isRead: notification.isRead,
    });

    return notification;
  } catch (error) {
    console.error("Error creating notification:", error);
    throw error;
  }
};
