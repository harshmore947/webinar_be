import { Router, Request, Response } from "express";
import authRoutes from "./auth.routes";
import webinarRoutes from "./webinar.routes";
import notificationRoutes from "./notification.routes";
import adminRoutes from "./admin.routes";
import adminWebinarRoutes from "./adminWebinar.routes";
import dynamicCertificateRoutes from "./dynamicCertificate.routes";
import qaRoutes from "./qa.routes";
import recordingRoutes from "./recording.routes";
import { authenticateJWT } from "../middleware/auth.middleware";
import { uploadCertificateTemplate as uploadCertificateTemplateMiddleware } from "../middleware/upload.middleware";
import { uploadCertificateTemplate as uploadCertificateTemplateController } from "../controller/resourceUpload.controller";

const router = Router();

// Health check endpoint
router.get("/health", (req: Request, res: Response) => {
  const healthcheck = {
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: `${process.uptime().toFixed(2)}s`,
    memory: {
      heapUsed: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(
        2
      )}MB`,
      heapTotal: `${(process.memoryUsage().heapTotal / 1024 / 1024).toFixed(
        2
      )}MB`,
      external: `${(process.memoryUsage().external / 1024 / 1024).toFixed(
        2
      )}MB`,
      rss: `${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)}MB`,
    },
  };
  res.status(200).json(healthcheck);
});

// Performance metrics endpoint
router.get("/metrics", (req: Request, res: Response) => {
  const metrics = {
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    pid: process.pid,
    nodeVersion: process.version,
  };
  res.status(200).json(metrics);
});

// Upload certificate template to Cloudinary
router.post(
  "/upload-certificate-template",
  authenticateJWT,
  uploadCertificateTemplateMiddleware,
  uploadCertificateTemplateController
);

// Route modules
router.use("/", authRoutes);
router.use("/webinars", webinarRoutes);
router.use("/notifications", notificationRoutes);
router.use("/admin", adminRoutes);
router.use("/", adminWebinarRoutes);
router.use("/certificates", dynamicCertificateRoutes);
router.use("/qa", qaRoutes);
router.use("/recordings", recordingRoutes);

export default router;
