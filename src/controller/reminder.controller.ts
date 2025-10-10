import { Request, Response } from "express";
import ReminderModel from "../models/Reminder.model";
import UserModel from "../models/User.model";
import WebinarModel from "../models/Webinar.model";
import { logError, logInfo } from "../utils/logger";

export const createReminder = async (req: Request, res: Response) => {
  try {
    const { webinarId, reminderTime, message } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, msg: "Unauthorized" });
    }

    // Validate webinar exists and user is enrolled
    const webinar = await WebinarModel.findById(webinarId);
    if (!webinar) {
      return res.status(404).json({ success: false, msg: "Webinar not found" });
    }

    // Check if user is enrolled in the webinar
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, msg: "User not found" });
    }

    if (
      !user.webinars.includes(webinarId) &&
      webinar.hostId.toString() !== userId
    ) {
      return res.status(403).json({
        success: false,
        msg: "You must be enrolled in this webinar to set a reminder",
      });
    }

    // Validate reminder time is before webinar start time
    const webinarDateTime = new Date(webinar.date);
    const reminderDateTime = new Date(reminderTime);

    if (reminderDateTime >= webinarDateTime) {
      return res.status(400).json({
        success: false,
        msg: "Reminder time must be before webinar start time",
      });
    }

    if (reminderDateTime <= new Date()) {
      return res.status(400).json({
        success: false,
        msg: "Reminder time must be in the future",
      });
    }

    // Check if reminder already exists for this user and webinar
    const existingReminder = await ReminderModel.findOne({
      userId,
      webinarId,
    });

    if (existingReminder) {
      // Update existing reminder
      existingReminder.reminderTime = reminderDateTime;
      existingReminder.message = message;
      existingReminder.isEmailSent = false;
      await existingReminder.save();

      // Reminder updated

      return res.json({
        success: true,
        msg: "Reminder updated successfully",
        data: existingReminder,
      });
    } else {
      // Create new reminder
      const reminder = new ReminderModel({
        userId,
        webinarId,
        reminderTime: reminderDateTime,
        message,
      });

      await reminder.save();

      logInfo(
        `Reminder created for user: ${user.email}, webinar: ${webinarId}`
      );

      return res.status(201).json({
        success: true,
        msg: "Reminder created successfully",
        data: reminder,
      });
    }
  } catch (error) {
    logError(`Create reminder error: ${(error as Error).message}`);
    res.status(500).json({ success: false, msg: "Internal server error" });
  }
};

export const getUserReminders = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, msg: "Unauthorized" });
    }

    const reminders = await ReminderModel.find({ userId })
      .populate("webinarId", "title date description category")
      .sort({ reminderTime: 1 });

    res.json({
      success: true,
      data: reminders,
    });
  } catch (error) {
    logError(`Get user reminders error: ${(error as Error).message}`);
    res.status(500).json({ success: false, msg: "Internal server error" });
  }
};

export const getWebinarReminder = async (req: Request, res: Response) => {
  try {
    const { webinarId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, msg: "Unauthorized" });
    }

    const reminder = await ReminderModel.findOne({
      userId,
      webinarId,
    }).populate("webinarId", "title date description category");

    res.json({
      success: true,
      data: reminder,
    });
  } catch (error) {
    logError(
      `Get webinar reminder error: ${(error as Error).message} for webinar: ${req.params.webinarId}`
    );
    res.status(500).json({ success: false, msg: "Internal server error" });
  }
};

export const deleteReminder = async (req: Request, res: Response) => {
  try {
    const { webinarId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, msg: "Unauthorized" });
    }

    const reminder = await ReminderModel.findOneAndDelete({
      userId,
      webinarId,
    });

    if (!reminder) {
      return res
        .status(404)
        .json({ success: false, msg: "Reminder not found" });
    }

    logInfo(`Reminder deleted for user: ${userId}, webinar: ${webinarId}`);

    res.json({
      success: true,
      msg: "Reminder deleted successfully",
    });
  } catch (error) {
    logError(
      `Delete reminder error: ${(error as Error).message} for webinar: ${req.params.webinarId}`
    );
    res.status(500).json({ success: false, msg: "Internal server error" });
  }
};
