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
  const subject = `🎓 Your Certificate for "${webinarTitle}"`;

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <title>Your Certificate of Completion</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f6f9fc;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" style="padding: 40px 20px;">
            <!-- Main Container -->
            <table role="presentation" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07);" cellpadding="0" cellspacing="0" border="0">
              
              <!-- Celebratory Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 50px 30px; text-align: center;">
                  <div style="font-size: 80px; margin-bottom: 20px; text-shadow: 0 4px 8px rgba(0,0,0,0.1);">🎓</div>
                  <h1 style="color: #ffffff; font-size: 36px; font-weight: 700; margin: 0 0 15px 0; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    Congratulations!
                  </h1>
                  <p style="color: #ffffff; font-size: 18px; margin: 0; opacity: 0.95; font-weight: 500;">
                    You've earned your certificate
                  </p>
                </td>
              </tr>

              <!-- Content -->
              <tr>
                <td style="padding: 40px 30px;">
                  <p style="font-size: 18px; color: #2d3748; margin: 0 0 20px 0;">
                    Dear <strong>${recipientName}</strong>,
                  </p>
                  
                  <p style="font-size: 16px; color: #4a5568; margin: 0 0 25px 0; line-height: 1.7;">
                    We're delighted to present you with your certificate of completion! 
                    Thank you for your participation in <strong style="color: #667eea;">"${webinarTitle}"</strong>. 
                    Your dedication to learning is truly commendable.
                  </p>

                  <!-- Certificate Info Card -->
                  <div style="background: linear-gradient(135deg, #f6f9fc 0%, #ffffff 100%); border-left: 4px solid #667eea; border-radius: 12px; padding: 25px; margin: 30px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding-bottom: 15px;">
                          <p style="margin: 0; font-size: 12px; color: #718096; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">
                            📜 Certificate Details
                          </p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 15px 0; border-top: 1px solid #e2e8f0;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="font-size: 14px; color: #718096; padding: 8px 0;">Webinar Title:</td>
                              <td style="font-size: 14px; color: #2d3748; font-weight: 600; text-align: right; padding: 8px 0;">${webinarTitle}</td>
                            </tr>
                            <tr>
                              <td style="font-size: 14px; color: #718096; padding: 8px 0;">Certificate Number:</td>
                              <td style="font-size: 14px; color: #667eea; font-weight: 700; text-align: right; font-family: 'Courier New', monospace; padding: 8px 0;">${certificateNumber}</td>
                            </tr>
                            <tr>
                              <td style="font-size: 14px; color: #718096; padding: 8px 0;">Issued Date:</td>
                              <td style="font-size: 14px; color: #2d3748; font-weight: 600; text-align: right; padding: 8px 0;">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </div>

                  ${certificateAttachment ? `
                  <!-- Certificate Preview -->
                  <div style="margin: 30px 0; text-align: center;">
                    <div style="background-color: #f8f9fa; border-radius: 12px; padding: 20px; margin-bottom: 25px;">
                      <img src="${certificateAttachment}" 
                           alt="Certificate Preview" 
                           style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                    </div>
                  </div>

                  <!-- Download Button -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 30px 0;">
                    <tr>
                      <td align="center">
                        <a href="${certificateAttachment}" 
                           style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);">
                          📥 Download Your Certificate
                        </a>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="padding-top: 15px;">
                        <p style="margin: 0; font-size: 13px; color: #718096;">
                          You can also access your certificate anytime from your dashboard
                        </p>
                      </td>
                    </tr>
                  </table>
                  ` : ''}

                  <!-- Benefits Card -->
                  <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; border-radius: 8px; padding: 20px; margin: 30px 0;">
                    <h3 style="margin: 0 0 15px 0; font-size: 18px; color: #2d3748; font-weight: 700;">
                      ✨ What's Next?
                    </h3>
                    <ul style="margin: 0; padding-left: 20px; color: #4a5568; font-size: 14px; line-height: 1.8;">
                      <li>Add this certificate to your LinkedIn profile</li>
                      <li>Include it in your professional portfolio</li>
                      <li>Share your achievement on social media</li>
                      <li>Explore more webinars to expand your skills</li>
                    </ul>
                  </div>

                  <!-- Verification Info -->
                  <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 8px; padding: 20px; margin: 30px 0;">
                    <p style="margin: 0 0 10px 0; font-size: 14px; color: #2d3748; font-weight: 600;">
                      🔐 Certificate Verification
                    </p>
                    <p style="margin: 0; font-size: 13px; color: #4a5568; line-height: 1.6;">
                      This certificate can be verified using the certificate number <strong>${certificateNumber}</strong>. 
                      Visit our <a href="${process.env.FRONTEND_URL || 'https://yourwebinar.com'}/verify" style="color: #667eea; text-decoration: none; font-weight: 600;">verification page</a> 
                      to authenticate this credential.
                    </p>
                  </div>

                  <!-- Social Share -->
                  <div style="text-align: center; margin: 35px 0;">
                    <p style="margin: 0 0 15px 0; font-size: 14px; color: #718096;">
                      🌟 Share your achievement
                    </p>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;">
                      <tr>
                        <td style="padding: 0 8px;">
                          <a href="#" style="display: inline-block; padding: 10px 20px; background-color: #0077b5; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 600;">
                            LinkedIn
                          </a>
                        </td>
                        <td style="padding: 0 8px;">
                          <a href="#" style="display: inline-block; padding: 10px 20px; background-color: #1da1f2; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 600;">
                            Twitter
                          </a>
                        </td>
                        <td style="padding: 0 8px;">
                          <a href="#" style="display: inline-block; padding: 10px 20px; background-color: #1877f2; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 600;">
                            Facebook
                          </a>
                        </td>
                      </tr>
                    </table>
                  </div>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e9ecef;">
                  <p style="margin: 0 0 15px 0; font-size: 16px; color: #2d3748; font-weight: 600;">
                    Keep up the great work! 🚀
                  </p>
                  <p style="margin: 0 0 20px 0; font-size: 14px; color: #718096; line-height: 1.6;">
                    Best regards,<br/>
                    <strong>${process.env.EMAIL_FROM_NAME || "Change Networks"} Team</strong>
                  </p>
                  <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 20px;">
                    <p style="margin: 0; font-size: 12px; color: #a0aec0;">
                      © ${new Date().getFullYear()} ${process.env.EMAIL_FROM_NAME || "Change Networks"}. All rights reserved.
                    </p>
                    <p style="margin: 10px 0 0 0; font-size: 12px; color: #a0aec0;">
                      This certificate is a testament to your dedication and learning journey.
                    </p>
                  </div>
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
