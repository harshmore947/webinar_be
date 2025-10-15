import { setImmediate as scheduleImmediate } from "timers";
import { Types } from "mongoose";
import { v4 as uuidv4 } from "uuid";
import {
  createCanvas,
  loadImage,
  registerFont,
  CanvasRenderingContext2D,
  Image,
} from "canvas";
import WebinarModel, {
  IWebinar,
  IWebinarCertificateTemplate,
  IWebinarEnrolledUser,
} from "../models/Webinar.model";
import UserModel from "../models/User.model";
import { uploadGeneratedCertificate } from "../utils/cloudinaryService";
import cloudinary from "../utils/cloudinaryService";
import { logError, logInfo } from "../utils/logger";
import { sendCertificateEmail } from "../utils/mailer";

const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = [500, 1500, 3000];

const DEFAULT_FONT_FAMILY = "Arial";

interface GenerationOptions {
  startAsync?: boolean;
  userIds?: string[];
  sendEmail?: boolean;
}

interface RunContext {
  webinarId: string;
  runId: string;
  template: IWebinarCertificateTemplate;
  templateImageUrl: string;
  templateImage?: Image;
  sendEmail: boolean;
  targetUserIds?: Set<string>;
}

interface FieldValueContext {
  webinar: IWebinar;
  enrollment: IWebinarEnrolledUser;
  certificateNumber: string;
  customFields?: Record<string, any>;
}

registerFontIfAvailable();

export async function generateCertificatesForWebinar(
  webinarId: string,
  options: GenerationOptions = {}
): Promise<{ status: string; runId?: string; message?: string } | { status: string }> {
  const runId = uuidv4();
  const startAsync = options.startAsync !== false;

  const locked = await acquireGenerationLock(webinarId, runId);
  if (!locked) {
    return { status: "already_running", message: "Generation already in progress" };
  }

  if (startAsync) {
    scheduleImmediate(() =>
      runGenerationLoop(webinarId, runId, {
        userIds: options.userIds,
        sendEmail: options.sendEmail !== false,
      }).catch((error) => {
        logError(`Certificate generation run ${runId} failed`, error as Error);
      })
    );

    return {
      status: "started",
      runId,
      message: "Generation started",
    };
  }

  await runGenerationLoop(webinarId, runId, {
    userIds: options.userIds,
    sendEmail: options.sendEmail !== false,
  });

  return { status: "completed", runId };
}

export async function generateCertificateForUser(
  webinarId: string,
  userId: string,
  options: { startAsync?: boolean; sendEmail?: boolean } = {}
) {
  return generateCertificatesForWebinar(webinarId, {
    ...options,
    userIds: [userId],
  });
}

export async function getCertificateGenerationStatus(webinarId: string) {
  const webinar = await WebinarModel.findById(webinarId)
    .select("certificateGeneration enrolledUsers title")
    .lean();

  if (!webinar) {
    throw new Error("Webinar not found");
  }

  const total = webinar.enrolledUsers?.length || 0;
  const done = webinar.enrolledUsers?.filter(
    (entry) => entry?.cert?.status === "done"
  ).length || 0;
  const inProgress = webinar.enrolledUsers?.filter(
    (entry) => entry?.cert?.status === "in_progress"
  ).length || 0;
  const failed = webinar.enrolledUsers?.filter(
    (entry) => entry?.cert?.status === "failed"
  ).length || 0;

  return {
    total,
    done,
    in_progress: inProgress,
    failed,
    users:
      webinar.enrolledUsers?.map((entry) => ({
        userId: entry.userId?.toString(),
        name: entry.name,
        email: entry.email,
        cert: entry.cert,
      })) || [],
    lastRunId: webinar.certificateGeneration?.lastRunId,
    lastRunAt: webinar.certificateGeneration?.lastRunAt,
    lastStatus: webinar.certificateGeneration?.lastStatus,
    lastSummary: webinar.certificateGeneration?.lastSummary,
  };
}

async function runGenerationLoop(
  webinarId: string,
  runId: string,
  options: { userIds?: string[]; sendEmail: boolean }
) {
  logInfo(`Starting certificate generation run ${runId} for webinar ${webinarId}`);

  const webinar = await WebinarModel.findById(webinarId).lean<IWebinar>();
  if (!webinar) {
    logError(`Webinar ${webinarId} not found for certificate generation`, new Error("Webinar not found"));
    await finalizeRun(webinarId, runId, "failed");
    await releaseGenerationLock(webinarId);
    return;
  }

  if (!webinar.certificateTemplate || !webinar.certificateTemplate.cloudinaryTemplateId) {
    logInfo(`Webinar ${webinarId} has no certificate template, skipping.`);
    await finalizeRun(webinarId, runId, "failed", "Missing certificate template");
    await releaseGenerationLock(webinarId);
    return;
  }

  if (!webinar.enrolledUsers || webinar.enrolledUsers.length === 0) {
    logInfo(`Webinar ${webinarId} has no enrolled users, skipping certificate generation.`);
    await finalizeRun(webinarId, runId, "finished");
    await releaseGenerationLock(webinarId);
    return;
  }

  const targetUserIds = options.userIds ? new Set(options.userIds.map((id) => id.toString())) : undefined;

  const ctx: RunContext = {
    webinarId,
    runId,
    template: webinar.certificateTemplate,
    templateImageUrl: await resolveTemplateUrl(webinar.certificateTemplate),
    sendEmail: options.sendEmail,
    targetUserIds,
  };

  await WebinarModel.updateOne(
    { _id: webinarId },
    {
      $set: {
        "certificateGeneration.lock": true,
        "certificateGeneration.lastRunAt": new Date(),
        "certificateGeneration.lastRunId": runId,
        "certificateGeneration.lastStatus": "started",
      },
    }
  );

  try {
    const templateImage = await loadImage(ctx.templateImageUrl);
    ctx.templateImage = templateImage;

    for (const enrollment of webinar.enrolledUsers) {
      const userId = enrollment.userId?.toString();
      if (!userId) {
        continue;
      }

      if (ctx.targetUserIds && !ctx.targetUserIds.has(userId)) {
        continue;
      }

      if (enrollment.cert?.status === "done" && enrollment.cert.cloudinaryUrl) {
        continue; // already generated
      }

      await processEnrollment(webinar, enrollment, ctx);
    }

    await updateGenerationSummary(webinarId, runId);
    await finalizeRun(webinarId, runId, "finished");
  } catch (error) {
    logError(`Certificate generation run ${runId} failed`, error as Error);
    await finalizeRun(webinarId, runId, "failed", (error as Error).message);
  } finally {
    await releaseGenerationLock(webinarId);
  }
}

async function processEnrollment(
  webinar: IWebinar,
  enrollment: IWebinarEnrolledUser,
  ctx: RunContext
) {
  const userId = enrollment.userId?.toString();
  if (!userId) {
    return;
  }

  let currentAttempt = (enrollment.cert?.attempts ?? 0) + 1;
  const maxAttempts = MAX_RETRIES;

  while (currentAttempt <= maxAttempts) {
    await markUserInProgress(ctx.webinarId, userId, currentAttempt);

    try {
      const resolvedEnrollment = await ensureEnrollmentDetails(
        ctx.webinarId,
        enrollment,
        userId
      );
      const certificateNumber = generateCertificateNumber(webinar, userId);
      const fieldContext: FieldValueContext = {
        webinar,
        enrollment: resolvedEnrollment,
        certificateNumber,
        customFields: webinar.customFields || {},
      };

      const values = resolveFieldValues(fieldContext);
      const imageBuffer = await renderCertificate(ctx, values);
      const uploadResult = await uploadGeneratedCertificate(
        imageBuffer,
        ctx.webinarId,
        userId,
        certificateNumber
      );

      if (!uploadResult.success || !uploadResult.url) {
        throw new Error(uploadResult.error || "Failed to upload certificate");
      }

      await markUserDone(
        ctx.webinarId,
        userId,
        uploadResult.publicId || "",
        uploadResult.url,
        certificateNumber
      );

      if (ctx.sendEmail && resolvedEnrollment.email) {
        await safeSendCertificateEmail(
          resolvedEnrollment,
          webinar,
          uploadResult.url,
          certificateNumber
        );
      }

      return; // success
    } catch (error) {
      await handleUserFailure(ctx.webinarId, userId, currentAttempt, error as Error, maxAttempts);

      if (currentAttempt >= maxAttempts) {
        return;
      }

      await delay(RETRY_BACKOFF_MS[Math.min(currentAttempt - 1, RETRY_BACKOFF_MS.length - 1)]);
      currentAttempt += 1;
    }
  }
}

async function ensureEnrollmentDetails(
  webinarId: string,
  enrollment: IWebinarEnrolledUser,
  userId: string
): Promise<IWebinarEnrolledUser> {
  if (enrollment.name && enrollment.email) {
    return enrollment;
  }

  const user = await UserModel.findById(userId).lean();
  if (!user) {
    return enrollment;
  }

  const name = `${user.firstName || ""} ${user.lastName || ""}`.trim();

  await WebinarModel.updateOne(
    { _id: webinarId, "enrolledUsers.userId": user._id },
    {
      $set: {
        "enrolledUsers.$.name": name,
        "enrolledUsers.$.email": user.email,
      },
    }
  );

  return {
    ...enrollment,
    name,
    email: user.email,
    cert: enrollment.cert,
  };
}

async function renderCertificate(ctx: RunContext, values: Record<string, string>) {
  const { width, height, fields } = ctx.template;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  if (ctx.templateImage) {
    context.drawImage(ctx.templateImage, 0, 0, width, height);
  }

  for (const field of fields) {
    const rawValue = values[field.key] ?? field.defaultText ?? "";
    const value = rawValue?.toString() ?? "";

    if (!value) {
      continue;
    }

    drawTextField(context, field, value, width, height);
  }

  return canvas.toBuffer("image/png");
}

function drawTextField(
  ctx: CanvasRenderingContext2D,
  field: IWebinarCertificateTemplate["fields"][number],
  text: string,
  canvasWidth: number,
  canvasHeight: number
) {
  const fontFamily = field.fontFamily || DEFAULT_FONT_FAMILY;
  const fontSizePx = Math.round(field.fontSize || 16);
  ctx.save();
  ctx.font = `${fontSizePx}px ${fontFamily}`;
  ctx.fillStyle = field.color || "#000000";
  ctx.textBaseline = "middle";

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

  const x = field.x * canvasWidth;
  const y = field.y * canvasHeight;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function resolveFieldValues(ctx: FieldValueContext): Record<string, string> {
  const webinarDate = parseDateString(ctx.webinar.date);
  const dataTree: Record<string, any> = {
    user: {
      name: ctx.enrollment.name,
      email: ctx.enrollment.email,
      id: ctx.enrollment.userId?.toString(),
    },
    webinar: {
      title: ctx.webinar.title,
      description: ctx.webinar.description,
      date: webinarDate?.toLocaleDateString(),
      rawDate: ctx.webinar.date,
    },
    custom: {
      certId: ctx.certificateNumber,
      ...ctx.customFields,
    },
  };

  const resolved: Record<string, string> = {};

  for (const fieldKey of Object.keys(dataTree.custom)) {
    resolved[`custom.${fieldKey}`] = stringOrEmpty(dataTree.custom[fieldKey]);
  }

  return new Proxy(resolved, {
    get(target, prop: string) {
      if (prop in target) {
        return target[prop];
      }

      const value = getNestedValue(dataTree, prop);
      if (value === undefined || value === null) {
        return "";
      }

      const stringValue = stringOrEmpty(value);
      target[prop] = stringValue;
      return stringValue;
    },
  }) as Record<string, string>;
}

function getNestedValue(obj: Record<string, any>, path: string): unknown {
  const segments = path.split(".");
  let current: any = obj;

  for (const segment of segments) {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    current = current[segment];
  }

  return current;
}

function stringOrEmpty(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value);
}

async function markUserInProgress(webinarId: string, userId: string, attempt: number) {
  await WebinarModel.updateOne(
    { _id: webinarId, "enrolledUsers.userId": new Types.ObjectId(userId) },
    {
      $set: {
        "enrolledUsers.$.cert.status": "in_progress",
        "enrolledUsers.$.cert.attempts": attempt,
        "enrolledUsers.$.cert.lastError": null,
      },
    }
  );
}

async function markUserDone(
  webinarId: string,
  userId: string,
  cloudinaryPublicId: string,
  cloudinaryUrl: string,
  certificateNumber: string
) {
  await WebinarModel.updateOne(
    { _id: webinarId, "enrolledUsers.userId": new Types.ObjectId(userId) },
    {
      $set: {
        "enrolledUsers.$.cert.status": "done",
        "enrolledUsers.$.cert.cloudinaryPublicId": cloudinaryPublicId,
        "enrolledUsers.$.cert.cloudinaryUrl": cloudinaryUrl,
        "enrolledUsers.$.cert.generatedAt": new Date(),
        "enrolledUsers.$.cert.certificateNumber": certificateNumber,
      },
    }
  );
}

async function handleUserFailure(
  webinarId: string,
  userId: string,
  attempt: number,
  error: Error,
  maxAttempts: number
) {
  const status = attempt >= maxAttempts ? "failed" : "pending";
  const update: Record<string, any> = {
    $set: {
      "enrolledUsers.$.cert.status": status,
      "enrolledUsers.$.cert.lastError": sanitizeErrorMessage(error.message),
    },
  };

  if (status === "failed") {
    update.$set["enrolledUsers.$.cert.generatedAt"] = new Date();
  } else {
    update.$unset = { "enrolledUsers.$.cert.generatedAt": "" };
  }

  await WebinarModel.updateOne(
    { _id: webinarId, "enrolledUsers.userId": new Types.ObjectId(userId) },
    update
  );
}

function sanitizeErrorMessage(message: string) {
  return message.replace(/\s+/g, " ").trim().slice(0, 500);
}

async function updateGenerationSummary(webinarId: string, runId: string) {
  const webinar = await WebinarModel.findById(webinarId)
    .select("enrolledUsers")
    .lean<IWebinar>();

  if (!webinar) {
    return;
  }

  const total = webinar.enrolledUsers?.length || 0;
  const succeeded = webinar.enrolledUsers?.filter(
    (entry) => entry?.cert?.status === "done"
  ).length || 0;
  const failed = webinar.enrolledUsers?.filter(
    (entry) => entry?.cert?.status === "failed"
  ).length || 0;

  await WebinarModel.updateOne(
    { _id: webinarId },
    {
      $set: {
        "certificateGeneration.lastSummary": {
          total,
          succeeded,
          failed,
        },
        "certificateGeneration.lastRunId": runId,
      },
    }
  );
}

async function finalizeRun(
  webinarId: string,
  runId: string,
  status: "finished" | "failed",
  errorMessage?: string
) {
  const update: Record<string, any> = {
    "certificateGeneration.lastStatus": status,
    "certificateGeneration.lastRunId": runId,
  };

  if (status === "failed" && errorMessage) {
    update["certificateGeneration.lastSummary"] = {
      total: 0,
      succeeded: 0,
      failed: 0,
      error: sanitizeErrorMessage(errorMessage),
    };
  }

  await WebinarModel.updateOne(
    { _id: webinarId },
    {
      $set: update,
    }
  );
}

async function acquireGenerationLock(webinarId: string, runId: string) {
  await WebinarModel.updateOne(
    { _id: webinarId, certificateGeneration: { $exists: false } },
    {
      $set: {
        certificateGeneration: {
          lock: false,
          lastRunAt: null,
          lastSummary: { total: 0, succeeded: 0, failed: 0 },
          lastRunId: runId,
          lastStatus: "finished",
        },
      },
    }
  );

  const result = await WebinarModel.updateOne(
    { _id: webinarId, "certificateGeneration.lock": { $ne: true } },
    {
      $set: {
        "certificateGeneration.lock": true,
        "certificateGeneration.lastRunAt": new Date(),
        "certificateGeneration.lastRunId": runId,
        "certificateGeneration.lastStatus": "started",
      },
    }
  );

  return result.modifiedCount === 1;
}

async function releaseGenerationLock(webinarId: string) {
  await WebinarModel.updateOne(
    { _id: webinarId },
    {
      $set: {
        "certificateGeneration.lock": false,
      },
    }
  );
}

async function resolveTemplateUrl(template: IWebinarCertificateTemplate): Promise<string> {
  if (template.cloudinaryUrl) {
    return template.cloudinaryUrl;
  }

  return cloudinary.url(template.cloudinaryTemplateId, {
    secure: true,
    resource_type: "image",
  });
}

function generateCertificateNumber(webinar: IWebinar, userId: string) {
  const prefix = (webinar.title || "WEBINAR")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 6);
  const uid = userId.slice(-4).toUpperCase();
  const timestamp = Date.now().toString(36).toUpperCase();
  return `${prefix}-${uid}-${timestamp}`;
}

async function safeSendCertificateEmail(
  enrollment: IWebinarEnrolledUser,
  webinar: IWebinar,
  certificateUrl: string,
  certificateNumber: string
) {
  try {
    await sendCertificateEmail({
      to: enrollment.email,
      recipientName: enrollment.name || enrollment.email,
      webinarTitle: webinar.title,
      certificateNumber,
      certificateAttachment: certificateUrl,
    });
  } catch (error) {
    logError(`Failed to send certificate email to ${enrollment.email}`, error as Error);
  }
}

function parseDateString(value?: string) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function registerFontIfAvailable() {
  try {
    registerFont("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", {
      family: "DejaVu Sans",
    });
  } catch (error) {
    // ignore missing font errors; canvas will fallback to system fonts
  }
}
