import { v2 as cloudinary } from "cloudinary";
import { logError, logInfo } from "./logger";

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "dvq5vgfb9",
  api_key: process.env.CLOUDINARY_API_KEY || "742836527853928",
  api_secret:
    process.env.CLOUDINARY_API_SECRET || "ZGgQFpX8dM2EQDgPKJBk4lGXGwM",
});

export interface CloudinaryUploadResult {
  success: boolean;
  url?: string;
  publicId?: string;
  error?: string;
}

/**
 * Upload certificate template to Cloudinary
 */
export const uploadCertificateTemplate = async (
  fileBuffer: Buffer,
  webinarId: string,
  fileName?: string
): Promise<CloudinaryUploadResult> => {
  try {
    // Detect file format from buffer or fileName
    let format = "png";
    if (fileName) {
      const ext = fileName.split('.').pop()?.toLowerCase();
      if (ext === "jpg" || ext === "jpeg") {
        format = "jpg";
      } else if (ext === "png") {
        format = "png";
      }
    }

    const uploadOptions = {
      folder: "webinar-certificates/templates",
      public_id: `template_${webinarId}_${Date.now()}`,
      resource_type: "image" as const,
      transformation: [{ quality: "auto:good" }, { fetch_format: "auto" }],
    };

    // Upload the buffer directly as base64 without format prefix
    const base64String = fileBuffer.toString("base64");
    const result = await cloudinary.uploader.upload(
      `data:image/${format};base64,${base64String}`,
      uploadOptions
    );

    logInfo(
      `Certificate template uploaded to Cloudinary: ${result.secure_url}`
    );

    return {
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
    };
  } catch (error) {
    logError(
      "Error uploading certificate template to Cloudinary:",
      error as Error
    );
    return {
      success: false,
      error: (error as Error).message,
    };
  }
};

/**
 * Upload generated certificate to Cloudinary
 */
export const uploadGeneratedCertificate = async (
  imageBuffer: Buffer,
  webinarId: string,
  userId: string,
  certificateNumber: string
): Promise<CloudinaryUploadResult> => {
  try {
    const uploadOptions = {
      folder: "webinar-certificates/generated",
      public_id: `cert_${webinarId}_${userId}_${Date.now()}`,
      resource_type: "image" as const,
      format: "png",
      transformation: [{ quality: "auto:good" }, { fetch_format: "auto" }],
      context: {
        webinar_id: webinarId,
        user_id: userId,
        certificate_number: certificateNumber,
        generated_at: new Date().toISOString(),
      },
    };

    const result = await cloudinary.uploader.upload(
      `data:image/png;base64,${imageBuffer.toString("base64")}`,
      uploadOptions
    );

    logInfo(
      `Generated certificate uploaded to Cloudinary: ${result.secure_url}`
    );

    return {
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
    };
  } catch (error) {
    logError(
      "Error uploading generated certificate to Cloudinary:",
      error as Error
    );
    return {
      success: false,
      error: (error as Error).message,
    };
  }
};

/**
 * Upload webinar thumbnail to Cloudinary
 */
export const uploadWebinarThumbnail = async (
  fileBuffer: Buffer,
  webinarId: string,
  fileName?: string
): Promise<CloudinaryUploadResult> => {
  try {
    const uploadOptions = {
      folder: "webinar-thumbnails",
      public_id: `thumb_${webinarId}_${Date.now()}`,
      resource_type: "image" as const,
      format: "png",
      transformation: [{ quality: "auto:good" }, { fetch_format: "auto" }],
    };

    const result = await cloudinary.uploader.upload(
      `data:image/png;base64,${fileBuffer.toString("base64")}`,
      uploadOptions
    );

    logInfo(`Webinar thumbnail uploaded to Cloudinary: ${result.secure_url}`);

    return {
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
    };
  } catch (error) {
    logError(
      "Error uploading webinar thumbnail to Cloudinary:",
      error as Error
    );
    return { success: false, error: (error as Error).message };
  }
};

/**
 * Delete certificate from Cloudinary
 */
export const deleteCertificate = async (publicId: string): Promise<boolean> => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    logInfo(`Certificate deleted from Cloudinary: ${publicId}`);
    return result.result === "ok";
  } catch (error) {
    logError("Error deleting certificate from Cloudinary:", error as Error);
    return false;
  }
};

/**
 * Get optimized certificate URL
 */
export const getOptimizedCertificateUrl = (
  publicId: string,
  options?: {
    width?: number;
    height?: number;
    quality?: string;
  }
): string => {
  const transformations = [];

  if (options?.width || options?.height) {
    transformations.push({
      width: options.width,
      height: options.height,
      crop: "fit",
    });
  }

  if (options?.quality) {
    transformations.push({ quality: options.quality });
  }

  return cloudinary.url(publicId, {
    transformation: transformations,
    secure: true,
    format: "auto",
  });
};

/**
 * Get certificate storage statistics from Cloudinary
 */
export const getCertificateStorageStats = async (): Promise<{
  success: boolean;
  stats?: {
    totalCertificates: number;
    totalTemplates: number;
    storageUsed: number;
  };
  error?: string;
}> => {
  try {
    // Get certificates count
    const certificatesResult = await cloudinary.api.resources({
      type: "upload",
      prefix: "webinar-certificates/generated/",
      max_results: 1,
    });

    // Get templates count
    const templatesResult = await cloudinary.api.resources({
      type: "upload",
      prefix: "webinar-certificates/templates/",
      max_results: 1,
    });

    // Get storage usage
    const usageResult = await cloudinary.api.usage();

    return {
      success: true,
      stats: {
        totalCertificates: certificatesResult.total_count || 0,
        totalTemplates: templatesResult.total_count || 0,
        storageUsed: usageResult.storage?.usage || 0,
      },
    };
  } catch (error) {
    logError("Error fetching Cloudinary storage stats:", error as Error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
};

/**
 * Generate secure download URL for certificate
 */
export const generateSecureDownloadUrl = (
  publicId: string,
  expiresInMinutes = 60
): string => {
  try {
    const expirationTimestamp =
      Math.floor(Date.now() / 1000) + expiresInMinutes * 60;

    return cloudinary.utils.private_download_url(publicId, "png", {
      expires_at: expirationTimestamp,
      attachment: true,
    });
  } catch (error) {
    logError("Error generating secure download URL:", error as Error);
    return "";
  }
};

/**
 * Optimize certificate image for web display with advanced options
 */
export const optimizeCertificateForWeb = (
  publicId: string,
  options: {
    width?: number;
    height?: number;
    quality?: string;
    format?: string;
  } = {}
): string => {
  const {
    width = 800,
    height = 600,
    quality = "auto:best",
    format = "auto",
  } = options;

  return cloudinary.utils.url(publicId, {
    width,
    height,
    crop: "fit",
    quality,
    fetch_format: format,
    flags: "progressive",
    secure: true,
  });
};

export default cloudinary;
