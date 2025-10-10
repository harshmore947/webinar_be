import { Request, Response } from "express";
import { Types } from "mongoose";
import WebinarModel from "../models/Webinar.model";
import {
  uploadMultipleResources,
  deleteResourceFile,
} from "../utils/resourceUploadService";
import {
  uploadCertificateTemplate as uploadCertToCloudinary,
  uploadWebinarThumbnail as uploadThumbToCloudinary,
} from "../utils/cloudinaryService";
import { logError, logInfo } from "../utils/logger";

/**
 * Upload resources for a webinar
 */
export const uploadWebinarResources = async (req: Request, res: Response) => {
  try {
    const { webinarId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId) {
      return res.status(401).json({
        success: false,
        msg: "Authentication required",
      });
    }

    if (!Types.ObjectId.isValid(webinarId)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid webinar ID",
      });
    }

    // Check if files were uploaded
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        msg: "No files uploaded",
      });
    }

    // Find webinar
    const webinar = await WebinarModel.findById(webinarId);
    if (!webinar) {
      return res.status(404).json({
        success: false,
        msg: "Webinar not found",
      });
    }

    // Check permissions (Admin, Host, Presenter, or Moderator can upload resources)
    const isHost = webinar.hostId.toString() === userId;
    const isPresenter = webinar.presenters.some(
      (presenterId) => presenterId.toString() === userId
    );
    const isModerator = webinar.moderators.some(
      (moderatorId) => moderatorId.toString() === userId
    );
    const isAdmin = userRole === "Admin";

    if (!isAdmin && !isHost && !isPresenter && !isModerator) {
      return res.status(403).json({
        success: false,
        msg: "Unauthorized: Only Admin, Host, Presenters, or Moderators can upload resources",
      });
    }

    // Prepare files for upload
    const filesToUpload = files.map((file) => ({
      buffer: file.buffer,
      name: file.originalname,
      type: file.mimetype,
      size: file.size,
    }));

    // Upload files to Cloudinary
    const uploadResults = await uploadMultipleResources(
      filesToUpload,
      webinarId
    );

    // Filter successful uploads
    const successfulUploads = uploadResults.filter(
      (result) => result.success && result.data
    );
    const failedUploads = uploadResults.filter((result) => !result.success);

    if (successfulUploads.length === 0) {
      return res.status(400).json({
        success: false,
        msg: "All file uploads failed",
        errors: failedUploads.map((result) => result.error),
      });
    }

    // Add successful uploads to webinar resources
    const newResources = successfulUploads.map((result) => result.data!);
    webinar.resources.push(...newResources);
    await webinar.save();

    logInfo(
      `${successfulUploads.length} resources uploaded for webinar ${webinarId}`
    );

    res.json({
      success: true,
      msg: `${successfulUploads.length} resources uploaded successfully`,
      data: {
        uploaded: successfulUploads.length,
        failed: failedUploads.length,
        resources: newResources,
        errors: failedUploads.map((result) => result.error),
      },
    });
  } catch (error) {
    logError("Error uploading webinar resources:", error as Error);
    res.status(500).json({
      success: false,
      msg: "Failed to upload resources",
    });
  }
};

/**
 * Delete a resource from a webinar
 */
export const deleteWebinarResource = async (req: Request, res: Response) => {
  try {
    const { webinarId, resourceId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId) {
      return res.status(401).json({
        success: false,
        msg: "Authentication required",
      });
    }

    if (!Types.ObjectId.isValid(webinarId)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid webinar ID",
      });
    }

    // Find webinar
    const webinar = await WebinarModel.findById(webinarId);
    if (!webinar) {
      return res.status(404).json({
        success: false,
        msg: "Webinar not found",
      });
    }

    // Check permissions
    const isHost = webinar.hostId.toString() === userId;
    const isPresenter = webinar.presenters.some(
      (presenterId) => presenterId.toString() === userId
    );
    const isModerator = webinar.moderators.some(
      (moderatorId) => moderatorId.toString() === userId
    );
    const isAdmin = userRole === "Admin";

    if (!isAdmin && !isHost && !isPresenter && !isModerator) {
      return res.status(403).json({
        success: false,
        msg: "Unauthorized: Only Admin, Host, Presenters, or Moderators can delete resources",
      });
    }

    // Find the resource to delete
    const resourceIndex = webinar.resources.findIndex(
      (resource: any) => resource._id.toString() === resourceId
    );

    if (resourceIndex === -1) {
      return res.status(404).json({
        success: false,
        msg: "Resource not found",
      });
    }

    const resource = webinar.resources[resourceIndex] as any;

    // Delete from Cloudinary
    const resourceType = resource.type === "pdf" ? "raw" : "image";
    const deleted = await deleteResourceFile(resource.publicId, resourceType);

    if (!deleted) {
      logError(
        `Failed to delete resource from Cloudinary: ${resource.publicId}`
      );
      // Continue with database deletion even if Cloudinary deletion fails
    }

    // Remove from webinar resources
    webinar.resources.splice(resourceIndex, 1);
    await webinar.save();

    logInfo(`Resource deleted from webinar ${webinarId}: ${resource.name}`);

    res.json({
      success: true,
      msg: "Resource deleted successfully",
    });
  } catch (error) {
    logError("Error deleting webinar resource:", error as Error);
    res.status(500).json({
      success: false,
      msg: "Failed to delete resource",
    });
  }
};

/**
 * Get resources for a webinar
 */
export const getWebinarResources = async (req: Request, res: Response) => {
  try {
    const { webinarId } = req.params;

    if (!Types.ObjectId.isValid(webinarId)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid webinar ID",
      });
    }

    // Find webinar
    const webinar = await WebinarModel.findById(webinarId).select("resources");
    if (!webinar) {
      return res.status(404).json({
        success: false,
        msg: "Webinar not found",
      });
    }

    res.json({
      success: true,
      data: {
        resources: webinar.resources,
      },
    });
  } catch (error) {
    logError("Error fetching webinar resources:", error as Error);
    res.status(500).json({
      success: false,
      msg: "Failed to fetch resources",
    });
  }
};

/**
 * Upload certificate template to Cloudinary
 */
export const uploadCertificateTemplate = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const { webinarId } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        msg: "Authentication required",
      });
    }

    // Check if file was uploaded
    const file = req.file as Express.Multer.File;
    if (!file) {
      return res.status(400).json({
        success: false,
        msg: "No certificate template file uploaded",
      });
    }

    // Validate webinar ID if provided
    if (webinarId && !Types.ObjectId.isValid(webinarId)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid webinar ID",
      });
    }

    // If webinarId is provided, check permissions
    if (webinarId) {
      const webinar = await WebinarModel.findById(webinarId);
      if (!webinar) {
        return res.status(404).json({
          success: false,
          msg: "Webinar not found",
        });
      }

      // Check permissions (Admin, Host, or Presenter can upload certificate template)
      const isHost = webinar.hostId.toString() === userId;
      const isPresenter = webinar.presenters.some(
        (presenterId) => presenterId.toString() === userId
      );
      const isAdmin = userRole === "Admin";

      if (!isAdmin && !isHost && !isPresenter) {
        return res.status(403).json({
          success: false,
          msg: "Unauthorized: Only Admin, Host, or Presenters can upload certificate templates",
        });
      }
    }

    // Upload to Cloudinary
    const uploadResult = await uploadCertToCloudinary(
      file.buffer,
      webinarId || `temp_${Date.now()}`,
      file.originalname
    );

    if (!uploadResult.success) {
      return res.status(400).json({
        success: false,
        msg: "Failed to upload certificate template to Cloudinary",
        error: uploadResult.error,
      });
    }

    logInfo(`Certificate template uploaded to Cloudinary: ${uploadResult.url}`);

    res.json({
      success: true,
      msg: "Certificate template uploaded successfully",
      url: uploadResult.url,
      publicId: uploadResult.publicId,
    });
  } catch (error) {
    logError("Error uploading certificate template:", error as Error);
    res.status(500).json({
      success: false,
      msg: "Failed to upload certificate template",
    });
  }
};

/**
 * Upload webinar thumbnail to Cloudinary and optionally attach to webinar
 */
export const uploadWebinarThumbnail = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const { webinarId } = req.body;

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, msg: "Authentication required" });
    }

    const file = req.file as Express.Multer.File;
    if (!file) {
      return res
        .status(400)
        .json({ success: false, msg: "No thumbnail file uploaded" });
    }

    // If webinarId provided, ensure permissions
    let webinar: any = null;
    if (webinarId) {
      if (!Types.ObjectId.isValid(webinarId)) {
        return res
          .status(400)
          .json({ success: false, msg: "Invalid webinar ID" });
      }
      webinar = await WebinarModel.findById(webinarId);
      if (!webinar) {
        return res
          .status(404)
          .json({ success: false, msg: "Webinar not found" });
      }
      const isHost = webinar.hostId.toString() === userId;
      const isPresenter = webinar.presenters.some(
        (p: any) => p.toString() === userId
      );
      const isAdmin = userRole === "Admin";
      if (!isAdmin && !isHost && !isPresenter) {
        return res.status(403).json({ success: false, msg: "Unauthorized" });
      }
    }

    const uploadResult = await uploadThumbToCloudinary(
      file.buffer,
      webinarId || `temp_${Date.now()}`,
      file.originalname
    );
    if (!uploadResult.success) {
      return res
        .status(400)
        .json({
          success: false,
          msg: "Failed to upload thumbnail",
          error: uploadResult.error,
        });
    }

    if (webinar) {
      webinar.thumbnailUrl = uploadResult.url;
      webinar.thumbnailPublicId = uploadResult.publicId || "";
      await webinar.save();
    }

    logInfo(`Thumbnail uploaded to Cloudinary: ${uploadResult.url}`);
    return res.json({
      success: true,
      url: uploadResult.url,
      publicId: uploadResult.publicId,
    });
  } catch (error) {
    logError("Error uploading webinar thumbnail:", error as Error);
    return res
      .status(500)
      .json({ success: false, msg: "Failed to upload thumbnail" });
  }
};
