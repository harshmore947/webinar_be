import { Request, Response } from "express";
import { Types } from "mongoose";
import WebinarModel from "../models/Webinar.model";
import UserModel from "../models/User.model";
import { logInfo, logError } from "../utils/logger";
import { sanitizeHtml } from "../utils/sanitizeHtml";

/**
 * Enhanced Admin Webinar Controller
 * Provides comprehensive webinar management for administrators
 */

// Get webinar details for editing (admin only)
export const getWebinarForEdit = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    // Validate admin access
    if (userRole !== "Admin") {
      return res.status(403).json({
        success: false,
        msg: "Admin access required",
      });
    }

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid webinar ID",
      });
    }

    // Fetch webinar with all populated fields
    const webinar = await WebinarModel.findById(id)
      .populate("hostId", "firstName lastName email")
      .populate("presenters", "firstName lastName email")
      .populate("moderators", "firstName lastName email")
      .populate("enrolledUsers", "firstName lastName email");

    if (!webinar) {
      return res.status(404).json({
        success: false,
        msg: "Webinar not found",
      });
    }

    // Get additional statistics
    const stats = {
      totalEnrolled: webinar.enrolledUsers.length,
      totalPresenters: webinar.presenters.length,
      totalModerators: webinar.moderators.length,
      totalResources: webinar.resources.length,
    };

    logInfo(`Admin ${userId} accessed webinar ${id} for editing`);

    res.json({
      success: true,
      webinar: {
        ...webinar.toObject(),
        stats,
      },
    });
  } catch (error) {
    logError(`Error fetching webinar for edit: ${(error as Error).message}`);
    res.status(500).json({
      success: false,
      msg: "Failed to fetch webinar details",
    });
  }
};

// Update webinar (admin only) with enhanced validation
export const updateWebinarAdmin = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const updateData = req.body;

    // Validate admin access
    if (userRole !== "Admin") {
      return res.status(403).json({
        success: false,
        msg: "Admin access required",
      });
    }

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid webinar ID",
      });
    }

    const webinar = await WebinarModel.findById(id);

    if (!webinar) {
      return res.status(404).json({
        success: false,
        msg: "Webinar not found",
      });
    }

    // Validate and process update data
    const processedData = await processWebinarUpdateData(updateData);

    // Validate presenters and moderators exist
    if (processedData.presenters && processedData.presenters.length > 0) {
      const validPresenters = await UserModel.find({
        _id: { $in: processedData.presenters },
      });
      if (validPresenters.length !== processedData.presenters.length) {
        return res.status(400).json({
          success: false,
          msg: "One or more presenters not found",
        });
      }
    }

    if (processedData.moderators && processedData.moderators.length > 0) {
      const validModerators = await UserModel.find({
        _id: { $in: processedData.moderators },
      });
      if (validModerators.length !== processedData.moderators.length) {
        return res.status(400).json({
          success: false,
          msg: "One or more moderators not found",
        });
      }
    }

    // Update webinar
    Object.assign(webinar, processedData);
    await webinar.save();

    // Fetch updated webinar with populated fields
    const updatedWebinar = await WebinarModel.findById(id)
      .populate("hostId", "firstName lastName email")
      .populate("presenters", "firstName lastName email")
      .populate("moderators", "firstName lastName email");

    logInfo(`Admin ${userId} updated webinar ${id}`);

    res.json({
      success: true,
      msg: "Webinar updated successfully",
      webinar: updatedWebinar,
    });
  } catch (error) {
    logError(`Error updating webinar: ${(error as Error).message}`);
    res.status(500).json({
      success: false,
      msg: "Failed to update webinar",
      error:
        process.env.NODE_ENV === "development"
          ? (error as Error).message
          : undefined,
    });
  }
};

// Process and validate webinar update data
async function processWebinarUpdateData(data: any) {
  const processed = { ...data };

  // Process date
  if (processed.date) {
    try {
      const dateObj = new Date(processed.date);
      if (!isNaN(dateObj.getTime())) {
        processed.date = dateObj.toISOString().split("T")[0];
      }
    } catch (e) {
      throw new Error("Invalid date format");
    }
  }

  // Process time
  if (processed.time) {
    try {
      const timeStr = processed.time.toString();
      if (timeStr.includes(":") && timeStr.split(":").length >= 2) {
        const [hours, minutes] = timeStr.split(":");
        processed.time = `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}`;
      }
    } catch (e) {
      throw new Error("Invalid time format");
    }
  }

  // Sanitize HTML content
  if (processed.agenda) {
    processed.agenda = sanitizeHtml(processed.agenda);
  }

  if (processed.description) {
    processed.description = sanitizeHtml(processed.description);
  }

  // Validate maxParticipants
  if (processed.maxParticipants) {
    const maxParticipants = parseInt(processed.maxParticipants);
    if (isNaN(maxParticipants) || maxParticipants < 1) {
      throw new Error("Max participants must be a positive number");
    }
    processed.maxParticipants = maxParticipants.toString();
  }

  // Validate price for paid webinars
  if (processed.isPaid && processed.price) {
    const price = parseFloat(processed.price);
    if (isNaN(price) || price <= 0) {
      throw new Error("Price must be a positive number for paid webinars");
    }
    processed.price = price;
  }

  return processed;
}

// Get webinar editing history (admin only)
export const getWebinarEditHistory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userRole = req.user?.role;

    if (userRole !== "Admin") {
      return res.status(403).json({
        success: false,
        msg: "Admin access required",
      });
    }

    // This would require implementing an audit log system
    // For now, return basic info
    const webinar = await WebinarModel.findById(id).select(
      "updatedAt createdAt"
    );

    if (!webinar) {
      return res.status(404).json({
        success: false,
        msg: "Webinar not found",
      });
    }

    res.json({
      success: true,
      history: {
        created: webinar.createdAt,
        lastUpdated: webinar.updatedAt,
      },
    });
  } catch (error) {
    logError(`Error fetching edit history: ${(error as Error).message}`);
    res.status(500).json({
      success: false,
      msg: "Failed to fetch edit history",
    });
  }
};

// Delete webinar (admin only)
export const deleteWebinarAdmin = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (userRole !== "Admin") {
      return res.status(403).json({
        success: false,
        msg: "Admin access required",
      });
    }

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid webinar ID",
      });
    }

    const webinar = await WebinarModel.findById(id);

    if (!webinar) {
      return res.status(404).json({
        success: false,
        msg: "Webinar not found",
      });
    }

    await WebinarModel.findByIdAndDelete(id);

    logInfo(`Admin ${userId} deleted webinar ${id} (${webinar.title})`);

    res.json({
      success: true,
      msg: "Webinar deleted successfully",
    });
  } catch (error) {
    logError(`Error deleting webinar: ${(error as Error).message}`);
    res.status(500).json({
      success: false,
      msg: "Failed to delete webinar",
    });
  }
};
