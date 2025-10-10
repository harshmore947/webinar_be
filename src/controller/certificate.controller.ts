import { Request, Response } from "express";
import CertificateModel from "../models/Certificate.model";
import {
  CertificateTemplateModel,
  ICertificateTemplate,
} from "../models/Certificate.model";
import WebinarModel, { IWebinar } from "../models/Webinar.model";
import UserModel, { IUser } from "../models/User.model";
import { generateEnhancedCertificate } from "../utils/enhancedCertificateGenerator";
import { uploadGeneratedCertificate } from "../utils/cloudinaryService";
import { logInfo, logError } from "../utils/logger";
import { certificateQueue } from "../utils/certificateQueue";
import mongoose from "mongoose";

// Types for populated documents
interface PopulatedWebinar extends Omit<IWebinar, "hostId"> {
  hostId: IUser;
}

interface PopulatedCertificate {
  _id: mongoose.Types.ObjectId;
  certificateNumber: string;
  status: string;
  certificateUrl?: string;
  thumbnailUrl?: string;
  errorMessage?: string;
  userId: IUser;
  webinarId: PopulatedWebinar;
  certificateData: any;
  generatedAt: Date;
}

// Create a new certificate template
export const createCertificateTemplate = async (
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

    const {
      name,
      description,
      backgroundImage,
      fields,
      dimensions,
      category,
      isPublic,
    } = req.body;

    // Validate required fields
    if (!name || !fields || !Array.isArray(fields)) {
      return res.status(400).json({
        success: false,
        message: "Template name and fields are required",
      });
    }

    // Create template
    const template = new CertificateTemplateModel({
      name,
      description,
      backgroundImage,
      defaultFields: fields,
      dimensions: dimensions || { width: 800, height: 600 },
      category: category || "custom",
      isPublic: isPublic || false,
      createdBy: userId,
      usageCount: 0,
    });

    await template.save();

    logInfo(`Certificate template created: ${template.name} by user ${userId}`);

    res.status(201).json({
      success: true,
      message: "Certificate template created successfully",
      template: {
        id: template._id,
        name: template.name,
        description: template.description,
        category: template.category,
        isPublic: template.isPublic,
        usageCount: template.usageCount,
        createdAt: template.createdAt,
      },
    });
  } catch (error) {
    logError(
      `Error creating certificate template: ${(error as Error).message}`
    );
    res.status(500).json({
      success: false,
      message: "Failed to create certificate template",
      error: process.env.NODE_ENV === "development" ? error : undefined,
    });
  }
};

// Get certificate templates
export const getCertificateTemplates = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { category, isPublic } = req.query;

    // Build query
    const query: any = {};

    if (category) {
      query.category = category;
    }

    if (isPublic !== undefined) {
      query.isPublic = isPublic === "true";
    }

    // If user is authenticated, include their private templates
    if (userId) {
      query.$or = [{ isPublic: true }, { createdBy: userId }];
    } else {
      query.isPublic = true;
    }

    const templates = await CertificateTemplateModel.find(query)
      .populate("createdBy", "firstName lastName")
      .sort({ usageCount: -1, createdAt: -1 })
      .limit(50);

    res.status(200).json({
      success: true,
      templates: templates.map((template) => ({
        id: template._id,
        name: template.name,
        description: template.description,
        thumbnailUrl: template.thumbnailUrl,
        category: template.category,
        isPublic: template.isPublic,
        usageCount: template.usageCount,
        createdBy: template.createdBy,
        createdAt: template.createdAt,
      })),
    });
  } catch (error) {
    logError(
      `Error fetching certificate templates: ${(error as Error).message}`
    );
    res.status(500).json({
      success: false,
      message: "Failed to fetch certificate templates",
    });
  }
};

// Get specific certificate template
export const getCertificateTemplate = async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    const userId = req.user?.id;

    if (!mongoose.Types.ObjectId.isValid(templateId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid template ID",
      });
    }

    const template = await CertificateTemplateModel.findById(
      templateId
    ).populate("createdBy", "firstName lastName");

    if (!template) {
      return res.status(404).json({
        success: false,
        message: "Certificate template not found",
      });
    }

    // Check access permissions
    if (!template.isPublic && template.createdBy._id.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: "Access denied to this template",
      });
    }

    res.status(200).json({
      success: true,
      template: {
        id: template._id,
        name: template.name,
        description: template.description,
        templateUrl: template.templateUrl,
        thumbnailUrl: template.thumbnailUrl,
        backgroundImage: template.templateUrl, // For backward compatibility
        fields: template.defaultFields,
        dimensions: template.dimensions,
        category: template.category,
        isPublic: template.isPublic,
        usageCount: template.usageCount,
        createdBy: template.createdBy,
        createdAt: template.createdAt,
      },
    });
  } catch (error) {
    logError(
      `Error fetching certificate template: ${(error as Error).message}`
    );
    res.status(500).json({
      success: false,
      message: "Failed to fetch certificate template",
    });
  }
};

// Generate certificate for webinar participant
export const generateCertificateForParticipant = async (
  req: Request,
  res: Response
) => {
  try {
    const { webinarId, participantId, templateId } = req.body;
    const userId = req.user?.id;

    // Validate required fields
    if (!webinarId || !participantId) {
      return res.status(400).json({
        success: false,
        message: "Webinar ID and participant ID are required",
      });
    }

    // Validate ObjectIds
    if (
      !mongoose.Types.ObjectId.isValid(webinarId) ||
      !mongoose.Types.ObjectId.isValid(participantId) ||
      (templateId && !mongoose.Types.ObjectId.isValid(templateId))
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      });
    }

    // Get webinar details
    const webinar = await WebinarModel.findById(webinarId).populate(
      "hostId",
      "firstName lastName"
    );

    if (!webinar) {
      return res.status(404).json({
        success: false,
        message: "Webinar not found",
      });
    }

    // Check if user has permission to generate certificates
    const populatedWebinar = webinar as any; // Type assertion for populated webinar
    const isHost = populatedWebinar.hostId._id.toString() === userId;
    const isModerator = webinar.moderators?.some(
      (mod: any) => mod.toString() === userId
    );
    const isAdmin = req.user?.role === "Admin";

    if (!isHost && !isModerator && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Only hosts, moderators, or admins can generate certificates",
      });
    }

    // Get participant details
    const participant = await UserModel.findById(participantId);
    if (!participant) {
      return res.status(404).json({
        success: false,
        message: "Participant not found",
      });
    }

    // Check if certificate already exists
    const existingCertificate = await CertificateModel.findOne({
      userId: participantId,
      webinarId: webinarId,
    });

    if (existingCertificate && existingCertificate.status === "completed") {
      return res.status(409).json({
        success: false,
        message: "Certificate already exists for this participant",
        certificate: {
          id: existingCertificate._id,
          certificateNumber: existingCertificate.certificateNumber,
          certificateUrl: existingCertificate.certificateUrl,
          status: existingCertificate.status,
        },
      });
    }

    // Get certificate template
    let template: ICertificateTemplate | null = null;
    if (templateId) {
      template = await CertificateTemplateModel.findById(templateId);
      if (!template) {
        return res.status(404).json({
          success: false,
          message: "Certificate template not found",
        });
      }
    }

    // Generate certificate number
    const certificateNumber = `CERT-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 6)
      .toUpperCase()}`;

    // Create certificate record
    const certificate = new CertificateModel({
      certificateNumber,
      userId: participantId,
      webinarId: webinarId,
      templateId: templateId,
      status: "generating",
      certificateData: {
        attendeeName: `${participant.firstName} ${participant.lastName}`.trim(),
        webinarTitle: webinar.title,
        completionDate: new Date().toLocaleDateString(),
        hostName:
          `${populatedWebinar.hostId.firstName} ${populatedWebinar.hostId.lastName}`.trim(),
        certificateNumber,
      },
    });

    await certificate.save();

    // Add to generation queue
    await certificateQueue.add("generate-certificate", {
      certificateId: (certificate._id as mongoose.Types.ObjectId).toString(),
      template,
      certificateData: certificate.certificateData,
    });

    logInfo(
      `Certificate generation queued for user ${participantId} in webinar ${webinarId}`
    );

    res.status(202).json({
      success: true,
      message: "Certificate generation started",
      certificate: {
        id: certificate._id,
        certificateNumber: certificate.certificateNumber,
        status: certificate.status,
      },
    });
  } catch (error) {
    logError(`Error generating certificate: ${(error as Error).message}`);
    res.status(500).json({
      success: false,
      message: "Failed to generate certificate",
    });
  }
};

// Generate certificates for all webinar participants
export const generateCertificatesForWebinar = async (
  req: Request,
  res: Response
) => {
  try {
    const { webinarId, templateId } = req.body;
    const userId = req.user?.id;

    if (!webinarId) {
      return res.status(400).json({
        success: false,
        message: "Webinar ID is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(webinarId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid webinar ID",
      });
    }

    // Get webinar details
    const webinar = await WebinarModel.findById(webinarId)
      .populate("hostId", "firstName lastName")
      .populate("attendees.userId", "firstName lastName email");

    if (!webinar) {
      return res.status(404).json({
        success: false,
        message: "Webinar not found",
      });
    }

    // Check permissions
    const populatedWebinar = webinar as any; // Type assertion for populated webinar
    const isHost = populatedWebinar.hostId._id.toString() === userId;
    const isModerator = webinar.moderators?.some(
      (mod: any) => mod.toString() === userId
    );
    const isAdmin = req.user?.role === "Admin";

    if (!isHost && !isModerator && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Only hosts, moderators, or admins can generate certificates",
      });
    }

    // Get eligible participants (those who attended)
    const eligibleParticipants =
      (webinar as any).attendees?.filter(
        (attendee: any) => attendee.hasAttended
      ) || [];

    if (eligibleParticipants.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No eligible participants found for certificate generation",
      });
    }

    // Get certificate template
    let template: ICertificateTemplate | null = null;
    if (templateId) {
      template = await CertificateTemplateModel.findById(templateId);
      if (!template) {
        return res.status(404).json({
          success: false,
          message: "Certificate template not found",
        });
      }
    }

    const results: {
      total: number;
      queued: number;
      skipped: number;
      errors: Array<{ participantId: string; error: string }>;
    } = {
      total: eligibleParticipants.length,
      queued: 0,
      skipped: 0,
      errors: [],
    };

    // Generate certificates for each participant
    for (const attendee of eligibleParticipants) {
      try {
        const participantId = attendee.userId._id.toString();

        // Check if certificate already exists
        const existingCertificate = await CertificateModel.findOne({
          userId: participantId,
          webinarId: webinarId,
        });

        if (existingCertificate && existingCertificate.status === "completed") {
          results.skipped++;
          continue;
        }

        // Generate certificate number
        const certificateNumber = `CERT-${Date.now()}-${Math.random()
          .toString(36)
          .substr(2, 6)
          .toUpperCase()}`;

        // Create certificate record
        const certificate = new CertificateModel({
          certificateNumber,
          userId: participantId,
          webinarId: webinarId,
          templateId: templateId,
          status: "generating",
          certificateData: {
            attendeeName:
              `${attendee.userId.firstName} ${attendee.userId.lastName}`.trim(),
            webinarTitle: webinar.title,
            completionDate: new Date().toLocaleDateString(),
            hostName:
              `${populatedWebinar.hostId.firstName} ${populatedWebinar.hostId.lastName}`.trim(),
            certificateNumber,
          },
        });

        await certificate.save();

        // Add to generation queue
        await certificateQueue.add("generate-certificate", {
          certificateId: (
            certificate._id as mongoose.Types.ObjectId
          ).toString(),
          template,
          certificateData: certificate.certificateData,
        });

        results.queued++;
      } catch (error) {
        results.errors.push({
          participantId: attendee.userId._id.toString(),
          error: (error as Error).message,
        });
      }
    }

    logInfo(
      `Certificate generation queued for ${results.queued} participants in webinar ${webinarId}`
    );

    res.status(202).json({
      success: true,
      message: `Certificate generation started for ${results.queued} participants`,
      results,
    });
  } catch (error) {
    logError(
      `Error generating certificates for webinar: ${(error as Error).message}`
    );
    res.status(500).json({
      success: false,
      message: "Failed to generate certificates",
    });
  }
};

// Get user's certificates
export const getUserCertificates = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { webinarId } = req.query;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const query: any = { userId };
    if (webinarId) {
      if (!mongoose.Types.ObjectId.isValid(webinarId as string)) {
        return res.status(400).json({
          success: false,
          message: "Invalid webinar ID",
        });
      }
      query.webinarId = webinarId;
    }

    const certificates = await CertificateModel.find(query)
      .populate({
        path: "webinarId",
        select: "title hostId",
        populate: {
          path: "hostId",
          select: "firstName lastName",
        },
      })
      .sort({ generatedAt: -1 });

    res.status(200).json({
      success: true,
      certificates: certificates.map((cert) => {
        const populatedCert = cert as any; // Type assertion for populated certificate
        return {
          id: cert._id,
          certificateNumber: cert.certificateNumber,
          status: cert.status,
          certificateUrl: cert.certificateUrl,
          thumbnailUrl: cert.thumbnailUrl,
          webinar: {
            id: populatedCert.webinarId._id,
            title: populatedCert.webinarId.title,
            host: populatedCert.webinarId.hostId,
          },
          certificateData: cert.certificateData,
          generatedAt: cert.generatedAt,
        };
      }),
    });
  } catch (error) {
    logError(`Error fetching user certificates: ${(error as Error).message}`);
    res.status(500).json({
      success: false,
      message: "Failed to fetch certificates",
    });
  }
};

// Get certificate status
export const getCertificateStatus = async (req: Request, res: Response) => {
  try {
    const { certificateId } = req.params;
    const userId = req.user?.id;

    if (!mongoose.Types.ObjectId.isValid(certificateId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid certificate ID",
      });
    }

    const certificate = await CertificateModel.findById(certificateId)
      .populate({
        path: "webinarId",
        select: "title hostId moderators",
        populate: {
          path: "hostId",
          select: "firstName lastName",
        },
      })
      .populate("userId", "firstName lastName email");

    if (!certificate) {
      return res.status(404).json({
        success: false,
        message: "Certificate not found",
      });
    }

    // Check access permissions
    const populatedCert = certificate as any; // Type assertion for populated certificate
    const isOwner = populatedCert.userId._id.toString() === userId;
    const isHost = populatedCert.webinarId.hostId.toString() === userId;
    const isModerator = populatedCert.webinarId.moderators?.some(
      (mod: any) => mod.toString() === userId
    );
    const isAdmin = req.user?.role === "Admin";

    if (!isOwner && !isHost && !isModerator && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    res.status(200).json({
      success: true,
      certificate: {
        id: certificate._id,
        certificateNumber: certificate.certificateNumber,
        status: certificate.status,
        certificateUrl: certificate.certificateUrl,
        thumbnailUrl: certificate.thumbnailUrl,
        errorMessage: (certificate as any).errorMessage,
        user: {
          id: populatedCert.userId._id,
          name: `${populatedCert.userId.firstName} ${populatedCert.userId.lastName}`.trim(),
          email: populatedCert.userId.email,
        },
        webinar: {
          id: populatedCert.webinarId._id,
          title: populatedCert.webinarId.title,
        },
        generatedAt: certificate.generatedAt,
      },
    });
  } catch (error) {
    logError(`Error fetching certificate status: ${(error as Error).message}`);
    res.status(500).json({
      success: false,
      message: "Failed to fetch certificate status",
    });
  }
};

// Download certificate
export const downloadCertificate = async (req: Request, res: Response) => {
  try {
    const { certificateId } = req.params;
    const userId = req.user?.id;

    if (!mongoose.Types.ObjectId.isValid(certificateId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid certificate ID",
      });
    }

    const certificate = await CertificateModel.findById(certificateId)
      .populate({
        path: "webinarId",
        select: "hostId moderators",
        populate: {
          path: "hostId",
          select: "firstName lastName",
        },
      })
      .populate("userId", "firstName lastName");

    if (!certificate) {
      return res.status(404).json({
        success: false,
        message: "Certificate not found",
      });
    }

    if (certificate.status !== "completed") {
      return res.status(400).json({
        success: false,
        message: "Certificate is not ready for download",
        status: certificate.status,
      });
    }

    // Check access permissions
    const populatedDownloadCert = certificate as any; // Type assertion
    const isOwner = populatedDownloadCert.userId._id.toString() === userId;
    const isHost = populatedDownloadCert.webinarId.hostId.toString() === userId;
    const isModerator = populatedDownloadCert.webinarId.moderators?.some(
      (mod: any) => mod.toString() === userId
    );
    const isAdmin = req.user?.role === "Admin";

    if (!isOwner && !isHost && !isModerator && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    if (!certificate.certificateUrl) {
      return res.status(404).json({
        success: false,
        message: "Certificate file not found",
      });
    }

    // Increment download count
    await CertificateModel.findByIdAndUpdate(certificateId, {
      $inc: { downloadCount: 1 },
    });

    // Redirect to Cloudinary URL or return the URL
    res.status(200).json({
      success: true,
      downloadUrl: certificate.certificateUrl,
      fileName: `${certificate.certificateNumber}.pdf`,
    });
  } catch (error) {
    logError(`Error downloading certificate: ${(error as Error).message}`);
    res.status(500).json({
      success: false,
      message: "Failed to download certificate",
    });
  }
};
