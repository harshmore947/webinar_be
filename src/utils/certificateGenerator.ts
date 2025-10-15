import { createCanvas, loadImage, CanvasRenderingContext2D } from "canvas";
import { IWebinar } from "../models/Webinar.model";
import { logError, logInfo } from "./logger";
import { uploadGeneratedCertificate } from "./cloudinaryService";

export interface CertificateField {
  id: string;
  label: string;
  type: "text" | "date" | "number" | "email" | "select";
  position: { x: number; y: number };
  fontSize: number;
  fontColor: string;
  fontWeight: "normal" | "bold" | "light";
  rotation: number;
  width?: number;
  height?: number;
  format?: string;
}

export interface CertificateData {
  attendeeName: string;
  webinarTitle: string;
  completionDate: string;
  certificateNumber: string;
  customFields?: { [key: string]: string };
}

export interface GenerateCertificateOptions {
  webinar: IWebinar;
  certificateData: CertificateData;
  userId: string;
  uploadToCloudinary?: boolean;
}

export interface GenerateCertificateResult {
  success: boolean;
  imageBuffer?: Buffer;
  cloudinaryUrl?: string;
  error?: string;
}

/**
 * Generate certificate image with dynamic fields
 */
export const generateCertificate = async (
  options: GenerateCertificateOptions
): Promise<GenerateCertificateResult> => {
  try {
    const {
      webinar,
      certificateData,
      userId,
      uploadToCloudinary = true,
    } = options;

    // Get certificate configuration
    const config = webinar.certificateConfig;
    const dimensions = config?.dimensions || { width: 800, height: 600 };

    // Create canvas
    const canvas = createCanvas(dimensions.width, dimensions.height);
    const ctx = canvas.getContext("2d");

    // Load and draw background image if available
    if (config?.backgroundImage || webinar.certificateTemplate) {
      try {
        const backgroundUrl =
          config?.backgroundImage || webinar.certificateTemplate;
        if (backgroundUrl) {
          const backgroundImage = await loadImage(backgroundUrl);
          ctx.drawImage(
            backgroundImage,
            0,
            0,
            dimensions.width,
            dimensions.height
          );
        }
      } catch (bgError) {
        logError(
          "Error loading background image, using default background:",
          bgError as Error
        );
        // Use default background
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, dimensions.width, dimensions.height);

        // Add a simple border
        ctx.strokeStyle = "#cccccc";
        ctx.lineWidth = 2;
        ctx.strokeRect(10, 10, dimensions.width - 20, dimensions.height - 20);
      }
    } else {
      // Default white background with border
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, dimensions.width, dimensions.height);
      ctx.strokeStyle = "#cccccc";
      ctx.lineWidth = 2;
      ctx.strokeRect(10, 10, dimensions.width - 20, dimensions.height - 20);
    }

    // Render dynamic fields
    // Use certificateTemplate.fields if available (new format with normalized coordinates)
    // Otherwise fall back to certificateConfig.fields (legacy format)
    let fieldsToRender: any[] = [];
    
    if (webinar.certificateTemplate && (webinar.certificateTemplate as any).fields) {
      // New format: fields from certificateTemplate with normalized coordinates (0-1)
      const templateFields = (webinar.certificateTemplate as any).fields;
      const templateWidth = (webinar.certificateTemplate as any).width || dimensions.width;
      const templateHeight = (webinar.certificateTemplate as any).height || dimensions.height;
      
      // Convert normalized coordinates to pixel positions
      fieldsToRender = templateFields.map((field: any) => ({
        ...field,
        position: {
          x: field.x * templateWidth,  // Convert 0-1 to pixels (0.5 * 800 = 400px)
          y: field.y * templateHeight  // Convert 0-1 to pixels (0.35 * 600 = 210px)
        }
      }));
      
      console.log("🎨 Rendering certificate fields (normalized to pixels):", {
        templateDimensions: { width: templateWidth, height: templateHeight },
        fieldsCount: fieldsToRender.length,
        sampleField: fieldsToRender[0] ? {
          key: fieldsToRender[0].key,
          normalized: { x: templateFields[0].x, y: templateFields[0].y },
          pixels: fieldsToRender[0].position
        } : null
      });
      
      await renderDynamicFields(ctx, fieldsToRender, certificateData);
    } else if (config?.fields && config.fields.length > 0) {
      // Legacy format: fields from certificateConfig with pixel positions
      await renderDynamicFields(ctx, config.fields, certificateData);
    } else {
      // Fallback to legacy positioning
      await renderLegacyFields(ctx, config, certificateData);
    }

    // Convert canvas to buffer
    const imageBuffer = canvas.toBuffer("image/png");

    let cloudinaryUrl: string | undefined;

    if (uploadToCloudinary) {
      const uploadResult = await uploadGeneratedCertificate(
        imageBuffer,
        (webinar._id as any).toString(),
        userId,
        certificateData.certificateNumber
      );

      if (uploadResult.success) {
        cloudinaryUrl = uploadResult.url;
      } else {
        logError(
          "Failed to upload certificate to Cloudinary:",
          new Error(uploadResult.error)
        );
      }
    }

    logInfo(
      `Certificate generated successfully for user ${userId} in webinar ${(webinar._id as any).toString()}`
    );

    return {
      success: true,
      imageBuffer,
      cloudinaryUrl,
    };
  } catch (error) {
    logError("Error generating certificate:", error as Error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
};

/**
 * Render dynamic fields on certificate
 */
const renderDynamicFields = async (
  ctx: CanvasRenderingContext2D,
  fields: CertificateField[],
  data: CertificateData
): Promise<void> => {
  for (const field of fields) {
    let value = "";

    // Get field value based on field key or ID (supporting both formats)
    const fieldKey = (field as any).key || field.id;
    const fieldId = fieldKey.toLowerCase().replace(/[_\s]/g, '');  // Normalize: attendeeName, attendee_name, attendee name → attendeename

    // Get field value based on normalized field ID
    if (fieldId.includes('attendee') || fieldId.includes('participant') || fieldId.includes('name')) {
      value = data.attendeeName;
    } else if (fieldId.includes('webinar') || fieldId.includes('course') || fieldId.includes('title')) {
      value = data.webinarTitle;
    } else if (fieldId.includes('completion') || fieldId.includes('date')) {
      value = formatDate(data.completionDate, field.format);
    } else if (fieldId.includes('certificate') || fieldId.includes('number')) {
      value = data.certificateNumber;
    } else {
      // Check custom fields
      value =
        data.customFields?.[fieldKey] ||
        data.customFields?.[field.label] ||
        field.label;
    }

    // Apply text styling
    const fontWeight =
      field.fontWeight === "bold"
        ? "bold"
        : field.fontWeight === "light"
          ? "300"
          : "normal";
    ctx.font = `${fontWeight} ${field.fontSize}px Arial, sans-serif`;
    // Support both 'color' (schema) and 'fontColor' (legacy) properties
    ctx.fillStyle = (field as any).color || field.fontColor || '#000000';
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    // Save context for rotation
    ctx.save();

    // Apply rotation if specified (default to 0 if not specified)
    const rotation = field.rotation || 0;
    if (rotation !== 0) {
      const centerX = field.position.x + (field.width || 0) / 2;
      const centerY = field.position.y + field.fontSize / 2;
      ctx.translate(centerX, centerY);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(-centerX, -centerY);
    }

    // Handle text wrapping if width is specified
    if (field.width && value.length > 0) {
      wrapText(
        ctx,
        value,
        field.position.x,
        field.position.y,
        field.width,
        field.fontSize * 1.2
      );
    } else {
      ctx.fillText(value, field.position.x, field.position.y);
    }

    // Restore context
    ctx.restore();
  }
};

/**
 * Render legacy fields (backward compatibility)
 */
const renderLegacyFields = async (
  ctx: CanvasRenderingContext2D,
  config: any,
  data: CertificateData
): Promise<void> => {
  const fontSize = config?.fontSize || 20;
  const fontColor = config?.fontColor || "#000000";

  ctx.font = `bold ${fontSize}px Arial, sans-serif`;
  ctx.fillStyle = fontColor;
  ctx.textAlign = "center";

  // Render name
  if (config?.namePosition) {
    ctx.fillText(
      data.attendeeName,
      config.namePosition.x,
      config.namePosition.y
    );
  }

  // Render certificate number
  if (config?.numberPosition) {
    ctx.font = `normal ${fontSize * 0.8}px Arial, sans-serif`;
    ctx.fillText(
      data.certificateNumber,
      config.numberPosition.x,
      config.numberPosition.y
    );
  }
};

/**
 * Wrap text within specified width
 */
const wrapText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
): void => {
  const words = text.split(" ");
  let line = "";
  let currentY = y;

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + " ";
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;

    if (testWidth > maxWidth && n > 0) {
      ctx.fillText(line, x, currentY);
      line = words[n] + " ";
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, currentY);
};

/**
 * Format date based on specified format
 */
const formatDate = (dateString: string, format?: string): string => {
  const date = new Date(dateString);

  if (!format) {
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  // Handle common date formats
  switch (format.toLowerCase()) {
    case "yyyy-mm-dd":
      return date.toISOString().split("T")[0];
    case "mm/dd/yyyy":
      return date.toLocaleDateString("en-US");
    case "dd/mm/yyyy":
      return date.toLocaleDateString("en-GB");
    case "mmmm dd, yyyy":
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    default:
      return date.toLocaleDateString();
  }
};

/**
 * Generate certificates for multiple attendees (batch processing)
 */
export const generateCertificatesBatch = async (
  webinar: IWebinar,
  attendeesData: Array<CertificateData & { userId: string }>
): Promise<
  Array<{
    userId: string;
    success: boolean;
    cloudinaryUrl?: string;
    error?: string;
  }>
> => {
  const results = [];

  for (const attendeeData of attendeesData) {
    const { userId, ...certificateData } = attendeeData;

    try {
      const result = await generateCertificate({
        webinar,
        certificateData,
        userId,
        uploadToCloudinary: true,
      });

      results.push({
        userId,
        success: result.success,
        cloudinaryUrl: result.cloudinaryUrl,
        error: result.error,
      });
    } catch (error) {
      results.push({
        userId,
        success: false,
        error: (error as Error).message,
      });
    }
  }

  return results;
};
