// controllers/webinarController.ts
import { Request, Response } from "express";
import { sendMail } from "../utils/mailer";

export const inviteWebinarParticipant = async (req: Request, res: Response) => {
  const { emails, title, date, link } = req.body;
  try {
    if (!emails || !title || !date || !link) {
      return res.status(400).json({ success: false, msg: "Missing required fields" });
    }

    const emailList = Array.isArray(emails) ? emails : [emails];
    const sendResults: {
      email: string;
      status: "sent" | "failed";
      id?: string | null;
      error?: string;
    }[] = [];

    for (const email of emailList) {
      const subject = `You're invited to: ${title}`;
      const html = `
        <div>
          <p>Hello,</p>
          <p>You are invited to attend the webinar titled <strong>${title}</strong>.</p>
          <p><strong>Date:</strong> ${date}</p>
          <p><strong>Join Link:</strong> <a href="${link}">${link}</a></p>
          <p>We hope to see you there!</p>
          <p>– Change Networks Team</p>
        </div>
      `;

      try {
        const response = await sendMail({ to: email, subject, html });
        sendResults.push({ email, status: "sent" });
      } catch (err: any) {
        console.error(`Failed to send invitation to ${email}:`, err.message);
        sendResults.push({ email, status: "failed", error: err.message });
      }
    }

    const allFailed = sendResults.every(result => result.status === "failed");
    const anyFailed = sendResults.some(result => result.status === "failed");

    if (allFailed) {
      return res.status(500).json({
        success: false,
        msg: "Failed to send invitations to all recipients.",
        results: sendResults
      });
    }

    if (anyFailed) {
      return res.status(207).json({
        success: false,
        msg: "Some invitations failed to send.",
        results: sendResults
      });
    }

    return res.status(200).json({
      success: true,
      msg: "All invitations sent successfully.",
      results: sendResults
    });
  } catch (error: any) {
    console.error("Unexpected error in inviteWebinarParticipant:", error.message);
    return res.status(500).json({ success: false, msg: "Internal server error" });
  }
};
