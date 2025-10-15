import { Request, Response } from "express";
import WebinarModel from "../models/Webinar.model";
import UserModel from "../models/User.model";
import { GeneratedCertificate } from "../models/Certificate.model";
import { logInfo, logError } from "../utils/logger";
import { uploadCertificateTemplate } from "../utils/cloudinaryService";
import {
  generateDynamicCertificate,
  generateBulkCertificates,
  regenerateCertificate,
} from "../utils/dynamicCertificateGenerator";
import {
  CertificateConfiguration,
  CertificateGenerationData,
  AVAILABLE_CERTIFICATE_FIELDS,
} from "../types/certificate.types";
import mongoose from "mongoose";
import { sendCertificateEmailSimple } from "../utils/mailer";

/**
 * Get available certificate fields
 */
export const getAvailableFields = async (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      fields: AVAILABLE_CERTIFICATE_FIELDS,
    });
  } catch (error) {
    logError("Error fetching available fields", error as Error);
    res.status(500).json({
      success: false,
      msg: "Failed to fetch available fields",
    });
  }
};

/**
 * Upload certificate template
 */
export const uploadTemplate = async (req: Request, res: Response) => {
  try {
    const { webinarId } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        msg: "Certificate template file is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(webinarId)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid webinar ID",
      });
    }

    // Verify webinar exists and user has permission
    const webinar = await WebinarModel.findById(webinarId);
    if (!webinar) {
      return res.status(404).json({
        success: false,
        msg: "Webinar not found",
      });
    }

    const userId = req.user?.id;
    const userRole = req.user?.role;
    const isHost = webinar.hostId.toString() === userId;
    const isAdmin = userRole === "Admin";

    if (!isHost && !isAdmin) {
      return res.status(403).json({
        success: false,
        msg: "Only hosts and admins can upload certificate templates",
      });
    }

    // Upload to Cloudinary
    const uploadResult = await uploadCertificateTemplate(
      file.buffer,
      webinarId,
      file.originalname
    );

    if (!uploadResult.success) {
      return res.status(500).json({
        success: false,
        msg: "Failed to upload certificate template",
        error: uploadResult.error,
      });
    }

    // Update webinar with normalized template structure
    webinar.certificateTemplate = {
      cloudinaryTemplateId: uploadResult.publicId || `cert_template_${webinarId}`,
      cloudinaryUrl: uploadResult.url,
      mimeType: file.mimetype || "image/png",
      width: 1200,
      height: 800,
      fields: [],
      lastEdited: new Date(),
      version: 1,
    };

    // Keep legacy certificateConfig for backward compatibility
    if (!webinar.certificateConfig) {
      webinar.certificateConfig = {
        backgroundImage: uploadResult.url,
        dimensions: { width: 1200, height: 800 },
      };
    } else {
      webinar.certificateConfig.backgroundImage = uploadResult.url;
    }

    await webinar.save();

    logInfo(
      `Certificate template uploaded for webinar ${webinarId}: ${uploadResult.url}`
    );

    res.json({
      success: true,
      msg: "Certificate template uploaded successfully",
      templateUrl: uploadResult.url,
      publicId: uploadResult.publicId,
    });
  } catch (error) {
    logError("Error uploading certificate template", error as Error);
    res.status(500).json({
      success: false,
      msg: "Failed to upload certificate template",
    });
  }
};

/**
 * Update certificate configuration for a webinar
 */
export const updateCertificateConfig = async (req: Request, res: Response) => {
  try {
    const { webinarId } = req.params;
    const {
      enabled,
      selectedFields,
      fieldMappings,
      dimensions,
      autoGenerate,
      requireAttendance,
      minimumDuration,
    } = req.body;

    if (!mongoose.Types.ObjectId.isValid(webinarId)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid webinar ID",
      });
    }

    const webinar = await WebinarModel.findById(webinarId);
    if (!webinar) {
      return res.status(404).json({
        success: false,
        msg: "Webinar not found",
      });
    }

    const userId = req.user?.id;
    const userRole = req.user?.role;
    const isHost = webinar.hostId.toString() === userId;
    const isAdmin = userRole === "Admin";

    if (!isHost && !isAdmin) {
      return res.status(403).json({
        success: false,
        msg: "Only hosts and admins can configure certificates",
      });
    }

    // Validate selected fields
    if (selectedFields && !Array.isArray(selectedFields)) {
      return res.status(400).json({
        success: false,
        msg: "Selected fields must be an array",
      });
    }

    // Validate field mappings
    if (fieldMappings && !Array.isArray(fieldMappings)) {
      return res.status(400).json({
        success: false,
        msg: "Field mappings must be an array",
      });
    }

    // Update configuration
    const config: any = webinar.certificateConfig || {};

    if (enabled !== undefined) webinar.hasCertification = enabled;
    if (selectedFields !== undefined) {
      config.selectedFields = selectedFields;
    }
    if (fieldMappings !== undefined) {
      config.fieldMappings = fieldMappings;
    }
    if (dimensions !== undefined) {
      config.dimensions = dimensions;
    }
    if (autoGenerate !== undefined) {
      config.autoGenerate = autoGenerate;
    }
    if (requireAttendance !== undefined) {
      config.requireAttendance = requireAttendance;
    }
    if (minimumDuration !== undefined) {
      config.minimumDuration = minimumDuration;
    }

    webinar.certificateConfig = config;
    await webinar.save();

    logInfo(`Certificate configuration updated for webinar ${webinarId}`);

    res.json({
      success: true,
      msg: "Certificate configuration updated successfully",
      config: webinar.certificateConfig,
    });
  } catch (error) {
    logError("Error updating certificate configuration", error as Error);
    res.status(500).json({
      success: false,
      msg: "Failed to update certificate configuration",
    });
  }
};

/**
 * Generate certificate for a single user
 */
export const generateSingleCertificate = async (
  req: Request,
  res: Response
) => {
  try {
    const { webinarId, userId: targetUserId } = req.body;

    if (
      !mongoose.Types.ObjectId.isValid(webinarId) ||
      !mongoose.Types.ObjectId.isValid(targetUserId)
    ) {
      return res.status(400).json({
        success: false,
        msg: "Invalid webinar or user ID",
      });
    }

    const webinar = await WebinarModel.findById(webinarId).populate("hostId");
    if (!webinar) {
      return res.status(404).json({
        success: false,
        msg: "Webinar not found",
      });
    }

    if (!webinar.hasCertification || !webinar.certificateConfig) {
      return res.status(400).json({
        success: false,
        msg: "Certification is not enabled for this webinar",
      });
    }

    const user = await UserModel.findById(targetUserId);
    if (!user) {
      return res.status(404).json({
        success: false,
        msg: "User not found",
      });
    }

    // Check if certificate already exists
    const existing = await GeneratedCertificate.findOne({
      webinarId,
      userId: targetUserId,
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        msg: "Certificate already exists for this user",
        certificateId: existing._id,
      });
    }

    // Check permissions
    const requestUserId = req.user?.id;
    const userRole = req.user?.role;
    const isHost = webinar.hostId.toString() === requestUserId;
    const isAdmin = userRole === "Admin";

    if (!isHost && !isAdmin) {
      return res.status(403).json({
        success: false,
        msg: "Only hosts and admins can generate certificates",
      });
    }

    // Prepare field data
    const fieldData: Record<string, string | number> = {};
    const config = webinar.certificateConfig as any;
    const selectedFields = config.selectedFields || [];

    // Populate field data dynamically
    for (const fieldKey of selectedFields) {
      switch (fieldKey) {
        case "userName":
          fieldData[fieldKey] = `${user.firstName} ${user.lastName}`;
          break;
        case "userFirstName":
          fieldData[fieldKey] = user.firstName;
          break;
        case "userLastName":
          fieldData[fieldKey] = user.lastName;
          break;
        case "userEmail":
          fieldData[fieldKey] = user.email;
          break;
        case "title":
          fieldData[fieldKey] = webinar.title;
          break;
        case "description":
          fieldData[fieldKey] = webinar.description;
          break;
        case "category":
          fieldData[fieldKey] = webinar.category;
          break;
        case "date":
          fieldData[fieldKey] = webinar.date;
          break;
        case "time":
          fieldData[fieldKey] = webinar.time;
          break;
        case "hostName":
          const host = webinar.hostId as any;
          fieldData[fieldKey] = `${host.firstName} ${host.lastName}`;
          break;
        case "completionDate":
        case "currentDate":
          fieldData[fieldKey] = new Date().toISOString().split("T")[0];
          break;
      }
    }

    // Generate certificate number
    const certificateNumber = `CERT-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)
      .toUpperCase()}`;

    fieldData["certificateNumber"] = certificateNumber;

    // Generate certificate
    const generationData: CertificateGenerationData = {
      webinarId,
      userId: targetUserId,
      fieldData,
      certificateNumber,
    };

    const certConfig: CertificateConfiguration = {
      enabled: true,
      templateUrl: config.backgroundImage || webinar.certificateTemplate || "",
      templatePublicId: "",
      selectedFields,
      fieldMappings: config.fieldMappings || [],
      dimensions: config.dimensions || { width: 800, height: 600 },
      autoGenerate: false,
      requireAttendance: false,
    };

    const result = await generateDynamicCertificate(certConfig, generationData);

    // Save certificate to database
    const certificate = new GeneratedCertificate({
      webinarId,
      userId: targetUserId,
      certificateNumber,
      templateUsed: certConfig.templateUrl,
      certificateUrl: result.certificateUrl,
      thumbnailUrl: result.thumbnailUrl,
      publicId: result.publicId,
      fieldData: fieldData as any,
      generatedAt: new Date(),
      emailSent: false,
      downloadCount: 0,
      isRevoked: false,
      status: "completed",
      metadata: {
        generationDuration: 0,
        templateVersion: "v2.0",
      },
    });

    await certificate.save();

    logInfo(
      `Certificate generated for user ${targetUserId} in webinar ${webinarId}`
    );

    res.json({
      success: true,
      msg: "Certificate generated successfully",
      certificate: {
        id: certificate._id,
        certificateNumber: certificate.certificateNumber,
        certificateUrl: certificate.certificateUrl,
        thumbnailUrl: certificate.thumbnailUrl,
      },
    });
  } catch (error) {
    logError("Error generating certificate", error as Error);
    res.status(500).json({
      success: false,
      msg: "Failed to generate certificate",
    });
  }
};

/**
 * Generate bulk certificates for all enrolled users
 */
export const generateBulkCertificatesForWebinar = async (
  req: Request,
  res: Response
) => {
  try {
    const { webinarId } = req.body;
    const { sendEmails } = req.query;

    if (!mongoose.Types.ObjectId.isValid(webinarId)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid webinar ID",
      });
    }

    const webinar = await WebinarModel.findById(webinarId).populate([
      "hostId",
      "enrolledUsers",
    ]);

    if (!webinar) {
      return res.status(404).json({
        success: false,
        msg: "Webinar not found",
      });
    }

    if (!webinar.hasCertification || !webinar.certificateConfig) {
      return res.status(400).json({
        success: false,
        msg: "Certification is not enabled for this webinar",
      });
    }

    // Check permissions
    const requestUserId = req.user?.id;
    const userRole = req.user?.role;
    const isHost = webinar.hostId.toString() === requestUserId;
    const isAdmin = userRole === "Admin";

    if (!isHost && !isAdmin) {
      return res.status(403).json({
        success: false,
        msg: "Only hosts and admins can generate bulk certificates",
      });
    }

    const config = webinar.certificateConfig as any;
    const selectedFields = config.selectedFields || [];

    // Prepare generation data for all enrolled users
    const generationDataArray: CertificateGenerationData[] = [];

    for (const userId of webinar.enrolledUsers) {
      // Check if certificate already exists
      const existing = await GeneratedCertificate.findOne({
        webinarId,
        userId,
      });

      if (existing) {
        logInfo(`Skipping certificate for user ${userId} - already exists`);
        continue;
      }

      const user = await UserModel.findById(userId);
      if (!user) continue;

      // Prepare field data
      const fieldData: Record<string, string | number> = {};

      for (const fieldKey of selectedFields) {
        switch (fieldKey) {
          case "userName":
            fieldData[fieldKey] = `${user.firstName} ${user.lastName}`;
            break;
          case "userFirstName":
            fieldData[fieldKey] = user.firstName;
            break;
          case "userLastName":
            fieldData[fieldKey] = user.lastName;
            break;
          case "userEmail":
            fieldData[fieldKey] = user.email;
            break;
          case "title":
            fieldData[fieldKey] = webinar.title;
            break;
          case "description":
            fieldData[fieldKey] = webinar.description;
            break;
          case "category":
            fieldData[fieldKey] = webinar.category;
            break;
          case "date":
            fieldData[fieldKey] = webinar.date;
            break;
          case "time":
            fieldData[fieldKey] = webinar.time;
            break;
          case "hostName":
            const host = webinar.hostId as any;
            fieldData[fieldKey] = `${host.firstName} ${host.lastName}`;
            break;
          case "completionDate":
          case "currentDate":
            fieldData[fieldKey] = new Date().toISOString().split("T")[0];
            break;
        }
      }

      const certificateNumber = `CERT-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)
        .toUpperCase()}`;

      fieldData["certificateNumber"] = certificateNumber;

      generationDataArray.push({
        webinarId,
        userId: userId.toString(),
        fieldData,
        certificateNumber,
      });
    }

    if (generationDataArray.length === 0) {
      return res.json({
        success: true,
        msg: "No users to generate certificates for",
        results: { successful: 0, failed: 0 },
      });
    }

    // Generate certificates in bulk
    const certConfig: CertificateConfiguration = {
      enabled: true,
      templateUrl: config.backgroundImage || webinar.certificateTemplate || "",
      templatePublicId: "",
      selectedFields,
      fieldMappings: config.fieldMappings || [],
      dimensions: config.dimensions || { width: 800, height: 600 },
      autoGenerate: false,
      requireAttendance: false,
    };

    const results = await generateBulkCertificates(
      certConfig,
      generationDataArray,
      (completed, total) => {
        logInfo(`Certificate generation progress: ${completed}/${total}`);
        // TODO: Emit WebSocket event for progress update
      }
    );

    // Send emails if requested
    if (sendEmails === "true") {
      for (const result of results.results) {
        if (result.status === "success" && result.certificateId) {
          const cert = await GeneratedCertificate.findById(
            result.certificateId
          ).populate("userId");
          if (cert) {
            try {
              const user = cert.userId as any;
              await sendCertificateEmailSimple(
                user.email,
                user.firstName,
                webinar.title,
                cert.certificateUrl
              );
              cert.emailSent = true;
              cert.emailSentAt = new Date();
              await cert.save();
            } catch (emailError) {
              logError(
                `Failed to send certificate email to ${result.userId}`,
                emailError as Error
              );
            }
          }
        }
      }
    }

    logInfo(
      `Bulk certificate generation completed for webinar ${webinarId}: ${results.successful} successful, ${results.failed} failed`
    );

    res.json({
      success: true,
      msg: `Certificates generated: ${results.successful} successful, ${results.failed} failed`,
      results: {
        successful: results.successful,
        failed: results.failed,
        details: results.results,
      },
    });
  } catch (error) {
    logError("Error generating bulk certificates", error as Error);
    res.status(500).json({
      success: false,
      msg: "Failed to generate bulk certificates",
    });
  }
};

/**
 * Regenerate a certificate (for corrections)
 */
export const regenerateSingleCertificate = async (
  req: Request,
  res: Response
) => {
  try {
    const { certificateId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(certificateId)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid certificate ID",
      });
    }

    const certificate = await GeneratedCertificate.findById(
      certificateId
    ).populate([{ path: "webinarId", populate: { path: "hostId" } }, "userId"]);

    if (!certificate) {
      return res.status(404).json({
        success: false,
        msg: "Certificate not found",
      });
    }

    const webinar = certificate.webinarId as any;

    // Check permissions
    const requestUserId = req.user?.id;
    const userRole = req.user?.role;
    const isHost = webinar.hostId._id.toString() === requestUserId;
    const isAdmin = userRole === "Admin";

    if (!isHost && !isAdmin) {
      return res.status(403).json({
        success: false,
        msg: "Only hosts and admins can regenerate certificates",
      });
    }

    // Prepare regeneration data
    const config = webinar.certificateConfig as any;
    const certConfig: CertificateConfiguration = {
      enabled: true,
      templateUrl: config.backgroundImage || webinar.certificateTemplate || "",
      templatePublicId: "",
      selectedFields: config.selectedFields || [],
      fieldMappings: config.fieldMappings || [],
      dimensions: config.dimensions || { width: 800, height: 600 },
      autoGenerate: false,
      requireAttendance: false,
    };

    // Convert Map to regular object if needed
    const fieldData =
      certificate.fieldData instanceof Map
        ? Object.fromEntries(certificate.fieldData)
        : certificate.fieldData;

    const generationData: CertificateGenerationData = {
      webinarId: webinar._id,
      userId: certificate.userId,
      fieldData: fieldData as any,
      certificateNumber: certificate.certificateNumber,
    };

    const success = await regenerateCertificate(
      certificateId,
      certConfig,
      generationData
    );

    if (success) {
      res.json({
        success: true,
        msg: "Certificate regenerated successfully",
        certificateId,
      });
    } else {
      res.status(500).json({
        success: false,
        msg: "Failed to regenerate certificate",
      });
    }
  } catch (error) {
    logError("Error regenerating certificate", error as Error);
    res.status(500).json({
      success: false,
      msg: "Failed to regenerate certificate",
    });
  }
};

/**
 * Get certificate configuration for a webinar
 */
export const getCertificateConfig = async (req: Request, res: Response) => {
  try {
    const { webinarId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(webinarId)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid webinar ID",
      });
    }

    const webinar = await WebinarModel.findById(webinarId);
    if (!webinar) {
      return res.status(404).json({
        success: false,
        msg: "Webinar not found",
      });
    }

    res.json({
      success: true,
      config: {
        enabled: webinar.hasCertification,
        templateUrl: webinar.certificateTemplate,
        certificateConfig: webinar.certificateConfig || null,
      },
    });
  } catch (error) {
    logError("Error fetching certificate configuration", error as Error);
    res.status(500).json({
      success: false,
      msg: "Failed to fetch certificate configuration",
    });
  }
};

/**
 * Get all certificates for a webinar
 */
export const getWebinarCertificates = async (req: Request, res: Response) => {
  try {
    const { webinarId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(webinarId)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid webinar ID",
      });
    }

    const certificates = await GeneratedCertificate.find({
      webinarId,
    }).populate("userId", "firstName lastName email");

    res.json({
      success: true,
      certificates: certificates.map((cert) => ({
        id: cert._id,
        certificateNumber: cert.certificateNumber,
        user: cert.userId,
        certificateUrl: cert.certificateUrl,
        thumbnailUrl: cert.thumbnailUrl,
        status: cert.status,
        emailSent: cert.emailSent,
        generatedAt: cert.generatedAt,
        downloadCount: cert.downloadCount,
      })),
    });
  } catch (error) {
    logError("Error fetching webinar certificates", error as Error);
    res.status(500).json({
      success: false,
      msg: "Failed to fetch certificates",
    });
  }
};

/**
 * Upload certificate template from base64
 */
export const uploadTemplateFromBase64 = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { base64Data, webinarId, fileName } = req.body;

    // Validate required fields
    if (!base64Data) {
      return res.status(400).json({
        success: false,
        message: "Base64 data is required",
      });
    }

    // Extract base64 data and detect format from data URL prefix
    let base64String = base64Data;
    let detectedFormat = 'template.png'; // default
    
    if (base64Data.startsWith('data:image/')) {
      // Extract format from data URL (e.g., data:image/jpeg;base64,...)
      const formatMatch = base64Data.match(/data:image\/(jpeg|jpg|png|gif|webp);base64,/);
      if (formatMatch) {
        const format = formatMatch[1] === 'jpeg' ? 'jpg' : formatMatch[1];
        detectedFormat = `template.${format}`;
      }
      base64String = base64Data.split(',')[1];
    }

    // Use provided fileName or detected format
    const finalFileName = fileName || detectedFormat;

    // Convert base64 to buffer
    const buffer = Buffer.from(base64String, 'base64');

    // Upload to Cloudinary
    const uploadResult = await uploadCertificateTemplate(
      buffer,
      webinarId || `temp-${Date.now()}`,
      finalFileName
    );

    if (!uploadResult.success) {
      return res.status(500).json({
        success: false,
        message: "Failed to upload template to Cloudinary",
        error: uploadResult.error,
      });
    }

    logInfo(`Certificate template uploaded via base64 by user ${userId}: ${uploadResult.url}`);

    res.status(200).json({
      success: true,
      message: "Template uploaded successfully",
      templateUrl: uploadResult.url,
      publicId: uploadResult.publicId,
    });
  } catch (error) {
    logError(`Error uploading template from base64: ${(error as Error).message}`);
    res.status(500).json({
      success: false,
      message: "Failed to upload template",
      error: (error as Error).message,
    });
  }
};
