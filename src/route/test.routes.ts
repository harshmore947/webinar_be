import { Router, Request, Response } from "express";
import { testEmailConnection, sendTestEmail } from "../utils/mailer";
import { authenticateJWT } from "../middleware/auth.middleware";

const router = Router();

// Test email connection
router.get(
  "/email/connection",
  authenticateJWT,
  async (req: Request, res: Response) => {
    try {
      const result = await testEmailConnection();
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to test email connection",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// Send test email
router.post(
  "/email/send",
  authenticateJWT,
  async (req: Request, res: Response) => {
    try {
      const { to } = req.body;

      if (!to) {
        return res.status(400).json({
          success: false,
          message: "Email address is required",
        });
      }

      const result = await sendTestEmail(to);
      res.json({
        success: true,
        message: "Test email sent successfully",
        messageId: result.messageId,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to send test email",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

export default router;
