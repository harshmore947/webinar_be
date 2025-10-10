import { Router } from "express";
import { authenticateJWT } from "../middleware/auth.middleware";
import { uploadWebinarRecording } from "../middleware/upload.middleware";
import {
  uploadRecording,
  deleteRecording,
  getRecording,
  updateRecordingSettings,
} from "../controller/recording.controller";

const router = Router();

// Protected routes
router.use(authenticateJWT);

router.post("/:webinarId/upload", uploadWebinarRecording, uploadRecording);
router.delete("/:webinarId", deleteRecording);
router.get("/:webinarId", getRecording);
router.put("/:webinarId/settings", updateRecordingSettings);

export default router;
