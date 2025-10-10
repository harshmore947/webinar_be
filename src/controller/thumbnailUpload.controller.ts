import { Request, Response } from "express";
import { v2 as cloudinary } from "cloudinary";
import { logError, logInfo } from "../utils/logger";

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "do9j5natz",
  api_key: process.env.CLOUDINARY_API_KEY || "521592873337488",
  api_secret:
    process.env.CLOUDINARY_API_SECRET || "mNhzs99m7zalk12n8ReMgVREW0Y",
});

/**
 * Upload webinar thumbnail to Cloudinary
 */
export const uploadThumbnail = async (req: Request, res: Response) => {
  try {
    const file = req.file as Express.Multer.File;

    if (!file) {
      return res.status(400).json({
        success: false,
        msg: "No thumbnail file provided",
      });
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png"];
    if (!allowedTypes.includes(file.mimetype)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid file type. Only JPEG and PNG images are allowed.",
      });
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return res.status(400).json({
        success: false,
        msg: "File size too large. Maximum size is 5MB.",
      });
    }

    // Upload to Cloudinary
    const uploadOptions = {
      folder: "webinar-thumbnails",
      public_id: `thumbnail_${Date.now()}`,
      resource_type: "image" as const,
      transformation: [
        { width: 1280, height: 720, crop: "fill", quality: "auto:good" },
        { format: "jpg" },
      ],
      use_filename: true,
      unique_filename: true,
      overwrite: false,
    };

    const result = await cloudinary.uploader.upload(
      `data:${file.mimetype};base64,${file.buffer.toString("base64")}`,
      uploadOptions
    );

    logInfo(`Thumbnail uploaded to Cloudinary: ${result.secure_url}`);

    return res.status(200).json({
      success: true,
      msg: "Thumbnail uploaded successfully",
      data: {
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
        size: file.size,
      },
    });
  } catch (error) {
    logError("Error uploading thumbnail to Cloudinary:", error as Error);
    return res.status(500).json({
      success: false,
      msg: "Failed to upload thumbnail",
      error:
        process.env.NODE_ENV === "development"
          ? (error as Error).message
          : undefined,
    });
  }
};

/**
 * Delete webinar thumbnail from Cloudinary
 */
export const deleteThumbnail = async (req: Request, res: Response) => {
  try {
    const { publicId } = req.body;

    if (!publicId) {
      return res.status(400).json({
        success: false,
        msg: "Public ID is required",
      });
    }

    // Delete from Cloudinary
    const result = await cloudinary.uploader.destroy(publicId);

    if (result.result === "ok") {
      logInfo(`Thumbnail deleted from Cloudinary: ${publicId}`);
      return res.status(200).json({
        success: true,
        msg: "Thumbnail deleted successfully",
      });
    } else {
      return res.status(404).json({
        success: false,
        msg: "Thumbnail not found or already deleted",
      });
    }
  } catch (error) {
    logError("Error deleting thumbnail from Cloudinary:", error as Error);
    return res.status(500).json({
      success: false,
      msg: "Failed to delete thumbnail",
      error:
        process.env.NODE_ENV === "development"
          ? (error as Error).message
          : undefined,
    });
  }
};
