import { createCanvas, loadImage, registerFont } from "canvas";
import path from "path";
import { logInfo, logError } from "./logger";
import { uploadGeneratedCertificate } from "./cloudinaryService";
import {
  CertificateConfiguration,
  CertificateGenerationData,
  CertificateFieldMapping,
} from "../types/certificate.types";
import { GeneratedCertificate } from "../models/Certificate.model";
import mongoose from "mongoose";

// Register fonts
try {
  const fontsDir = path.join(__dirname, "../../assets/fonts");
  registerFont(path.join(fontsDir, "Roboto-Regular.ttf"), {
    family: "Roboto",
    weight: "normal",
  });
  registerFont(path.join(fontsDir, "Roboto-Bold.ttf"), {
    family: "Roboto",
    weight: "bold",
  });
  registerFont(path.join(fontsDir, "Arial.ttf"), {
    family: "Arial",
    weight: "normal",
  });
} catch (error) {
  logError("Failed to register fonts, using system defaults", error as Error);
}

/**
 * Format field value based on type and format string
 */
function formatFieldValue(
  value: string | number,
  type: string,
  format?: string
): string {
  if (type === "date" && format) {
    try {
      const date = new Date(value);
      // Simple date formatting
      if (format === "MM/DD/YYYY") {
        return date.toLocaleDateString("en-US");
      } else if (format === "DD/MM/YYYY") {
        return date.toLocaleDateString("en-GB");
      } else if (format === "MMMM DD, YYYY") {
        return date.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        });
      }
      return date.toLocaleDateString();
    } catch {
      return String(value);
    }
  }

  if (type === "number" && format) {
    try {
      const num = Number(value);
      return num.toLocaleString();
    } catch {
      return String(value);
    }
  }

  return String(value);
}

/**
 * Draw text on canvas with specified styling
 */
function drawTextField(
  ctx: any,
  text: string,
  mapping: CertificateFieldMapping,
  canvasWidth: number
) {
  const { position, style } = mapping;

  ctx.save();

  // Set font
  const fontWeight = style.fontWeight === "bold" ? "bold" : "normal";
  ctx.font = `${fontWeight} ${style.fontSize}px ${style.fontFamily || "Arial"}`;
  ctx.fillStyle = style.fontColor;

  // Handle alignment
  let xPos = position.x;
  if (style.alignment === "center") {
    ctx.textAlign = "center";
    xPos = position.x;
  } else if (style.alignment === "right") {
    ctx.textAlign = "right";
    xPos = position.x;
  } else {
    ctx.textAlign = "left";
    xPos = position.x;
  }

  // Handle rotation
  if (style.rotation) {
    ctx.translate(position.x, position.y);
    ctx.rotate((style.rotation * Math.PI) / 180);
    ctx.fillText(text, 0, 0);
  } else {
    ctx.fillText(text, xPos, position.y);
  }

  ctx.restore();
}

/**
 * Generate certificate with dynamic fields
 */
export async function generateDynamicCertificate(
  config: CertificateConfiguration,
  data: CertificateGenerationData
): Promise<{
  certificateUrl: string;
  thumbnailUrl: string;
  publicId: string;
}> {
  try {
    logInfo(
      `Starting certificate generation for user ${data.userId}, webinar ${data.webinarId}`
    );

    // Create canvas with specified dimensions
    const canvas = createCanvas(
      config.dimensions.width,
      config.dimensions.height
    );
    const ctx = canvas.getContext("2d");

    // Load and draw template background
    if (config.templateUrl) {
      const templateImage = await loadImage(config.templateUrl);
      ctx.drawImage(templateImage, 0, 0, canvas.width, canvas.height);
    } else {
      // Default white background if no template
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Draw each mapped field
    for (const mapping of config.fieldMappings) {
      const fieldValue = data.fieldData[mapping.fieldKey];
      if (fieldValue !== undefined && fieldValue !== null) {
        const formattedValue = formatFieldValue(
          fieldValue,
          "text", // You can enhance this by passing field type
          mapping.format
        );
        drawTextField(ctx, formattedValue, mapping, canvas.width);
      }
    }

    // Convert canvas to buffer
    const buffer = canvas.toBuffer("image/png");

    // Upload to Cloudinary
    const uploadResult = await uploadGeneratedCertificate(
      buffer,
      data.webinarId.toString(),
      data.userId.toString(),
      data.certificateNumber
    );

    if (!uploadResult.success || !uploadResult.url) {
      throw new Error(
        uploadResult.error || "Failed to upload certificate to Cloudinary"
      );
    }

    // Generate thumbnail
    const thumbnailCanvas = createCanvas(400, 300);
    const thumbnailCtx = thumbnailCanvas.getContext("2d");
    const image = await loadImage(buffer);
    thumbnailCtx.drawImage(image, 0, 0, 400, 300);
    const thumbnailBuffer = thumbnailCanvas.toBuffer("image/jpeg", {
      quality: 0.7,
    });

    const thumbnailResult = await uploadGeneratedCertificate(
      thumbnailBuffer,
      data.webinarId.toString(),
      data.userId.toString(),
      `${data.certificateNumber}_thumb`
    );

    logInfo(
      `Certificate generated successfully for user ${data.userId}: ${uploadResult.url}`
    );

    return {
      certificateUrl: uploadResult.url,
      thumbnailUrl: thumbnailResult.url || uploadResult.url,
      publicId: uploadResult.publicId || "",
    };
  } catch (error) {
    logError("Error generating certificate", error as Error);
    throw new Error(
      `Certificate generation failed: ${(error as Error).message}`
    );
  }
}

/**
 * Generate certificates for multiple users (bulk generation)
 */
export async function generateBulkCertificates(
  config: CertificateConfiguration,
  dataArray: CertificateGenerationData[],
  progressCallback?: (completed: number, total: number) => void
): Promise<{
  successful: number;
  failed: number;
  results: Array<{
    userId: string;
    status: "success" | "failed";
    certificateId?: mongoose.Types.ObjectId;
    error?: string;
  }>;
}> {
  const results: Array<{
    userId: string;
    status: "success" | "failed";
    certificateId?: mongoose.Types.ObjectId;
    error?: string;
  }> = [];

  let successful = 0;
  let failed = 0;

  for (let i = 0; i < dataArray.length; i++) {
    const data = dataArray[i];
    try {
      // Check if certificate already exists
      const existing = await GeneratedCertificate.findOne({
        userId: data.userId,
        webinarId: data.webinarId,
      });

      if (existing) {
        logInfo(
          `Certificate already exists for user ${data.userId}, skipping generation`
        );
        results.push({
          userId: data.userId.toString(),
          status: "success",
          certificateId: existing._id as mongoose.Types.ObjectId,
        });
        successful++;
        continue;
      }

      // Generate certificate
      const { certificateUrl, thumbnailUrl, publicId } =
        await generateDynamicCertificate(config, data);

      // Save to database
      const certificate = new GeneratedCertificate({
        webinarId: data.webinarId,
        userId: data.userId,
        certificateNumber: data.certificateNumber,
        templateUsed: config.templateUrl || "default",
        certificateUrl,
        thumbnailUrl,
        publicId,
        fieldData: data.fieldData,
        generatedAt: new Date(),
        emailSent: false,
        downloadCount: 0,
        isRevoked: false,
        status: "completed",
        metadata: {
          generationDuration: 0, // Track this if needed
          templateVersion: "v2.0",
        },
      });

      await certificate.save();

      results.push({
        userId: data.userId.toString(),
        status: "success",
        certificateId: certificate._id as mongoose.Types.ObjectId,
      });
      successful++;

      logInfo(
        `Certificate generated and saved for user ${data.userId}: ${certificateUrl}`
      );
    } catch (error) {
      logError(
        `Failed to generate certificate for user ${data.userId}`,
        error as Error
      );
      results.push({
        userId: data.userId.toString(),
        status: "failed",
        error: (error as Error).message,
      });
      failed++;
    }

    // Report progress
    if (progressCallback) {
      progressCallback(i + 1, dataArray.length);
    }
  }

  return { successful, failed, results };
}

/**
 * Regenerate certificate (for edits/corrections)
 */
export async function regenerateCertificate(
  certificateId: string,
  config: CertificateConfiguration,
  data: CertificateGenerationData
): Promise<boolean> {
  try {
    const certificate = await GeneratedCertificate.findById(certificateId);
    if (!certificate) {
      throw new Error("Certificate not found");
    }

    // Generate new certificate
    const { certificateUrl, thumbnailUrl, publicId } =
      await generateDynamicCertificate(config, data);

    // Update certificate record
    certificate.certificateUrl = certificateUrl;
    certificate.thumbnailUrl = thumbnailUrl;
    certificate.publicId = publicId;
    // Convert fieldData values to strings for storage
    const stringFieldData: { [key: string]: string } = {};
    Object.entries(data.fieldData).forEach(([key, value]) => {
      stringFieldData[key] = String(value);
    });
    certificate.fieldData = stringFieldData;
    certificate.generatedAt = new Date();
    certificate.status = "completed";

    await certificate.save();
    logInfo(`Certificate ${certificateId} regenerated successfully`);
    return true;
  } catch (error) {
    logError(
      `Failed to regenerate certificate ${certificateId}`,
      error as Error
    );
    return false;
  }
}
