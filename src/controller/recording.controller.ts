import { Request, Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import Webinar from "../models/Webinar.model";
import { v2 as cloudinary } from "cloudinary";

// Upload webinar recording
export const uploadRecording = async (req: AuthRequest, res: Response) => {
  try {
    const { webinarId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({ message: "No recording file provided" });
    }

    // Find webinar and check ownership
    const webinar = await Webinar.findById(webinarId);
    if (!webinar) {
      return res.status(404).json({ message: "Webinar not found" });
    }

    if (webinar.hostId.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ message: "Only host can upload recordings" });
    }

    // Delete old recording if exists
    if (webinar.recordingPublicId) {
      try {
        await cloudinary.uploader.destroy(webinar.recordingPublicId, {
          resource_type: "video",
        });
      } catch (error) {
        console.error("Error deleting old recording:", error);
      }
    }

    // Upload to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(req.file.path, {
      resource_type: "video",
      folder: "webinar-recordings",
      transformation: [{ quality: "auto", fetch_format: "auto" }],
    });

    // Update webinar with recording details
    webinar.isRecorded = true;
    webinar.recordingUrl = uploadResult.secure_url;
    webinar.recordingPublicId = uploadResult.public_id;
    webinar.recordingSize = uploadResult.bytes;
    webinar.recordingDuration = uploadResult.duration
      ? Math.round(uploadResult.duration / 60)
      : undefined; // Convert to minutes

    await webinar.save();

    res.status(200).json({
      message: "Recording uploaded successfully",
      recording: {
        url: webinar.recordingUrl,
        duration: webinar.recordingDuration,
        size: webinar.recordingSize,
      },
    });
  } catch (error) {
    console.error("Error uploading recording:", error);
    res.status(500).json({ message: "Failed to upload recording" });
  }
};

// Delete webinar recording
export const deleteRecording = async (req: AuthRequest, res: Response) => {
  try {
    const { webinarId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const webinar = await Webinar.findById(webinarId);
    if (!webinar) {
      return res.status(404).json({ message: "Webinar not found" });
    }

    if (webinar.hostId.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ message: "Only host can delete recordings" });
    }

    if (!webinar.recordingPublicId) {
      return res.status(404).json({ message: "No recording found" });
    }

    // Delete from Cloudinary
    await cloudinary.uploader.destroy(webinar.recordingPublicId, {
      resource_type: "video",
    });

    // Update webinar
    webinar.isRecorded = false;
    webinar.recordingUrl = undefined;
    webinar.recordingPublicId = undefined;
    webinar.recordingSize = undefined;
    webinar.recordingDuration = undefined;

    await webinar.save();

    res.status(200).json({ message: "Recording deleted successfully" });
  } catch (error) {
    console.error("Error deleting recording:", error);
    res.status(500).json({ message: "Failed to delete recording" });
  }
};

// Get recording (check access)
export const getRecording = async (req: AuthRequest, res: Response) => {
  try {
    const { webinarId } = req.params;
    const userId = req.user?.userId;

    const webinar = await Webinar.findById(webinarId);
    if (!webinar) {
      return res.status(404).json({ message: "Webinar not found" });
    }

    if (!webinar.isRecorded || !webinar.recordingUrl) {
      return res.status(404).json({ message: "No recording available" });
    }

    // Check access - enrolled users or host
    const isEnrolled = webinar.enrolledUsers.some(
      (id) => id.toString() === userId?.toString()
    );
    const isHost = webinar.hostId.toString() === userId?.toString();

    if (!isEnrolled && !isHost) {
      return res
        .status(403)
        .json({
          message: "Access denied. Please enroll in the webinar first.",
        });
    }

    // Increment view count
    webinar.viewCount = (webinar.viewCount || 0) + 1;
    await webinar.save();

    res.status(200).json({
      recording: {
        url: webinar.recordingUrl,
        duration: webinar.recordingDuration,
        viewCount: webinar.viewCount,
      },
    });
  } catch (error) {
    console.error("Error getting recording:", error);
    res.status(500).json({ message: "Failed to get recording" });
  }
};

// Update recording settings
export const updateRecordingSettings = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { webinarId } = req.params;
    const { allowReplayAccess, replayPrice } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const webinar = await Webinar.findById(webinarId);
    if (!webinar) {
      return res.status(404).json({ message: "Webinar not found" });
    }

    if (webinar.hostId.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ message: "Only host can update recording settings" });
    }

    if (allowReplayAccess !== undefined) {
      webinar.allowReplayAccess = allowReplayAccess;
    }

    if (replayPrice !== undefined) {
      webinar.replayPrice = replayPrice;
    }

    await webinar.save();

    res.status(200).json({
      message: "Recording settings updated successfully",
      settings: {
        allowReplayAccess: webinar.allowReplayAccess,
        replayPrice: webinar.replayPrice,
      },
    });
  } catch (error) {
    console.error("Error updating recording settings:", error);
    res.status(500).json({ message: "Failed to update recording settings" });
  }
};
