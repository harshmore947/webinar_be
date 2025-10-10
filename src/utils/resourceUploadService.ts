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
    type: "pdf" | "image";
    fileType: string;
    size: number;
    uploadedAt: Date;
    publicId: string;
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
    ];

    if (!allowedTypes.includes(fileType)) {
      return {
        success: false,
        error:
          "Invalid file type. Only PDF, JPEG, PNG, and WebP files are allowed.",
      };
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (fileSize > maxSize) {
      return {
        success: false,
        error: "File size too large. Maximum size is 10MB.",
      };
    }

    // Determine resource type and folder
    const isPdf = fileType === "application/pdf";
    const resourceType = isPdf ? "raw" : "image";
    const folder = `webinar-resources/${webinarId}/${isPdf ? "pdfs" : "images"}`;

    // Upload options
    const uploadOptions = {
      folder,
      public_id: `${Date.now()}_${fileName.replace(/\.[^/.]+$/, "")}`, // Remove extension from public_id
      resource_type: resourceType as "raw" | "image",
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

    return {
      success: true,
      data: {
        name: fileName,
        url: result.secure_url,
        type: isPdf ? "pdf" : "image",
        fileType,
        size: fileSize,
        uploadedAt: new Date(),
        publicId: result.public_id,
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
  resourceType: "raw" | "image" = "image"
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
