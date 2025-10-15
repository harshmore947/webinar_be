import {
  createCanvas,
  loadImage,
  CanvasRenderingContext2D,
  registerFont,
} from "canvas";
import QRCode from "qrcode";
import { IWebinar } from "../models/Webinar.model";
import { GeneratedCertificate } from "../models/Certificate.model";
import { logError, logInfo } from "./logger";
import { uploadGeneratedCertificate } from "./cloudinaryService";
import path from "path";

// Register custom fonts (place font files in assets/fonts directory)
try {
  registerFont(path.join(__dirname, "../../assets/fonts/Roboto-Regular.ttf"), {
    family: "Roboto",
  });
  registerFont(path.join(__dirname, "../../assets/fonts/Roboto-Bold.ttf"), {
    family: "Roboto",
    weight: "bold",
  });
  registerFont(
    path.join(__dirname, "../../assets/fonts/Montserrat-Regular.ttf"),
    { family: "Montserrat" }
  );
  registerFont(path.join(__dirname, "../../assets/fonts/Montserrat-Bold.ttf"), {
    family: "Montserrat",
    weight: "bold",
  });
} catch (error) {
  logError(
    "Failed to register custom fonts, using system fonts:",
    error as Error
  );
}

export interface EnhancedCertificateField {
  id: string;
  label: string;
  type:
    | "text"
    | "date"
    | "number"
    | "email"
    | "image"
    | "qr_code"
    | "signature"
    | "logo";
  position: { x: number; y: number };
  fontSize: number;
  fontColor: string;
  fontFamily: string;
  fontWeight: "normal" | "bold" | "light";
  rotation: number;
  width?: number;
  height?: number;
  format?: string;
  alignment?: "left" | "center" | "right";
  lineHeight?: number;
  letterSpacing?: number;
  textShadow?: {
    color: string;
    offsetX: number;
    offsetY: number;
    blur: number;
  };
  border?: {
    width: number;
    color: string;
    style: "solid" | "dashed" | "dotted";
  };
  background?: {
    color: string;
    opacity: number;
    borderRadius: number;
  };
  // Specific to image/QR/logo fields
  imageUrl?: string;
  qrCodeData?: string;
  // Conditional visibility
  conditions?: Array<{
    field: string;
    operator:
      | "equals"
      | "not_equals"
      | "contains"
      | "greater_than"
      | "less_than";
    value: string;
  }>;
}

export interface EnhancedCertificateData {
  attendeeName: string;
  webinarTitle: string;
  completionDate: string;
  certificateNumber: string;
  customFields?: { [key: string]: string };
  // Enhanced fields
  attendeeEmail?: string;
  webinarDate?: string;
  webinarDuration?: string;
  hostName?: string;
  organizationName?: string;
  attendanceDuration?: string;
  completionPercentage?: string;
  grade?: string;
  skills?: string[];
  verificationUrl?: string;
}

export interface EnhancedGenerateCertificateOptions {
  webinar: IWebinar;
  certificateData: EnhancedCertificateData;
  userId: string;
  uploadToCloudinary?: boolean;
  generateThumbnail?: boolean;
  watermark?: {
    text: string;
    opacity: number;
    position:
      | "top-left"
      | "top-right"
      | "bottom-left"
      | "bottom-right"
      | "center";
  };
}

/**
 * Enhanced certificate generation with advanced features
 */
export const generateEnhancedCertificate = async (
  options: EnhancedGenerateCertificateOptions
): Promise<{
  success: boolean;
  imageBuffer?: Buffer;
  thumbnailBuffer?: Buffer;
  cloudinaryUrl?: string;
  thumbnailUrl?: string;
  error?: string;
}> => {
  try {
    const {
      webinar,
      certificateData,
      userId,
      uploadToCloudinary = true,
      generateThumbnail = true,
      watermark,
    } = options;

    // Get certificate configuration
    const config = webinar.certificateConfig;
    const dimensions = config?.dimensions || { width: 1200, height: 900 };

    // Create main canvas
    const canvas = createCanvas(dimensions.width, dimensions.height);
    const ctx = canvas.getContext("2d");

    // Set high-quality rendering
    ctx.patternQuality = "best";
    ctx.quality = "best";
    ctx.antialias = "subpixel";

    // Load and draw background
    await renderBackground(ctx, config, dimensions);

    // Render enhanced fields
    if (config?.fields && config.fields.length > 0) {
      // Map fields to ensure all required properties exist and filter supported types
      const enhancedFields: EnhancedCertificateField[] = config.fields
        .filter((field: any) =>
          ["text", "date", "number", "email"].includes(field.type)
        )
        .map((field: any) => ({
          ...field,
          type: field.type as "text" | "date" | "number" | "email",
          fontFamily: (field as any).fontFamily || "Arial",
          rotation: (field as any).rotation || 0,
          alignment: (field as any).alignment || "left",
        }));
      await renderEnhancedFields(ctx, enhancedFields, certificateData);
    }

    // Add verification QR code if enabled
    if (certificateData.verificationUrl) {
      await addVerificationQR(ctx, certificateData.verificationUrl, dimensions);
    }

    // Add watermark if specified
    if (watermark) {
      addWatermark(ctx, watermark, dimensions);
    }

    // Add security features
    await addSecurityFeatures(ctx, certificateData, dimensions);

    // Convert to buffer
    const imageBuffer = canvas.toBuffer("image/png", { compressionLevel: 3 });

    let thumbnailBuffer: Buffer | undefined;
    let cloudinaryUrl: string | undefined;
    let thumbnailUrl: string | undefined;

    // Generate thumbnail
    if (generateThumbnail) {
      thumbnailBuffer = await createThumbnailFromBuffer(imageBuffer, 400, 300);
    }

    // Upload to Cloudinary
    if (uploadToCloudinary) {
      const uploadResult = await uploadGeneratedCertificate(
        imageBuffer,
        (webinar._id as any).toString(),
        userId,
        certificateData.certificateNumber
      );

      if (uploadResult.success) {
        cloudinaryUrl = uploadResult.url;

        // Upload thumbnail if generated
        if (thumbnailBuffer) {
          const thumbResult = await uploadGeneratedCertificate(
            thumbnailBuffer,
            (webinar._id as any).toString(),
            userId,
            `${certificateData.certificateNumber}_thumb`
          );
          if (thumbResult.success) {
            thumbnailUrl = thumbResult.url;
          }
        }
      } else {
        logError(
          "Failed to upload certificate to Cloudinary:",
          new Error(uploadResult.error)
        );
      }
    }

    logInfo(
      `Enhanced certificate generated for user ${userId} in webinar ${(
        webinar._id as any
      ).toString()}`
    );

    return {
      success: true,
      imageBuffer,
      thumbnailBuffer,
      cloudinaryUrl,
      thumbnailUrl,
    };
  } catch (error) {
    logError("Error generating enhanced certificate:", error as Error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
};

/**
 * Render background with gradient support
 */
const renderBackground = async (
  ctx: CanvasRenderingContext2D,
  config: any,
  dimensions: { width: number; height: number }
): Promise<void> => {
  if (config?.backgroundImage) {
    try {
      const backgroundImage = await loadImage(config.backgroundImage);
      ctx.drawImage(backgroundImage, 0, 0, dimensions.width, dimensions.height);
    } catch (error) {
      logError("Error loading background image:", error as Error);
      // Fallback to gradient background
      renderGradientBackground(ctx, dimensions);
    }
  } else {
    renderGradientBackground(ctx, dimensions);
  }
};

/**
 * Render gradient background
 */
const renderGradientBackground = (
  ctx: CanvasRenderingContext2D,
  dimensions: { width: number; height: number }
): void => {
  const gradient = ctx.createLinearGradient(
    0,
    0,
    dimensions.width,
    dimensions.height
  );
  gradient.addColorStop(0, "#f8fafc");
  gradient.addColorStop(0.5, "#ffffff");
  gradient.addColorStop(1, "#f1f5f9");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, dimensions.width, dimensions.height);

  // Add decorative border
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 4;
  ctx.strokeRect(20, 20, dimensions.width - 40, dimensions.height - 40);
};

/**
 * Render enhanced fields with advanced styling
 */
const renderEnhancedFields = async (
  ctx: CanvasRenderingContext2D,
  fields: EnhancedCertificateField[],
  data: EnhancedCertificateData
): Promise<void> => {
  for (const field of fields) {
    // Check field conditions
    if (field.conditions && !evaluateFieldConditions(field.conditions, data)) {
      continue;
    }

    // Get field value
    const value = getFieldValue(field, data);
    if (!value && field.type !== "image" && field.type !== "qr_code") {
      continue;
    }

    // Save context
    ctx.save();

    // Apply transformations
    if (field.rotation !== 0) {
      const centerX = field.position.x + (field.width || 0) / 2;
      const centerY = field.position.y + (field.fontSize || 16) / 2;
      ctx.translate(centerX, centerY);
      ctx.rotate((field.rotation * Math.PI) / 180);
      ctx.translate(-centerX, -centerY);
    }

    // Render based on field type
    switch (field.type) {
      case "text":
      case "date":
      case "number":
      case "email":
        await renderTextField(ctx, field, value);
        break;
      case "qr_code":
        await renderQRCode(ctx, field, data);
        break;
      case "image":
      case "logo":
        await renderImage(ctx, field);
        break;
      case "signature":
        await renderSignature(ctx, field, data);
        break;
    }

    // Restore context
    ctx.restore();
  }
};

/**
 * Render text field with advanced styling
 */
const renderTextField = async (
  ctx: CanvasRenderingContext2D,
  field: EnhancedCertificateField,
  value: string
): Promise<void> => {
  // Apply background if specified
  if (field.background) {
    ctx.fillStyle = field.background.color;
    ctx.globalAlpha = field.background.opacity;
    const bgWidth = field.width || ctx.measureText(value).width + 20;
    const bgHeight = field.fontSize + 10;

    if (field.background.borderRadius > 0) {
      roundRect(
        ctx,
        field.position.x - 10,
        field.position.y - 5,
        bgWidth,
        bgHeight,
        field.background.borderRadius
      );
      ctx.fill();
    } else {
      ctx.fillRect(
        field.position.x - 10,
        field.position.y - 5,
        bgWidth,
        bgHeight
      );
    }
    ctx.globalAlpha = 1;
  }

  // Apply border if specified
  if (field.border) {
    ctx.strokeStyle = field.border.color;
    ctx.lineWidth = field.border.width;
    ctx.setLineDash(
      field.border.style === "dashed"
        ? [5, 5]
        : field.border.style === "dotted"
        ? [2, 2]
        : []
    );

    const borderWidth = field.width || ctx.measureText(value).width + 20;
    const borderHeight = field.fontSize + 10;
    ctx.strokeRect(
      field.position.x - 10,
      field.position.y - 5,
      borderWidth,
      borderHeight
    );
    ctx.setLineDash([]);
  }

  // Set font properties
  const fontWeight =
    field.fontWeight === "bold"
      ? "bold"
      : field.fontWeight === "light"
      ? "300"
      : "normal";
  ctx.font = `${fontWeight} ${field.fontSize}px ${field.fontFamily || "Arial"}`;
  ctx.fillStyle = field.fontColor;
  ctx.textAlign = (field.alignment as CanvasTextAlign) || "left";
  ctx.textBaseline = "top";

  // Apply text shadow if specified
  if (field.textShadow) {
    ctx.shadowColor = field.textShadow.color;
    ctx.shadowOffsetX = field.textShadow.offsetX;
    ctx.shadowOffsetY = field.textShadow.offsetY;
    ctx.shadowBlur = field.textShadow.blur;
  }

  // Handle text wrapping
  if (field.width) {
    wrapText(
      ctx,
      value,
      field.position.x,
      field.position.y,
      field.width,
      field.lineHeight || field.fontSize * 1.2
    );
  } else {
    ctx.fillText(value, field.position.x, field.position.y);
  }

  // Reset shadow
  ctx.shadowColor = "transparent";
};

/**
 * Render QR code
 */
const renderQRCode = async (
  ctx: CanvasRenderingContext2D,
  field: EnhancedCertificateField,
  data: EnhancedCertificateData
): Promise<void> => {
  try {
    const qrData =
      field.qrCodeData || data.verificationUrl || `${data.certificateNumber}`;
    const qrSize = Math.min(field.width || 100, field.height || 100);

    const qrCodeDataUrl = await QRCode.toDataURL(qrData, {
      width: qrSize,
      margin: 2,
      color: {
        dark: field.fontColor || "#000000",
        light: "#ffffff",
      },
    });

    const qrImage = await loadImage(qrCodeDataUrl);
    ctx.drawImage(qrImage, field.position.x, field.position.y, qrSize, qrSize);
  } catch (error) {
    logError("Error generating QR code:", error as Error);
  }
};

/**
 * Render image/logo
 */
const renderImage = async (
  ctx: CanvasRenderingContext2D,
  field: EnhancedCertificateField
): Promise<void> => {
  if (!field.imageUrl) return;

  try {
    const image = await loadImage(field.imageUrl);
    const width = field.width || image.width;
    const height = field.height || image.height;

    ctx.drawImage(image, field.position.x, field.position.y, width, height);
  } catch (error) {
    logError("Error loading image:", error as Error);
  }
};

/**
 * Render signature placeholder
 */
const renderSignature = async (
  ctx: CanvasRenderingContext2D,
  field: EnhancedCertificateField,
  data: EnhancedCertificateData
): Promise<void> => {
  const width = field.width || 200;
  const height = field.height || 50;

  // Draw signature line
  ctx.strokeStyle = field.fontColor || "#000000";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(field.position.x, field.position.y + height);
  ctx.lineTo(field.position.x + width, field.position.y + height);
  ctx.stroke();

  // Add signature text
  ctx.font = `normal ${field.fontSize * 0.8}px ${field.fontFamily || "Arial"}`;
  ctx.fillStyle = field.fontColor || "#000000";
  ctx.textAlign = "center";
  ctx.fillText(
    field.label,
    field.position.x + width / 2,
    field.position.y + height + 20
  );
};

/**
 * Add verification QR code
 */
const addVerificationQR = async (
  ctx: CanvasRenderingContext2D,
  verificationUrl: string,
  dimensions: { width: number; height: number }
): Promise<void> => {
  try {
    const qrSize = 80;
    const qrX = dimensions.width - qrSize - 20;
    const qrY = dimensions.height - qrSize - 20;

    const qrCodeDataUrl = await QRCode.toDataURL(verificationUrl, {
      width: qrSize,
      margin: 1,
    });

    const qrImage = await loadImage(qrCodeDataUrl);
    ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);

    // Add "Verify" text
    ctx.font = "normal 10px Arial";
    ctx.fillStyle = "#666666";
    ctx.textAlign = "center";
    ctx.fillText("Verify", qrX + qrSize / 2, qrY + qrSize + 15);
  } catch (error) {
    logError("Error adding verification QR:", error as Error);
  }
};

/**
 * Add watermark
 */
const addWatermark = (
  ctx: CanvasRenderingContext2D,
  watermark: { text: string; opacity: number; position: string },
  dimensions: { width: number; height: number }
): void => {
  ctx.save();
  ctx.globalAlpha = watermark.opacity;
  ctx.font = "normal 24px Arial";
  ctx.fillStyle = "#cccccc";

  let x, y;
  switch (watermark.position) {
    case "top-left":
      x = 30;
      y = 40;
      break;
    case "top-right":
      x = dimensions.width - 30;
      y = 40;
      ctx.textAlign = "right";
      break;
    case "bottom-left":
      x = 30;
      y = dimensions.height - 30;
      break;
    case "bottom-right":
      x = dimensions.width - 30;
      y = dimensions.height - 30;
      ctx.textAlign = "right";
      break;
    case "center":
    default:
      x = dimensions.width / 2;
      y = dimensions.height / 2;
      ctx.textAlign = "center";
      ctx.rotate(-Math.PI / 6);
      break;
  }

  ctx.fillText(watermark.text, x, y);
  ctx.restore();
};

/**
 * Add security features (hologram effect, serial number, etc.)
 */
const addSecurityFeatures = async (
  ctx: CanvasRenderingContext2D,
  data: EnhancedCertificateData,
  dimensions: { width: number; height: number }
): Promise<void> => {
  // Add certificate serial number in small text
  ctx.font = "normal 8px monospace";
  ctx.fillStyle = "#999999";
  ctx.textAlign = "right";
  ctx.fillText(
    `Serial: ${data.certificateNumber}`,
    dimensions.width - 20,
    dimensions.height - 10
  );

  // Add generation timestamp
  ctx.textAlign = "left";
  ctx.fillText(
    `Generated: ${new Date().toISOString()}`,
    20,
    dimensions.height - 10
  );
};

/**
 * Helper functions
 */
const getFieldValue = (
  field: EnhancedCertificateField,
  data: EnhancedCertificateData
): string => {
  switch (field.id.toLowerCase()) {
    case "attendee_name":
    case "participant_name":
    case "name":
      return data.attendeeName;
    case "webinar_title":
    case "course_title":
    case "title":
      return data.webinarTitle;
    case "completion_date":
    case "date":
      return formatDate(data.completionDate, field.format);
    case "certificate_number":
    case "number":
      return data.certificateNumber;
    case "email":
      return data.attendeeEmail || "";
    case "host_name":
      return data.hostName || "";
    case "organization":
      return data.organizationName || "";
    case "duration":
      return data.attendanceDuration || "";
    case "percentage":
      return data.completionPercentage || "";
    case "grade":
      return data.grade || "";
    case "skills":
      return data.skills?.join(", ") || "";
    default:
      return (
        data.customFields?.[field.id] ||
        data.customFields?.[field.label] ||
        field.label
      );
  }
};

const formatDate = (dateString: string, format?: string): string => {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;

  switch (format) {
    case "MM/DD/YYYY":
      return date.toLocaleDateString("en-US");
    case "DD/MM/YYYY":
      return date.toLocaleDateString("en-GB");
    case "YYYY-MM-DD":
      return date.toISOString().split("T")[0];
    case "MMMM DD, YYYY":
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    default:
      return date.toLocaleDateString();
  }
};

const evaluateFieldConditions = (
  conditions: any[],
  data: EnhancedCertificateData
): boolean => {
  return conditions.every((condition) => {
    const fieldValue = getFieldValue({ id: condition.field } as any, data);
    switch (condition.operator) {
      case "equals":
        return fieldValue === condition.value;
      case "not_equals":
        return fieldValue !== condition.value;
      case "contains":
        return fieldValue.includes(condition.value);
      case "greater_than":
        return parseFloat(fieldValue) > parseFloat(condition.value);
      case "less_than":
        return parseFloat(fieldValue) < parseFloat(condition.value);
      default:
        return true;
    }
  });
};

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
    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line, x, currentY);
      line = words[n] + " ";
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, currentY);
};

const roundRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void => {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
};

const createThumbnailFromBuffer = async (
  imageBuffer: Buffer,
  width: number,
  height: number
): Promise<Buffer> => {
  const originalImage = await loadImage(imageBuffer);
  const thumbnailCanvas = createCanvas(width, height);
  const thumbnailCtx = thumbnailCanvas.getContext("2d");

  thumbnailCtx.drawImage(originalImage, 0, 0, width, height);
  return thumbnailCanvas.toBuffer("image/jpeg", { quality: 0.8 });
};
