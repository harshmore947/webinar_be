import { Request, Response } from "express";
import { Types } from "mongoose";
import WebinarModel from "../models/Webinar.model";
import {
  uploadMultipleResources,
  deleteResourceFile,
} from "../utils/resourceUploadService";
import { logError, logInfo } from "../utils/logger";
import { getSocketInstance } from "../utils/socketService";

/**
 * Upload resources for a webinar with enhanced metadata (V2)
 */
export const uploadWebinarResourcesV2 = async (req: Request, res: Response) => {
  try {
    const { id: webinarId } = req.params;
    const userId = req.user?.id;
    const userName = (req.user as any)?.name || "Unknown";
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

    // Parse metadata from request body
    const metadataArray = req.body.metadata 
      ? (Array.isArray(req.body.metadata) ? req.body.metadata : [req.body.metadata])
      : [];

    // Prepare files for upload
    const filesToUpload = files.map((file, index) => {
      const metadata = metadataArray[index] 
        ? (typeof metadataArray[index] === 'string' ? JSON.parse(metadataArray[index]) : metadataArray[index])
        : {};

      return {
        buffer: file.buffer,
        name: file.originalname,
        type: file.mimetype,
        size: file.size,
        category: metadata.category || "other",
        description: metadata.description || "",
        tags: metadata.tags || [],
        accessLevel: metadata.accessLevel || "enrolled",
      };
    });

    // Upload files to Cloudinary
    const uploadResults = await uploadMultipleResources(
      filesToUpload.map(f => ({
        buffer: f.buffer,
        name: f.name,
        type: f.type,
        size: f.size,
      })),
      webinarId
    );

    // Filter successful uploads and add metadata
    const successfulUploads = uploadResults
      .filter((result) => result.success && result.data)
      .map((result, index) => ({
        ...result.data!,
        description: filesToUpload[index].description,
        category: filesToUpload[index].category,
        tags: filesToUpload[index].tags,
        accessLevel: filesToUpload[index].accessLevel,
        uploadedBy: {
          userId: new Types.ObjectId(userId),
          name: userName,
          role: userRole || "User",
        },
        downloadCount: 0,
        isArchived: false,
      }));

    const failedUploads = uploadResults.filter((result) => !result.success);

    if (successfulUploads.length === 0) {
      return res.status(400).json({
        success: false,
        msg: "All file uploads failed",
        errors: failedUploads.map((result) => result.error),
      });
    }

    // Add successful uploads to webinar resources
    webinar.resources.push(...successfulUploads as any);
    await webinar.save();

    logInfo(
      `${successfulUploads.length} resources uploaded for webinar ${webinarId} (V2)`
    );

    // Emit socket event for real-time update
    const io = getSocketInstance();
    if (io) {
      io.to(`webinar_${webinarId}`).emit("resource_uploaded_v2", {
        success: true,
        webinarId,
        resources: successfulUploads,
        uploadedBy: {
          userId,
          name: userName,
          role: userRole,
        },
        timestamp: new Date().toISOString(),
      });
      logInfo(`Socket event 'resource_uploaded_v2' emitted for webinar ${webinarId}`);
    }

    res.json({
      success: true,
      msg: `${successfulUploads.length} resources uploaded successfully`,
      data: {
        uploaded: successfulUploads.length,
        failed: failedUploads.length,
        resources: successfulUploads,
        errors: failedUploads.map((result) => result.error),
      },
    });
  } catch (error) {
    logError("Error uploading webinar resources V2:", error as Error);
    res.status(500).json({
      success: false,
      msg: "Failed to upload resources",
    });
  }
};

/**
 * Get resources for a webinar with filters and stats (V2)
 */
export const getWebinarResourcesV2 = async (req: Request, res: Response) => {
  try {
    const { id: webinarId } = req.params;
    const { category, type, search, tags } = req.query;

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

    // Filter resources
    let resources = webinar.resources.filter((r: any) => !r.isArchived);

    if (category && category !== "all") {
      resources = resources.filter((r: any) => r.category === category);
    }

    if (type && type !== "all") {
      resources = resources.filter((r: any) => r.type === type);
    }

    if (search) {
      const searchLower = (search as string).toLowerCase();
      resources = resources.filter((r: any) => 
        r.name.toLowerCase().includes(searchLower) ||
        r.description?.toLowerCase().includes(searchLower) ||
        r.tags.some((tag: string) => tag.toLowerCase().includes(searchLower))
      );
    }

    if (tags) {
      const tagArray = (tags as string).split(',');
      resources = resources.filter((r: any) => 
        tagArray.some(tag => r.tags.includes(tag))
      );
    }

    // Calculate stats
    const stats = {
      total: resources.length,
      byCategory: resources.reduce((acc: any, r: any) => {
        acc[r.category] = (acc[r.category] || 0) + 1;
        return acc;
      }, {}),
      byType: resources.reduce((acc: any, r: any) => {
        acc[r.type] = (acc[r.type] || 0) + 1;
        return acc;
      }, {}),
      totalSize: resources.reduce((sum: number, r: any) => sum + r.size, 0),
      totalDownloads: resources.reduce((sum: number, r: any) => sum + (r.downloadCount || 0), 0),
    };

    res.json({
      success: true,
      data: {
        resources,
        stats,
      },
    });
  } catch (error) {
    logError("Error fetching webinar resources V2:", error as Error);
    res.status(500).json({
      success: false,
      msg: "Failed to fetch resources",
    });
  }
};

/**
 * Update resource metadata (V2)
 */
export const updateWebinarResourceV2 = async (req: Request, res: Response) => {
  try {
    const { id: webinarId, resourceId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const { name, description, category, tags, accessLevel } = req.body;

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
        msg: "Unauthorized: Only Admin, Host, Presenters, or Moderators can update resources",
      });
    }

    // Find the resource
    const resourceIndex = webinar.resources.findIndex(
      (resource: any) => resource._id.toString() === resourceId
    );

    if (resourceIndex === -1) {
      return res.status(404).json({
        success: false,
        msg: "Resource not found",
      });
    }

    // Update resource metadata
    const resource = webinar.resources[resourceIndex] as any;
    if (name !== undefined) resource.name = name;
    if (description !== undefined) resource.description = description;
    if (category !== undefined) resource.category = category;
    if (tags !== undefined) resource.tags = tags;
    if (accessLevel !== undefined) resource.accessLevel = accessLevel;

    await webinar.save();

    logInfo(`Resource metadata updated for webinar ${webinarId}: ${resource.name}`);

    // Emit socket event
    const io = getSocketInstance();
    if (io) {
      io.to(`webinar_${webinarId}`).emit("resource_updated_v2", {
        success: true,
        webinarId,
        resource: webinar.resources[resourceIndex],
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      msg: "Resource updated successfully",
      data: webinar.resources[resourceIndex],
    });
  } catch (error) {
    logError("Error updating webinar resource V2:", error as Error);
    res.status(500).json({
      success: false,
      msg: "Failed to update resource",
    });
  }
};

/**
 * Delete a resource from a webinar (V2)
 */
export const deleteWebinarResourceV2 = async (req: Request, res: Response) => {
  try {
    const { id: webinarId, resourceId } = req.params;
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

    // Find the resource
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
    const resourceType: "raw" | "image" | "video" = 
      resource.type === "pdf" ? "raw" : 
      resource.type === "video" ? "video" : 
      "image";
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

    // Emit socket event
    const io = getSocketInstance();
    if (io) {
      io.to(`webinar_${webinarId}`).emit("resource_deleted_v2", {
        success: true,
        webinarId,
        resourceId,
        deletedBy: {
          userId,
          role: userRole,
        },
        timestamp: new Date().toISOString(),
      });
      logInfo(`Socket event 'resource_deleted_v2' emitted for webinar ${webinarId}`);
    }

    res.json({
      success: true,
      msg: "Resource deleted successfully",
    });
  } catch (error) {
    logError("Error deleting webinar resource V2:", error as Error);
    res.status(500).json({
      success: false,
      msg: "Failed to delete resource",
    });
  }
};

/**
 * Bulk operations on resources (V2)
 */
export const bulkResourceOperationsV2 = async (req: Request, res: Response) => {
  try {
    const { id: webinarId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const { action, resourceIds, newValue } = req.body;

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

    if (!action || !resourceIds || !Array.isArray(resourceIds)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid request: action and resourceIds are required",
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
        msg: "Unauthorized",
      });
    }

    let updated = 0;

    switch (action) {
      case "delete":
        // Delete multiple resources
        for (const resourceId of resourceIds) {
          const resourceIndex = webinar.resources.findIndex(
            (r: any) => r._id.toString() === resourceId
          );
          if (resourceIndex !== -1) {
            const resource = webinar.resources[resourceIndex] as any;
            const resourceType: "raw" | "image" | "video" = 
              resource.type === "pdf" ? "raw" : 
              resource.type === "video" ? "video" : 
              "image";
            await deleteResourceFile(resource.publicId, resourceType);
            webinar.resources.splice(resourceIndex, 1);
            updated++;
          }
        }
        break;

      case "archive":
        // Archive multiple resources
        resourceIds.forEach((resourceId) => {
          const resource = webinar.resources.find(
            (r: any) => r._id.toString() === resourceId
          ) as any;
          if (resource) {
            resource.isArchived = true;
            updated++;
          }
        });
        break;

      case "change-category":
        // Change category for multiple resources
        if (!newValue) {
          return res.status(400).json({
            success: false,
            msg: "newValue is required for change-category action",
          });
        }
        resourceIds.forEach((resourceId) => {
          const resource = webinar.resources.find(
            (r: any) => r._id.toString() === resourceId
          ) as any;
          if (resource) {
            resource.category = newValue;
            updated++;
          }
        });
        break;

      case "change-access":
        // Change access level for multiple resources
        if (!newValue) {
          return res.status(400).json({
            success: false,
            msg: "newValue is required for change-access action",
          });
        }
        resourceIds.forEach((resourceId) => {
          const resource = webinar.resources.find(
            (r: any) => r._id.toString() === resourceId
          ) as any;
          if (resource) {
            resource.accessLevel = newValue;
            updated++;
          }
        });
        break;

      default:
        return res.status(400).json({
          success: false,
          msg: "Invalid action",
        });
    }

    await webinar.save();

    logInfo(`Bulk operation '${action}' performed on ${updated} resources for webinar ${webinarId}`);

    // Emit socket event
    const io = getSocketInstance();
    if (io) {
      io.to(`webinar_${webinarId}`).emit("resources_bulk_updated_v2", {
        success: true,
        webinarId,
        action,
        resourceIds,
        updated,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      msg: `Bulk operation completed: ${updated} resources ${action === 'delete' ? 'deleted' : 'updated'}`,
      updated,
    });
  } catch (error) {
    logError("Error performing bulk resource operation V2:", error as Error);
    res.status(500).json({
      success: false,
      msg: "Failed to perform bulk operation",
    });
  }
};

/**
 * Track resource download (V2)
 */
export const trackResourceDownloadV2 = async (req: Request, res: Response) => {
  try {
    const { id: webinarId, resourceId } = req.params;

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

    // Find the resource
    const resource = webinar.resources.find(
      (r: any) => r._id.toString() === resourceId
    ) as any;

    if (!resource) {
      return res.status(404).json({
        success: false,
        msg: "Resource not found",
      });
    }

    // Increment download count
    resource.downloadCount = (resource.downloadCount || 0) + 1;
    await webinar.save();

    res.json({
      success: true,
      msg: "Download tracked",
    });
  } catch (error) {
    logError("Error tracking resource download V2:", error as Error);
    res.status(500).json({
      success: false,
      msg: "Failed to track download",
    });
  }
};

/**
 * Get resource statistics (V2)
 */
export const getResourceStatsV2 = async (req: Request, res: Response) => {
  try {
    const { id: webinarId } = req.params;

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

    // Filter non-archived resources
    const activeResources = webinar.resources.filter((r: any) => !r.isArchived);

    // Calculate stats
    const stats = {
      total: activeResources.length,
      byCategory: activeResources.reduce((acc: any, r: any) => {
        acc[r.category] = (acc[r.category] || 0) + 1;
        return acc;
      }, {}),
      byType: activeResources.reduce((acc: any, r: any) => {
        acc[r.type] = (acc[r.type] || 0) + 1;
        return acc;
      }, {}),
      totalSize: activeResources.reduce((sum: number, r: any) => sum + r.size, 0),
      totalDownloads: activeResources.reduce((sum: number, r: any) => sum + (r.downloadCount || 0), 0),
    };

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logError("Error fetching resource stats V2:", error as Error);
    res.status(500).json({
      success: false,
      msg: "Failed to fetch stats",
    });
  }
};
