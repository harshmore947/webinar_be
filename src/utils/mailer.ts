import nodemailer from "nodemailer";

// Create reusable transporter object using SMTP transport
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_SECURE === "true", // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: {
      rejectUnauthorized: false, // For self-signed certificates
    },
  });
};

export async function sendMail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  try {
    // Validate email address format
    if (!to || !validateEmail(to)) {
      throw new Error(`Invalid email address: ${to}`);
    }

    // Validate other required fields
    if (!subject) {
      throw new Error("Email subject cannot be empty");
    }

    if (!html) {
      throw new Error("Email content cannot be empty");
    }

    // Create transporter
    const transporter = createTransporter();

    // Send email
    const response = await transporter.sendMail({
      from: `${process.env.EMAIL_FROM_NAME || "Change Networks"} <${
        process.env.EMAIL_FROM || process.env.SMTP_USER
      }>`,
      to,
      subject,
      html,
    });

    // Log success
    console.log(`Email sent to ${to} with subject: ${subject}`, {
      messageId: response.messageId,
      accepted: response.accepted,
      rejected: response.rejected,
    });
    return response;
  } catch (error) {
    console.error("Failed to send email:", error);
    throw error; // Re-throw to allow caller to handle
  }
}

// Simple email validation helper
function validateEmail(email: string): boolean {
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern.test(email);
}

// Send certificate completion email
export async function sendCertificateEmail({
  to,
  recipientName,
  webinarTitle,
  certificateNumber,
  certificateAttachment,
}: {
  to: string;
  recipientName: string;
  webinarTitle: string;
  certificateNumber: string;
  certificateAttachment?: string; // URL to certificate image
}) {
  const subject = `🎓 Your Certificate for ${webinarTitle}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
      <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
          <td align="center" style="padding: 40px 0;">
            <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <!-- Header -->
              <tr>
                <td style="padding: 40px 30px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px 8px 0 0;">
                  <h1 style="margin: 0; color: #ffffff; font-size: 28px;">🎓 Congratulations!</h1>
                </td>
              </tr>
              <!-- Body -->
              <tr>
                <td style="padding: 40px 30px;">
                  <p style="margin: 0 0 20px 0; font-size: 16px; color: #333333;">Hi ${recipientName},</p>
                  <p style="margin: 0 0 20px 0; font-size: 16px; color: #333333; line-height: 1.6;">
                    Thank you for attending <strong style="color: #667eea;">${webinarTitle}</strong>. 
                    We're pleased to present you with your certificate of completion!
                  </p>
                  <div style="background-color: #f8f9fa; border-left: 4px solid #667eea; padding: 20px; margin: 30px 0; border-radius: 4px;">
                    <p style="margin: 0; font-size: 14px; color: #666;">
                      <strong>Certificate Number:</strong><br/>
                      <span style="font-size: 18px; color: #333; font-family: monospace;">${certificateNumber}</span>
                    </p>
                  </div>
                  ${certificateAttachment ? `
                  <table role="presentation" style="width: 100%; margin: 30px 0;">
                    <tr>
                      <td align="center">
                        <a href="${certificateAttachment}" 
                           style="display: inline-block; padding: 14px 32px; background-color: #667eea; color: #ffffff; 
                                  text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
                          Download Your Certificate
                        </a>
                      </td>
                    </tr>
                  </table>
                  ` : ''}
                  <p style="margin: 30px 0 0 0; font-size: 14px; color: #666; line-height: 1.6;">
                    You can also access your certificate anytime from your dashboard. 
                    Keep it safe for your professional records!
                  </p>
                </td>
              </tr>
              <!-- Footer -->
              <tr>
                <td style="padding: 30px; background-color: #f8f9fa; border-radius: 0 0 8px 8px; text-align: center;">
                  <p style="margin: 0 0 10px 0; font-size: 14px; color: #666;">
                    Best regards,<br/>
                    <strong>${process.env.EMAIL_FROM_NAME || "Change Networks"} Team</strong>
                  </p>
                  <p style="margin: 10px 0 0 0; font-size: 12px; color: #999;">
                    This certificate is a testament to your dedication and learning.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  try {
    // Create transporter
    const transporter = createTransporter();

    // Send email with certificate URL (no attachment, just link)
    const response = await transporter.sendMail({
      from: `${process.env.EMAIL_FROM_NAME || "Change Networks"} <${
        process.env.EMAIL_FROM || process.env.SMTP_USER
      }>`,
      to,
      subject,
      html,
    });

    console.log(
      `Certificate email sent to ${to} for webinar: ${webinarTitle}`,
      {
        messageId: response.messageId,
        accepted: response.accepted,
        rejected: response.rejected,
      }
    );

    return response;
  } catch (error) {
    console.error("Failed to send certificate email:", error);
    throw error;
  }
}

// Test email configuration
export async function testEmailConnection() {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    console.log("✅ Email server connection verified successfully");
    return { success: true, message: "Email configuration is working" };
  } catch (error) {
    console.error("❌ Email server connection failed:", error);
    return { success: false, message: `Email configuration failed: ${error}` };
  }
}

// Send a test email
export async function sendTestEmail(to: string) {
  const subject = "Test Email from Your Webinar Platform";
  const html = `
    <h2>🎉 Email Configuration Test</h2>
    <p>If you received this email, your Gmail SMTP configuration is working correctly!</p>
    <p>Sent at: ${new Date().toLocaleString()}</p>
    <hr>
    <p style="color: #666; font-size: 12px;">This is a test email from your webinar platform.</p>
  `;

  return sendMail({ to, subject, html });
}

// Simplified certificate email sender (for dynamic certificate system)
export async function sendCertificateEmailSimple(
  to: string,
  recipientName: string,
  webinarTitle: string,
  certificateUrl: string
) {
  const subject = `Your Certificate for ${webinarTitle}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>🎓 Congratulations ${recipientName}!</h2>
      <p>Thank you for attending <strong>${webinarTitle}</strong>.</p>
      <p>Your certificate of completion is ready!</p>
      <p style="margin: 30px 0;">
        <a href="${certificateUrl}" 
           style="background-color: #4CAF50; color: white; padding: 12px 24px; 
                  text-decoration: none; border-radius: 4px; display: inline-block;">
          Download Certificate
        </a>
      </p>
      <p style="color: #666; font-size: 14px;">
        You can also access your certificate anytime from your dashboard.
      </p>
      <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
      <p style="color: #999; font-size: 12px;">
        Best regards,<br/>
        ${process.env.EMAIL_FROM_NAME || "Change Networks"} Team
      </p>
    </div>
  `;

  return sendMail({ to, subject, html });
}
