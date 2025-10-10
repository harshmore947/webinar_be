import Bull from "bull";
import { generateCertificate, CertificateData } from "./certificateGenerator";
import { sendCertificateEmail } from "./mailer";
import {
  CertificateJob,
  GeneratedCertificate,
} from "../models/Certificate.model";
import { IWebinar } from "../models/Webinar.model";
import { IUser } from "../models/User.model";
import { logInfo, logError } from "./logger";

// Redis connection configuration
const redisConfig = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || "0"),
};

// Create certificate generation queue
export const certificateQueue = new Bull("certificate generation", {
  redis: redisConfig,
  defaultJobOptions: {
    removeOnComplete: 50, // Keep last 50 completed jobs
    removeOnFail: 100, // Keep last 100 failed jobs
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
  },
});

// Certificate generation job data interface
export interface CertificateJobData {
  jobId: string;
  webinarId: string;
  userId: string;
  attendeeData: {
    name: string;
    email: string;
    totalDuration: number;
    joinTime: Date;
  };
  priority?: "low" | "normal" | "high" | "urgent";
}

// Batch certificate generation job data
export interface BatchCertificateJobData {
  jobId: string;
  webinarId: string;
  attendeesList: Array<{
    userId: string;
    name: string;
    email: string;
    totalDuration: number;
    joinTime: Date;
  }>;
  batchSize?: number;
  delayBetweenJobs?: number; // milliseconds
}

// Process individual certificate generation
certificateQueue.process("generate-single-certificate", 5, async (job) => {
  const { jobId, webinarId, userId, attendeeData } =
    job.data as CertificateJobData;

  logInfo(
    `Processing certificate generation for user ${userId} in webinar ${webinarId}`
  );

  try {
    // Update job status in database
    await CertificateJob.findByIdAndUpdate(jobId, {
      status: "processing",
      startedAt: new Date(),
    });

    // Fetch webinar and user data
    const webinar = await require("../models/Webinar.model")
      .default.findById(webinarId)
      .populate("hostId", "firstName lastName");

    if (!webinar) {
      throw new Error(`Webinar ${webinarId} not found`);
    }

    const user = await require("../models/User.model").default.findById(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    // Generate unique certificate number
    const certificateNumber = await generateCertificateNumber(
      webinar.title,
      userId
    );

    // Prepare certificate data
    const certificateData: CertificateData = {
      attendeeName: attendeeData.name,
      webinarTitle: webinar.title,
      completionDate: new Date().toISOString(),
      certificateNumber,
      customFields: {
        webinar_date: new Date(webinar.date).toLocaleDateString(),
        host_name: webinar.hostId
          ? `${webinar.hostId.firstName} ${webinar.hostId.lastName}`
          : "Unknown Host",
        duration_attended: `${attendeeData.totalDuration} minutes`,
        completion_percentage: `${Math.round(
          (attendeeData.totalDuration / (webinar.duration || 60)) * 100
        )}%`,
      },
    };

    // Generate certificate
    const startTime = Date.now();
    const result = await generateCertificate({
      webinar,
      certificateData,
      userId,
      uploadToCloudinary: true,
    });

    if (!result.success) {
      throw new Error(`Certificate generation failed: ${result.error}`);
    }

    // Save generated certificate to database
    const generatedCert = new GeneratedCertificate({
      webinarId,
      userId,
      certificateNumber,
      templateUsed: webinar.certificateTemplate || "default",
      certificateUrl: result.cloudinaryUrl!,
      thumbnailUrl: result.cloudinaryUrl!.replace(
        "/upload/",
        "/upload/w_300,h_200,c_fit/"
      ),
      publicId: `cert_${webinarId}_${userId}_${Date.now()}`,
      fieldData: certificateData.customFields,
      generatedAt: new Date(),
      metadata: {
        generationDuration: Date.now() - startTime,
        templateVersion: "1.0",
        ipAddress:
          (job.opts?.priority as any) === "urgent"
            ? "system-generated"
            : undefined,
      },
    });

    await generatedCert.save();

    // Send email with certificate
    try {
      await sendCertificateEmail({
        to: attendeeData.email,
        recipientName: attendeeData.name,
        webinarTitle: webinar.title,
        certificateNumber,
        certificateAttachment: result.cloudinaryUrl,
      });

      // Mark email as sent
      generatedCert.emailSent = true;
      generatedCert.emailSentAt = new Date();
      await generatedCert.save();

      logInfo(`Certificate email sent successfully to ${attendeeData.email}`);
    } catch (emailError) {
      logError("Failed to send certificate email:", emailError as Error);
      // Don't fail the job if email sending fails
    }

    // Update job status
    await CertificateJob.findByIdAndUpdate(jobId, {
      status: "completed",
      completedAt: new Date(),
      $push: {
        results: {
          userId,
          status: "success",
          certificateId: generatedCert._id,
          processedAt: new Date(),
        },
      },
      $inc: { "progress.completed": 1 },
    });

    logInfo(`Certificate generated successfully for user ${userId}`);

    return {
      success: true,
      certificateId: generatedCert._id,
      certificateUrl: result.cloudinaryUrl,
    };
  } catch (error) {
    logError(
      `Certificate generation failed for user ${userId}:`,
      error as Error
    );

    // Update job with error
    await CertificateJob.findByIdAndUpdate(jobId, {
      status: "failed",
      errorMessage: (error as Error).message,
      completedAt: new Date(),
      $push: {
        results: {
          userId,
          status: "failed",
          error: (error as Error).message,
          processedAt: new Date(),
        },
      },
      $inc: { "progress.failed": 1 },
    });

    throw error;
  }
});

// Process batch certificate generation
certificateQueue.process("generate-batch-certificates", 1, async (job) => {
  const {
    jobId,
    webinarId,
    attendeesList,
    batchSize = 10,
    delayBetweenJobs = 1000,
  } = job.data as BatchCertificateJobData;

  logInfo(
    `Processing batch certificate generation for ${attendeesList.length} attendees`
  );

  try {
    await CertificateJob.findByIdAndUpdate(jobId, {
      status: "processing",
      startedAt: new Date(),
      "progress.total": attendeesList.length,
    });

    // Process in batches to avoid overwhelming the system
    for (let i = 0; i < attendeesList.length; i += batchSize) {
      const batch = attendeesList.slice(i, i + batchSize);

      // Process each batch member
      const batchPromises = batch.map(async (attendee) => {
        try {
          const singleJob = await certificateQueue.add(
            "generate-single-certificate",
            {
              jobId,
              webinarId,
              userId: attendee.userId,
              attendeeData: attendee,
            },
            {
              priority: 1, // Use number instead of string
              delay: Math.random() * delayBetweenJobs, // Randomize to spread load
            }
          );

          return { success: true, jobId: singleJob.id };
        } catch (error) {
          logError(
            `Failed to queue certificate for user ${attendee.userId}:`,
            error as Error
          );
          return { success: false, error: (error as Error).message };
        }
      });

      await Promise.allSettled(batchPromises);

      // Update progress
      await CertificateJob.findByIdAndUpdate(jobId, {
        $inc: { "progress.completed": batch.length },
      });

      // Delay between batches if not the last batch
      if (i + batchSize < attendeesList.length) {
        await new Promise((resolve) => setTimeout(resolve, delayBetweenJobs));
      }

      // Update job progress
      job.progress(
        Math.round(((i + batch.length) / attendeesList.length) * 100)
      );
    }

    await CertificateJob.findByIdAndUpdate(jobId, {
      status: "completed",
      completedAt: new Date(),
    });

    logInfo(`Batch certificate generation completed for webinar ${webinarId}`);

    return { success: true, processed: attendeesList.length };
  } catch (error) {
    logError(`Batch certificate generation failed:`, error as Error);

    await CertificateJob.findByIdAndUpdate(jobId, {
      status: "failed",
      errorMessage: (error as Error).message,
      completedAt: new Date(),
    });

    throw error;
  }
});

// Helper function to generate unique certificate numbers
async function generateCertificateNumber(
  webinarTitle: string,
  userId: string
): Promise<string> {
  const prefix = webinarTitle.replace(/\s+/g, "").toUpperCase().substring(0, 8);
  const timestamp = Date.now().toString().slice(-6);
  const userSuffix = userId.substring(0, 4).toUpperCase();

  let certificateNumber = `${prefix}-${timestamp}-${userSuffix}`;

  // Ensure uniqueness
  let counter = 1;
  while (await GeneratedCertificate.findOne({ certificateNumber })) {
    certificateNumber = `${prefix}-${timestamp}-${userSuffix}-${counter}`;
    counter++;
  }

  return certificateNumber;
}

// Add queue monitoring events
certificateQueue.on("completed", (job) => {
  logInfo(`Certificate job ${job.id} completed successfully`);
});

certificateQueue.on("failed", (job, err) => {
  logError(`Certificate job ${job.id} failed:`, err);
});

certificateQueue.on("stalled", (job) => {
  logError(`Certificate job ${job.id} stalled`);
});

// Queue management functions
export async function addSingleCertificateJob(
  webinarId: string,
  userId: string,
  attendeeData: any,
  priority: "low" | "normal" | "high" | "urgent" = "normal"
): Promise<string> {
  // Create job record in database
  const job = new CertificateJob({
    webinarId,
    jobType: "single",
    priority,
    attendeeIds: [userId],
    progress: { total: 1, completed: 0, failed: 0 },
    createdBy: userId, // or get from context
  });

  await job.save();

  // Add to queue
  const bullJob = await certificateQueue.add(
    "generate-single-certificate",
    {
      jobId: (job._id as any).toString(),
      webinarId,
      userId,
      attendeeData,
      priority,
    },
    {
      priority: priority === "urgent" ? 10 : priority === "high" ? 5 : 0,
    }
  );

  return (job._id as any).toString();
}

export async function addBatchCertificateJob(
  webinarId: string,
  attendeesList: any[],
  options: {
    batchSize?: number;
    delayBetweenJobs?: number;
    priority?: "low" | "normal" | "high" | "urgent";
  } = {}
): Promise<string> {
  const {
    batchSize = 10,
    delayBetweenJobs = 1000,
    priority = "normal",
  } = options;

  // Create job record in database
  const job = new CertificateJob({
    webinarId,
    jobType: "batch",
    priority,
    attendeeIds: attendeesList.map((a) => a.userId),
    progress: { total: attendeesList.length, completed: 0, failed: 0 },
    createdBy: attendeesList[0]?.userId, // or get from context
  });

  await job.save();

  // Add to queue
  const bullJob = await certificateQueue.add(
    "generate-batch-certificates",
    {
      jobId: (job._id as any).toString(),
      webinarId,
      attendeesList,
      batchSize,
      delayBetweenJobs,
    },
    {
      priority: priority === "urgent" ? 10 : priority === "high" ? 5 : 0,
    }
  );

  return (job._id as any).toString();
}

// Get job status
export async function getCertificateJobStatus(jobId: string) {
  const job = await CertificateJob.findById(jobId);
  if (!job) {
    throw new Error("Job not found");
  }

  const bullJob = await certificateQueue.getJob(jobId);

  return {
    id: job._id,
    status: job.status,
    progress: job.progress,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    errorMessage: job.errorMessage,
    results: job.results,
    queuePosition: bullJob ? await bullJob.getState() : null,
  };
}

// Clean up old jobs
export async function cleanupOldJobs(daysOld: number = 30) {
  const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

  await CertificateJob.deleteMany({
    status: { $in: ["completed", "failed"] },
    completedAt: { $lt: cutoffDate },
  });

  // Clean Bull queue as well
  await certificateQueue.clean(daysOld * 24 * 60 * 60 * 1000, "completed");
  await certificateQueue.clean(daysOld * 24 * 60 * 60 * 1000, "failed");
}
