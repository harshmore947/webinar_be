import { v2 as cloudinary } from "cloudinary";
import { logError, logInfo } from "./logger";

// Configure Cloudinary (same as cloudinaryService.ts)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "do9j5natz",
  api_key: process.env.CLOUDINARY_API_KEY || "521592873337488",
  api_secret:
    process.env.CLOUDINARY_API_SECRET || "mNhzs99m7zalk12n8ReMgVREW0Y",
});

export interface ResourceUploadResult {
  success: boolean;
  data?: {
    name: string;
    url: string;
    type: "pdf" | "image" | "video";
    fileType: string;
    size: number;
    uploadedAt: Date;
    publicId: string;
    metadata?: {
      width?: number;
      height?: number;
      duration?: number;
      pages?: number;
    };
  };
  error?: string;
}

/**
 * Upload resource file to Cloudinary
 */
export const uploadResourceFile = async (
  fileBuffer: Buffer,
  fileName: string,
  fileType: string,
  fileSize: number,
  webinarId: string
): Promise<ResourceUploadResult> => {
  try {
    // Validate file type
    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/gif",
      "video/mp4",
      "video/webm",
    ];

    if (!allowedTypes.includes(fileType)) {
      return {
        success: false,
        error:
          "Invalid file type. Allowed: PDF, JPEG, PNG, WebP, GIF, MP4, and WebM.",
      };
    }

    // Validate file size (max 50MB)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (fileSize > maxSize) {
      return {
        success: false,
        error: "File size too large. Maximum size is 50MB.",
      };
    }

    // Determine resource type and folder
    const isPdf = fileType === "application/pdf";
    const isVideo = fileType.startsWith("video/");
    const resourceType: "raw" | "image" | "video" = isPdf
      ? "raw"
      : isVideo
      ? "video"
      : "image";
    const folderSegment =
      resourceType === "raw"
        ? "pdfs"
        : resourceType === "video"
        ? "videos"
        : "images";
    const folder = `webinar-resources/${webinarId}/${folderSegment}`;

    // Upload options
    const uploadOptions = {
      folder,
      public_id: `${Date.now()}_${fileName.replace(/\.[^/.]+$/, "")}`, // Remove extension from public_id
      resource_type: resourceType,
      use_filename: true,
      unique_filename: true,
      overwrite: false,
    };

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(
      `data:${fileType};base64,${fileBuffer.toString("base64")}`,
      uploadOptions
    );

    logInfo(`Resource uploaded to Cloudinary: ${result.secure_url}`);

    const metadataPayload: NonNullable<ResourceUploadResult["data"]>["metadata"] = {
      width: typeof result.width === "number" ? result.width : undefined,
      height: typeof result.height === "number" ? result.height : undefined,
      duration:
        typeof result.duration === "number" ? result.duration : undefined,
      pages: typeof result.pages === "number" ? result.pages : undefined,
    };

    const hasMetadata = Object.values(metadataPayload).some(
      (value) => typeof value === "number"
    );

    return {
      success: true,
      data: {
        name: fileName,
        url: result.secure_url,
        type: isPdf ? "pdf" : isVideo ? "video" : "image",
        fileType,
        size: fileSize,
        uploadedAt: new Date(),
        publicId: result.public_id,
        metadata: hasMetadata ? metadataPayload : undefined,
      },
    };
  } catch (error) {
    logError("Error uploading resource to Cloudinary:", error as Error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
};

/**
 * Delete resource from Cloudinary
 */
export const deleteResourceFile = async (
  publicId: string,
  resourceType: "raw" | "image" | "video" = "image"
): Promise<boolean> => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
    });
    logInfo(`Resource deleted from Cloudinary: ${publicId}`);
    return result.result === "ok";
  } catch (error) {
    logError("Error deleting resource from Cloudinary:", error as Error);
    return false;
  }
};

/**
 * Upload multiple resource files
 */
export const uploadMultipleResources = async (
  files: Array<{
    buffer: Buffer;
    name: string;
    type: string;
    size: number;
  }>,
  webinarId: string
): Promise<Array<ResourceUploadResult>> => {
  const results = [];

  for (const file of files) {
    const result = await uploadResourceFile(
      file.buffer,
      file.name,
      file.type,
      file.size,
      webinarId
    );
    results.push(result);
  }

  return results;
};
