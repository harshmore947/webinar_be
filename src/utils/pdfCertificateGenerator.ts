/**
 * PDF Certificate Generator
 * Generates certificates in PDF format with proper fonts and styling
 */

import { createCanvas, loadImage, registerFont } from "canvas";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { IWebinar, IWebinarCertificateTemplate } from "../models/Webinar.model";
import { logInfo, logError } from "./logger";

interface CertificateData {
  attendeeName: string;
  webinarTitle: string;
  webinarDate: string;
  certificateNumber: string;
  hostName?: string;
  completionDate?: string;
  duration?: string;
}

interface GeneratePDFOptions {
  template: IWebinarCertificateTemplate;
  certificateData: CertificateData;
  format?: "png" | "pdf";
}

/**
 * Generate certificate as PNG image
 */
export async function generateCertificatePNG(
  options: GeneratePDFOptions
): Promise<Buffer> {
  try {
    const { template, certificateData } = options;
    const { width, height, fields, cloudinaryUrl } = template;

    // Create canvas
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // Load and draw background image
    if (cloudinaryUrl) {
      try {
        const background = await loadImage(cloudinaryUrl);
        ctx.drawImage(background, 0, 0, width, height);
      } catch (error) {
        logError("Failed to load background image", error as Error);
        // Draw white background as fallback
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
      }
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
    }

    // Draw certificate fields
    for (const field of fields) {
      const value = getCertificateFieldValue(field.key, certificateData);
      if (value) {
        drawTextField(ctx, field, value, width, height);
      }
    }

    // Convert to buffer
    return canvas.toBuffer("image/png");
  } catch (error) {
    logError("Error generating PNG certificate", error as Error);
    throw error;
  }
}

/**
 * Generate certificate as PDF
 */
export async function generateCertificatePDF(
  options: GeneratePDFOptions
): Promise<Buffer> {
  try {
    const { template, certificateData } = options;

    // First generate PNG
    const pngBuffer = await generateCertificatePNG(options);

    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    
    // Set PDF metadata
    pdfDoc.setTitle(`Certificate - ${certificateData.attendeeName}`);
    pdfDoc.setAuthor("Webinar Platform");
    pdfDoc.setSubject(`Certificate of Completion - ${certificateData.webinarTitle}`);
    pdfDoc.setCreator("Change Networks Webinar Platform");
    pdfDoc.setProducer("Certificate Generator v1.0");
    pdfDoc.setCreationDate(new Date());

    // Calculate page dimensions (A4 landscape or custom)
    const aspectRatio = template.width / template.height;
    let pageWidth = 841.89; // A4 landscape width in points
    let pageHeight = 595.28; // A4 landscape height in points

    // Adjust if template has different aspect ratio
    if (aspectRatio > 1.4) {
      // Wider than A4 landscape
      pageHeight = pageWidth / aspectRatio;
    } else if (aspectRatio < 1.4) {
      // Taller than A4 landscape
      pageWidth = pageHeight * aspectRatio;
    }

    const page = pdfDoc.addPage([pageWidth, pageHeight]);

    // Embed PNG image
    const pngImage = await pdfDoc.embedPng(pngBuffer);
    const { width: imgWidth, height: imgHeight } = pngImage.scale(1);

    // Calculate scaling to fit page
    const scaleX = pageWidth / imgWidth;
    const scaleY = pageHeight / imgHeight;
    const scale = Math.min(scaleX, scaleY);

    const scaledWidth = imgWidth * scale;
    const scaledHeight = imgHeight * scale;

    // Center the image
    const x = (pageWidth - scaledWidth) / 2;
    const y = (pageHeight - scaledHeight) / 2;

    // Draw image on PDF
    page.drawImage(pngImage, {
      x,
      y,
      width: scaledWidth,
      height: scaledHeight,
    });

    // Add certificate number as metadata (for verification)
    pdfDoc.setKeywords([
      certificateData.certificateNumber,
      certificateData.webinarTitle,
      certificateData.attendeeName,
    ]);

    // Convert to buffer
    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  } catch (error) {
    logError("Error generating PDF certificate", error as Error);
    throw error;
  }
}

/**
 * Generate certificate in specified format
 */
export async function generateCertificate(
  options: GeneratePDFOptions
): Promise<{ buffer: Buffer; mimeType: string; extension: string }> {
  const format = options.format || "pdf";

  if (format === "pdf") {
    const buffer = await generateCertificatePDF(options);
    return {
      buffer,
      mimeType: "application/pdf",
      extension: "pdf",
    };
  } else {
    const buffer = await generateCertificatePNG(options);
    return {
      buffer,
      mimeType: "image/png",
      extension: "png",
    };
  }
}

/**
 * Draw text field on canvas
 */
function drawTextField(
  ctx: any,
  field: any,
  text: string,
  canvasWidth: number,
  canvasHeight: number
): void {
  const fontFamily = field.fontFamily || "Arial";
  const fontSizePx = Math.round(field.fontSize || 16);
  
  ctx.save();
  ctx.font = `${fontSizePx}px ${fontFamily}`;
  ctx.fillStyle = field.color || "#000000";
  ctx.textBaseline = "middle";

  // Set text alignment
  switch (field.align) {
    case "center":
      ctx.textAlign = "center";
      break;
    case "right":
      ctx.textAlign = "right";
      break;
    default:
      ctx.textAlign = "left";
      break;
  }

  // Calculate position (field.x and field.y are normalized 0-1)
  const x = field.x * canvasWidth;
  const y = field.y * canvasHeight;

  // Draw text
  ctx.fillText(text, x, y);
  ctx.restore();
}

/**
 * Get certificate field value from data
 */
function getCertificateFieldValue(
  key: string,
  data: CertificateData
): string {
  const mappings: Record<string, string> = {
    "user.name": data.attendeeName,
    "user.email": data.attendeeName, // Fallback to name if email not provided
    "webinar.title": data.webinarTitle,
    "webinar.date": data.webinarDate,
    "custom.certId": data.certificateNumber,
    "custom.certificateNumber": data.certificateNumber,
    "custom.completionDate": data.completionDate || new Date().toLocaleDateString(),
    "custom.hostName": data.hostName || "",
    "custom.duration": data.duration || "",
  };

  return mappings[key] || "";
}

/**
 * Register custom fonts (if available)
 */
export function registerCustomFonts(): void {
  try {
    // Try to register common fonts
    const fonts = [
      { path: "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", family: "DejaVu Sans" },
      { path: "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", family: "DejaVu Sans Bold" },
      { path: "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf", family: "Liberation Serif" },
    ];

    for (const font of fonts) {
      try {
        registerFont(font.path, { family: font.family });
        logInfo(`Registered font: ${font.family}`);
      } catch (err) {
        // Font not available, skip
      }
    }
  } catch (error) {
    // Fonts not critical, continue with system defaults
    logInfo("Using system default fonts for certificate generation");
  }
}

// Register fonts on module load
registerCustomFonts();

export default {
  generateCertificate,
  generateCertificatePDF,
  generateCertificatePNG,
};

