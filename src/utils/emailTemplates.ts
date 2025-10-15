interface WelcomeEmailData {
  firstName: string;
  role: string;
  email: string;
}

interface ReminderEmailData {
  firstName: string;
  webinarTitle: string;
  webinarDate: string;
  webinarDescription?: string;
  webinarUrl?: string;
}

// Base email styles for consistency
const baseStyles = {
  body: `
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    background-color: #f6f9fc;
    line-height: 1.6;
  `,
  container: `
    max-width: 600px;
    margin: 0 auto;
    background-color: #ffffff;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07);
  `,
  header: `
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    padding: 40px 30px;
    text-align: center;
  `,
  headerTitle: `
    color: #ffffff;
    font-size: 32px;
    font-weight: 700;
    margin: 0;
    text-shadow: 0 2px 4px rgba(0,0,0,0.1);
  `,
  content: `
    padding: 40px 30px;
  `,
  button: `
    display: inline-block;
    padding: 14px 32px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: #ffffff;
    text-decoration: none;
    border-radius: 8px;
    font-weight: 600;
    font-size: 16px;
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    transition: transform 0.2s;
  `,
  footer: `
    background-color: #f8f9fa;
    padding: 30px;
    text-align: center;
    border-top: 1px solid #e9ecef;
  `,
  card: `
    background: linear-gradient(135deg, #f6f9fc 0%, #ffffff 100%);
    border-left: 4px solid #667eea;
    border-radius: 8px;
    padding: 20px;
    margin: 25px 0;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  `,
};

export const generateWelcomeEmailTemplate = ({
  firstName,
  role,
  email,
}: WelcomeEmailData): string => {
  const roleInfo = {
    Host: {
      icon: '🎤',
      description: 'You can now create and manage webinars, engage with attendees, and grow your audience.',
      steps: [
        'Create your first webinar from the dashboard',
        'Customize your webinar settings and branding',
        'Invite participants and manage registrations',
        'Track analytics and engagement metrics',
      ],
    },
    Admin: {
      icon: '👑',
      description: 'You have full access to manage the platform, users, and all webinars.',
      steps: [
        'Access the admin dashboard',
        'Manage users and assign roles',
        'Monitor platform analytics',
        'Configure platform settings',
      ],
    },
    Presenter: {
      icon: '🎯',
      description: 'You can present in assigned webinars and share your expertise with attendees.',
      steps: [
        'Review your assigned webinars',
        'Prepare your presentation materials',
        'Test your audio and video setup',
        'Engage with the audience during sessions',
      ],
    },
    Moderator: {
      icon: '🛡️',
      description: 'You can help manage webinar sessions and ensure smooth interactions.',
      steps: [
        'Familiarize yourself with moderation tools',
        'Review assigned webinars',
        'Manage Q&A and chat interactions',
        'Assist hosts during live sessions',
      ],
    },
    Attendee: {
      icon: '🎓',
      description: 'You can join webinars, interact with hosts, and expand your knowledge.',
      steps: [
        'Browse upcoming webinars',
        'Enroll in topics that interest you',
        'Save webinars to your calendar',
        'Receive certificates upon completion',
      ],
    },
  };

  const info = roleInfo[role as keyof typeof roleInfo] || roleInfo.Attendee;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <title>Welcome to Change Networks</title>
      <!--[if mso]>
      <style type="text/css">
        body, table, td {font-family: Arial, Helvetica, sans-serif !important;}
      </style>
      <![endif]-->
    </head>
    <body style="${baseStyles.body}">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" style="padding: 40px 20px;">
            <!-- Main Container -->
            <table role="presentation" style="${baseStyles.container}" cellpadding="0" cellspacing="0" border="0">
              <!-- Header -->
              <tr>
                <td style="${baseStyles.header}">
                  <h1 style="${baseStyles.headerTitle}">
                    ${info.icon} Welcome to Change Networks!
                  </h1>
                  <p style="color: #ffffff; font-size: 16px; margin: 10px 0 0 0; opacity: 0.95;">
                    Empowering connections through knowledge
                  </p>
                </td>
              </tr>

              <!-- Content -->
              <tr>
                <td style="${baseStyles.content}">
                  <p style="font-size: 18px; color: #2d3748; margin: 0 0 20px 0;">
                    Hello <strong>${firstName}</strong>,
                  </p>
                  
                  <p style="font-size: 16px; color: #4a5568; margin: 0 0 25px 0; line-height: 1.7;">
                    Thank you for joining our webinar platform! We're thrilled to have you as part of our community. 
                    Your account has been successfully created and is ready to use.
                  </p>

                  <!-- Role Card -->
                  <div style="${baseStyles.card}">
                    <div style="display: flex; align-items: center; margin-bottom: 15px;">
                      <div style="font-size: 32px; margin-right: 15px;">${info.icon}</div>
                      <div>
                        <p style="margin: 0; font-size: 14px; color: #718096; text-transform: uppercase; letter-spacing: 0.5px;">
                          Your Role
                        </p>
                        <p style="margin: 5px 0 0 0; font-size: 24px; color: #2d3748; font-weight: 700;">
                          ${role}
                        </p>
                      </div>
                    </div>
                    <p style="margin: 0; font-size: 15px; color: #4a5568; line-height: 1.6;">
                      ${info.description}
                    </p>
                  </div>

                  <!-- Next Steps -->
                  <div style="margin: 35px 0;">
                    <h2 style="font-size: 22px; color: #2d3748; margin: 0 0 20px 0; font-weight: 700;">
                      🚀 Next Steps
                    </h2>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      ${info.steps.map((step, index) => `
                        <tr>
                          <td style="padding: 12px 0;">
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                              <tr>
                                <td style="width: 32px; height: 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-align: center; border-radius: 50%; font-weight: 700; vertical-align: middle;">
                                  ${index + 1}
                                </td>
                                <td style="padding-left: 15px; font-size: 15px; color: #4a5568; line-height: 1.5;">
                                  ${step}
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      `).join('')}
                    </table>
                  </div>

                  <!-- CTA Button -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 35px 0;">
                    <tr>
                      <td align="center">
                        <a href="${process.env.FRONTEND_URL || 'https://yourwebinar.com'}/dashboard" 
                           style="${baseStyles.button}">
                          Get Started Now →
                        </a>
                      </td>
                    </tr>
                  </table>

                  <!-- Account Info -->
                  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 30px 0;">
                    <p style="margin: 0 0 10px 0; font-size: 14px; color: #718096; font-weight: 600;">
                      📧 Account Email
                    </p>
                    <p style="margin: 0; font-size: 16px; color: #2d3748; font-family: 'Courier New', monospace;">
                      ${email}
                    </p>
                  </div>

                  <!-- Help Section -->
                  <div style="background-color: #fff5f5; border-left: 4px solid #fc8181; border-radius: 8px; padding: 20px; margin: 30px 0;">
                    <p style="margin: 0 0 10px 0; font-size: 16px; color: #2d3748; font-weight: 600;">
                      💡 Need Help?
                    </p>
                    <p style="margin: 0; font-size: 14px; color: #4a5568; line-height: 1.6;">
                      If you have any questions or need assistance, our support team is here to help. 
                      Visit our <a href="${process.env.FRONTEND_URL || 'https://yourwebinar.com'}/help" style="color: #667eea; text-decoration: none; font-weight: 600;">Help Center</a> 
                      or reply to this email.
                    </p>
                  </div>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="${baseStyles.footer}">
                  <p style="margin: 0 0 15px 0; font-size: 16px; color: #2d3748; font-weight: 600;">
                    Welcome aboard! 🎉
                  </p>
                  <p style="margin: 0 0 20px 0; font-size: 14px; color: #718096; line-height: 1.6;">
                    Best regards,<br/>
                    <strong>The Change Networks Team</strong>
                  </p>
                  <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 20px;">
                    <p style="margin: 0; font-size: 12px; color: #a0aec0;">
                      © ${new Date().getFullYear()} Change Networks. All rights reserved.
                    </p>
                    <p style="margin: 5px 0 0 0; font-size: 12px; color: #a0aec0;">
                      <a href="${process.env.FRONTEND_URL || 'https://yourwebinar.com'}/privacy" style="color: #a0aec0; text-decoration: none;">Privacy Policy</a> • 
                      <a href="${process.env.FRONTEND_URL || 'https://yourwebinar.com'}/terms" style="color: #a0aec0; text-decoration: none;">Terms of Service</a>
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
};

export const generateReminderEmailTemplate = ({
  firstName,
  webinarTitle,
  webinarDate,
  webinarDescription,
  webinarUrl,
}: ReminderEmailData): string => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <title>Webinar Reminder - ${webinarTitle}</title>
    </head>
    <body style="${baseStyles.body}">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" style="padding: 40px 20px;">
            <!-- Main Container -->
            <table role="presentation" style="${baseStyles.container}" cellpadding="0" cellspacing="0" border="0">
              <!-- Header -->
              <tr>
                <td style="${baseStyles.header}">
                  <h1 style="${baseStyles.headerTitle}">
                    ⏰ Webinar Starting Soon!
                  </h1>
                  <p style="color: #ffffff; font-size: 16px; margin: 10px 0 0 0; opacity: 0.95;">
                    Your session is about to begin
                  </p>
                </td>
              </tr>

              <!-- Content -->
              <tr>
                <td style="${baseStyles.content}">
                  <p style="font-size: 18px; color: #2d3748; margin: 0 0 20px 0;">
                    Hello <strong>${firstName}</strong>,
                  </p>
                  
                  <p style="font-size: 16px; color: #4a5568; margin: 0 0 30px 0; line-height: 1.7;">
                    This is a friendly reminder that your webinar is starting soon. We're excited to see you there!
                  </p>

                  <!-- Webinar Card -->
                  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; padding: 30px; margin: 30px 0; color: #ffffff;">
                    <div style="display: flex; align-items: center; margin-bottom: 20px;">
                      <div style="font-size: 40px; margin-right: 15px;">🎥</div>
                      <h2 style="margin: 0; font-size: 24px; font-weight: 700; color: #ffffff; line-height: 1.3;">
                        ${webinarTitle}
                      </h2>
                    </div>
                    
                    <!-- Date/Time -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 20px 0;">
                      <tr>
                        <td style="background-color: rgba(255, 255, 255, 0.2); border-radius: 8px; padding: 15px;">
                          <p style="margin: 0 0 5px 0; font-size: 12px; color: rgba(255,255,255,0.9); text-transform: uppercase; letter-spacing: 0.5px;">
                            📅 Date & Time
                          </p>
                          <p style="margin: 0; font-size: 18px; color: #ffffff; font-weight: 600;">
                            ${webinarDate}
                          </p>
                        </td>
                      </tr>
                    </table>

                    ${webinarDescription ? `
                    <div style="background-color: rgba(255, 255, 255, 0.15); border-radius: 8px; padding: 15px; margin: 15px 0;">
                      <p style="margin: 0 0 8px 0; font-size: 12px; color: rgba(255,255,255,0.9); text-transform: uppercase; letter-spacing: 0.5px;">
                        📝 Description
                      </p>
                      <p style="margin: 0; font-size: 14px; color: #ffffff; line-height: 1.6; opacity: 0.95;">
                        ${webinarDescription}
                      </p>
                    </div>
                    ` : ''}
                  </div>

                  <!-- Preparation Tips -->
                  <div style="background-color: #fff5f5; border-left: 4px solid #fc8181; border-radius: 8px; padding: 20px; margin: 30px 0;">
                    <h3 style="margin: 0 0 15px 0; font-size: 18px; color: #2d3748; font-weight: 700;">
                      🎯 Quick Preparation Tips
                    </h3>
                    <ul style="margin: 0; padding-left: 20px; color: #4a5568; font-size: 14px; line-height: 1.8;">
                      <li>Join 5-10 minutes early to test your audio and video</li>
                      <li>Ensure you have a stable internet connection</li>
                      <li>Find a quiet environment with minimal distractions</li>
                      <li>Prepare any questions you'd like to ask</li>
                      <li>Have a notepad ready for key takeaways</li>
                    </ul>
                  </div>

                  <!-- CTA Button -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 35px 0;">
                    <tr>
                      <td align="center">
                        <a href="${webinarUrl || process.env.FRONTEND_URL || 'https://yourwebinar.com'}" 
                           style="${baseStyles.button}; font-size: 18px; padding: 16px 40px;">
                          🚀 Join Webinar Now
                        </a>
                        <p style="margin: 15px 0 0 0; font-size: 13px; color: #718096;">
                          Click the button above or copy this link:<br/>
                          <a href="${webinarUrl || process.env.FRONTEND_URL || 'https://yourwebinar.com'}" 
                             style="color: #667eea; text-decoration: none; word-break: break-all;">
                            ${webinarUrl || process.env.FRONTEND_URL || 'https://yourwebinar.com'}
                          </a>
                        </p>
                      </td>
                    </tr>
                  </table>

                  <!-- Calendar Integration -->
                  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 30px 0; text-align: center;">
                    <p style="margin: 0 0 10px 0; font-size: 14px; color: #718096;">
                      📆 Add to your calendar to stay reminded
                    </p>
                    <p style="margin: 0; font-size: 12px; color: #a0aec0;">
                      <a href="#" style="color: #667eea; text-decoration: none; margin: 0 8px;">Google Calendar</a> • 
                      <a href="#" style="color: #667eea; text-decoration: none; margin: 0 8px;">Outlook</a> • 
                      <a href="#" style="color: #667eea; text-decoration: none; margin: 0 8px;">iCal</a>
                    </p>
                  </div>

                  <!-- Support Info -->
                  <div style="background-color: #ebf8ff; border-left: 4px solid #4299e1; border-radius: 8px; padding: 20px; margin: 30px 0;">
                    <p style="margin: 0 0 10px 0; font-size: 14px; color: #2d3748; font-weight: 600;">
                      💬 Need Assistance?
                    </p>
                    <p style="margin: 0; font-size: 13px; color: #4a5568; line-height: 1.6;">
                      If you're experiencing any technical difficulties or have questions, 
                      our support team is standing by to help. Simply reply to this email or 
                      visit our <a href="${process.env.FRONTEND_URL || 'https://yourwebinar.com'}/support" style="color: #4299e1; text-decoration: none; font-weight: 600;">Support Center</a>.
                    </p>
                  </div>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="${baseStyles.footer}">
                  <p style="margin: 0 0 15px 0; font-size: 16px; color: #2d3748; font-weight: 600;">
                    See you soon! 👋
                  </p>
                  <p style="margin: 0 0 20px 0; font-size: 14px; color: #718096; line-height: 1.6;">
                    Best regards,<br/>
                    <strong>The Change Networks Team</strong>
                  </p>
                  <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 20px;">
                    <p style="margin: 0; font-size: 12px; color: #a0aec0;">
                      © ${new Date().getFullYear()} Change Networks. All rights reserved.
                    </p>
                    <p style="margin: 5px 0 0 0; font-size: 12px; color: #a0aec0;">
                      <a href="${process.env.FRONTEND_URL || 'https://yourwebinar.com'}/unsubscribe" style="color: #a0aec0; text-decoration: none;">Unsubscribe</a> • 
                      <a href="${process.env.FRONTEND_URL || 'https://yourwebinar.com'}/preferences" style="color: #a0aec0; text-decoration: none;">Email Preferences</a>
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
};

// Payment Confirmation Email Template
export const generatePaymentConfirmationEmailTemplate = ({
  recipientName,
  webinarTitle,
  amount,
  currency = 'USD',
  paymentDate,
  paymentId,
  webinarDate,
  webinarStartTime,
  webinarEndTime,
  webinarDescription,
}: {
  recipientName: string;
  webinarTitle: string;
  amount: number;
  currency?: string;
  paymentDate: Date;
  paymentId: string;
  webinarDate: Date;
  webinarStartTime: string;
  webinarEndTime: string;
  webinarDescription?: string;
}) => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <title>Payment Confirmation</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f6f9fc;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" style="padding: 40px 20px;">
            <!-- Main Container -->
            <table role="presentation" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07);" cellpadding="0" cellspacing="0" border="0">
              
              <!-- Success Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 50px 30px; text-align: center;">
                  <div style="font-size: 80px; margin-bottom: 20px; text-shadow: 0 4px 8px rgba(0,0,0,0.1);">✅</div>
                  <h1 style="color: #ffffff; font-size: 36px; font-weight: 700; margin: 0 0 15px 0; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    Payment Successful!
                  </h1>
                  <p style="color: #ffffff; font-size: 18px; margin: 0; opacity: 0.95; font-weight: 500;">
                    You're all set for the webinar
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
                    Thank you for your payment! Your enrollment for <strong style="color: #10b981;">"${webinarTitle}"</strong> has been confirmed. 
                    We've received your payment and you're now registered for this webinar.
                  </p>

                  <!-- Payment Details Card -->
                  <div style="background: linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%); border-left: 4px solid #10b981; border-radius: 12px; padding: 25px; margin: 30px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding-bottom: 15px;">
                          <p style="margin: 0; font-size: 12px; color: #718096; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">
                            💳 Payment Receipt
                          </p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 15px 0; border-top: 1px solid #d1fae5;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="font-size: 14px; color: #718096; padding: 8px 0;">Amount Paid:</td>
                              <td style="font-size: 20px; color: #10b981; font-weight: 700; text-align: right; padding: 8px 0;">
                                ${currency} ${amount.toFixed(2)}
                              </td>
                            </tr>
                            <tr>
                              <td style="font-size: 14px; color: #718096; padding: 8px 0;">Payment ID:</td>
                              <td style="font-size: 14px; color: #2d3748; font-weight: 600; text-align: right; font-family: 'Courier New', monospace; padding: 8px 0;">
                                ${paymentId}
                              </td>
                            </tr>
                            <tr>
                              <td style="font-size: 14px; color: #718096; padding: 8px 0;">Payment Date:</td>
                              <td style="font-size: 14px; color: #2d3748; font-weight: 600; text-align: right; padding: 8px 0;">
                                ${paymentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                              </td>
                            </tr>
                            <tr>
                              <td style="font-size: 14px; color: #718096; padding: 8px 0;">Status:</td>
                              <td style="text-align: right; padding: 8px 0;">
                                <span style="display: inline-block; padding: 4px 12px; background-color: #10b981; color: #ffffff; font-size: 12px; font-weight: 600; border-radius: 12px;">
                                  CONFIRMED
                                </span>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </div>

                  <!-- Webinar Details Card -->
                  <div style="background: linear-gradient(135deg, #ede9fe 0%, #ffffff 100%); border-left: 4px solid #7c3aed; border-radius: 12px; padding: 25px; margin: 30px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding-bottom: 15px;">
                          <p style="margin: 0; font-size: 12px; color: #718096; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">
                            📅 Webinar Details
                          </p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 15px 0; border-top: 1px solid #ddd6fe;">
                          <h3 style="margin: 0 0 15px 0; font-size: 18px; color: #2d3748; font-weight: 700;">
                            ${webinarTitle}
                          </h3>
                          ${webinarDescription ? `
                          <p style="margin: 0 0 15px 0; font-size: 14px; color: #4a5568; line-height: 1.6;">
                            ${webinarDescription}
                          </p>
                          ` : ''}
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="font-size: 14px; color: #718096; padding: 6px 0;">📅 Date:</td>
                              <td style="font-size: 14px; color: #2d3748; font-weight: 600; text-align: right; padding: 6px 0;">
                                ${webinarDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                              </td>
                            </tr>
                            <tr>
                              <td style="font-size: 14px; color: #718096; padding: 6px 0;">⏰ Time:</td>
                              <td style="font-size: 14px; color: #2d3748; font-weight: 600; text-align: right; padding: 6px 0;">
                                ${webinarStartTime} - ${webinarEndTime}
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </div>

                  <!-- Next Steps -->
                  <div style="background-color: #fff7ed; border-left: 4px solid #f97316; border-radius: 8px; padding: 20px; margin: 30px 0;">
                    <h3 style="margin: 0 0 15px 0; font-size: 18px; color: #2d3748; font-weight: 700;">
                      📋 Next Steps
                    </h3>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding: 8px 0;">
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="width: 32px; vertical-align: top; padding-top: 2px;">
                                <div style="width: 24px; height: 24px; background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: #ffffff; border-radius: 50%; text-align: center; line-height: 24px; font-size: 12px; font-weight: 700;">1</div>
                              </td>
                              <td style="color: #4a5568; font-size: 14px; line-height: 1.6;">
                                <strong>Check Your Dashboard:</strong> Access webinar details and materials anytime
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;">
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="width: 32px; vertical-align: top; padding-top: 2px;">
                                <div style="width: 24px; height: 24px; background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: #ffffff; border-radius: 50%; text-align: center; line-height: 24px; font-size: 12px; font-weight: 700;">2</div>
                              </td>
                              <td style="color: #4a5568; font-size: 14px; line-height: 1.6;">
                                <strong>Add to Calendar:</strong> Set a reminder so you don't miss the event
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;">
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="width: 32px; vertical-align: top; padding-top: 2px;">
                                <div style="width: 24px; height: 24px; background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: #ffffff; border-radius: 50%; text-align: center; line-height: 24px; font-size: 12px; font-weight: 700;">3</div>
                              </td>
                              <td style="color: #4a5568; font-size: 14px; line-height: 1.6;">
                                <strong>Join Link:</strong> You'll receive the webinar link via email 24 hours before
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </div>

                  <!-- CTA Button -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 35px 0;">
                    <tr>
                      <td align="center">
                        <a href="${process.env.FRONTEND_URL || 'https://yourwebinar.com'}/dashboard" 
                           style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);">
                          🎯 Go to Dashboard
                        </a>
                      </td>
                    </tr>
                  </table>

                  <!-- Invoice Info -->
                  <div style="text-align: center; margin: 30px 0; padding-top: 30px; border-top: 1px solid #e2e8f0;">
                    <p style="margin: 0 0 10px 0; font-size: 13px; color: #718096;">
                      Need an invoice? Download it from your dashboard or contact our support team.
                    </p>
                  </div>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e9ecef;">
                  <p style="margin: 0 0 15px 0; font-size: 16px; color: #2d3748; font-weight: 600;">
                    Thank you for your purchase! 💚
                  </p>
                  <p style="margin: 0 0 20px 0; font-size: 14px; color: #718096; line-height: 1.6;">
                    Best regards,<br/>
                    <strong>${process.env.EMAIL_FROM_NAME || "Change Networks"} Team</strong>
                  </p>
                  <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 20px;">
                    <p style="margin: 0; font-size: 12px; color: #a0aec0;">
                      © ${new Date().getFullYear()} ${process.env.EMAIL_FROM_NAME || "Change Networks"}. All rights reserved.
                    </p>
                    <p style="margin: 10px 0 0 0; font-size: 12px;">
                      <a href="${process.env.FRONTEND_URL || 'https://yourwebinar.com'}/contact" style="color: #667eea; text-decoration: none;">Contact Support</a> • 
                      <a href="${process.env.FRONTEND_URL || 'https://yourwebinar.com'}/refund-policy" style="color: #667eea; text-decoration: none;">Refund Policy</a> • 
                      <a href="${process.env.FRONTEND_URL || 'https://yourwebinar.com'}/help" style="color: #667eea; text-decoration: none;">Help Center</a>
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
};

// Enrollment Confirmation Email Template (Free Webinars)
export const generateEnrollmentConfirmationEmailTemplate = ({
  recipientName,
  webinarTitle,
  enrollmentDate,
  webinarDate,
  webinarStartTime,
  webinarEndTime,
  webinarDescription,
  hostName,
}: {
  recipientName: string;
  webinarTitle: string;
  enrollmentDate: Date;
  webinarDate: Date;
  webinarStartTime: string;
  webinarEndTime: string;
  webinarDescription?: string;
  hostName?: string;
}) => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <title>Enrollment Confirmation</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f6f9fc;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" style="padding: 40px 20px;">
            <!-- Main Container -->
            <table role="presentation" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07);" cellpadding="0" cellspacing="0" border="0">
              
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 50px 30px; text-align: center;">
                  <div style="font-size: 80px; margin-bottom: 20px; text-shadow: 0 4px 8px rgba(0,0,0,0.1);">🎉</div>
                  <h1 style="color: #ffffff; font-size: 36px; font-weight: 700; margin: 0 0 15px 0; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    You're Enrolled!
                  </h1>
                  <p style="color: #ffffff; font-size: 18px; margin: 0; opacity: 0.95; font-weight: 500;">
                    Get ready for an amazing learning experience
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
                    Great news! You've successfully enrolled in <strong style="color: #667eea;">"${webinarTitle}"</strong>. 
                    We're excited to have you join us for this webinar.
                  </p>

                  <!-- Webinar Details Card -->
                  <div style="background: linear-gradient(135deg, #ede9fe 0%, #ffffff 100%); border-left: 4px solid #7c3aed; border-radius: 12px; padding: 25px; margin: 30px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding-bottom: 15px;">
                          <p style="margin: 0; font-size: 12px; color: #718096; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">
                            📅 Webinar Information
                          </p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 15px 0; border-top: 1px solid #ddd6fe;">
                          <h3 style="margin: 0 0 15px 0; font-size: 20px; color: #2d3748; font-weight: 700;">
                            ${webinarTitle}
                          </h3>
                          ${webinarDescription ? `
                          <p style="margin: 0 0 20px 0; font-size: 14px; color: #4a5568; line-height: 1.6;">
                            ${webinarDescription}
                          </p>
                          ` : ''}
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                            ${hostName ? `
                            <tr>
                              <td style="font-size: 14px; color: #718096; padding: 8px 0;">🎤 Host:</td>
                              <td style="font-size: 14px; color: #2d3748; font-weight: 600; text-align: right; padding: 8px 0;">
                                ${hostName}
                              </td>
                            </tr>
                            ` : ''}
                            <tr>
                              <td style="font-size: 14px; color: #718096; padding: 8px 0;">📅 Date:</td>
                              <td style="font-size: 14px; color: #2d3748; font-weight: 600; text-align: right; padding: 8px 0;">
                                ${webinarDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                              </td>
                            </tr>
                            <tr>
                              <td style="font-size: 14px; color: #718096; padding: 8px 0;">⏰ Time:</td>
                              <td style="font-size: 14px; color: #2d3748; font-weight: 600; text-align: right; padding: 8px 0;">
                                ${webinarStartTime} - ${webinarEndTime}
                              </td>
                            </tr>
                            <tr>
                              <td style="font-size: 14px; color: #718096; padding: 8px 0;">📍 Status:</td>
                              <td style="text-align: right; padding: 8px 0;">
                                <span style="display: inline-block; padding: 4px 12px; background-color: #10b981; color: #ffffff; font-size: 12px; font-weight: 600; border-radius: 12px;">
                                  ENROLLED
                                </span>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </div>

                  <!-- What to Expect -->
                  <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; border-radius: 8px; padding: 20px; margin: 30px 0;">
                    <h3 style="margin: 0 0 15px 0; font-size: 18px; color: #2d3748; font-weight: 700;">
                      📚 What to Expect
                    </h3>
                    <ul style="margin: 0; padding-left: 20px; color: #4a5568; font-size: 14px; line-height: 1.8;">
                      <li>Interactive Q&A session with the host</li>
                      <li>Downloadable resources and materials</li>
                      <li>Certificate of completion (if applicable)</li>
                      <li>Networking opportunity with other attendees</li>
                    </ul>
                  </div>

                  <!-- Preparation Tips -->
                  <div style="background-color: #fff7ed; border-left: 4px solid #f97316; border-radius: 8px; padding: 20px; margin: 30px 0;">
                    <h3 style="margin: 0 0 15px 0; font-size: 18px; color: #2d3748; font-weight: 700;">
                      🎯 How to Prepare
                    </h3>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding: 8px 0;">
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="width: 32px; vertical-align: top; padding-top: 2px;">
                                <div style="width: 24px; height: 24px; background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: #ffffff; border-radius: 50%; text-align: center; line-height: 24px; font-size: 12px; font-weight: 700;">1</div>
                              </td>
                              <td style="color: #4a5568; font-size: 14px; line-height: 1.6;">
                                Test your internet connection and audio/video settings
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;">
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="width: 32px; vertical-align: top; padding-top: 2px;">
                                <div style="width: 24px; height: 24px; background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: #ffffff; border-radius: 50%; text-align: center; line-height: 24px; font-size: 12px; font-weight: 700;">2</div>
                              </td>
                              <td style="color: #4a5568; font-size: 14px; line-height: 1.6;">
                                Add the event to your calendar to receive reminders
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;">
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="width: 32px; vertical-align: top; padding-top: 2px;">
                                <div style="width: 24px; height: 24px; background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: #ffffff; border-radius: 50%; text-align: center; line-height: 24px; font-size: 12px; font-weight: 700;">3</div>
                              </td>
                              <td style="color: #4a5568; font-size: 14px; line-height: 1.6;">
                                Join 5-10 minutes early to ensure smooth entry
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;">
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="width: 32px; vertical-align: top; padding-top: 2px;">
                                <div style="width: 24px; height: 24px; background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: #ffffff; border-radius: 50%; text-align: center; line-height: 24px; font-size: 12px; font-weight: 700;">4</div>
                              </td>
                              <td style="color: #4a5568; font-size: 14px; line-height: 1.6;">
                                Prepare questions you'd like to ask during the Q&A
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </div>

                  <!-- CTA Button -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 35px 0;">
                    <tr>
                      <td align="center">
                        <a href="${process.env.FRONTEND_URL || 'https://yourwebinar.com'}/dashboard" 
                           style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);">
                          📖 View Webinar Details
                        </a>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="padding-top: 15px;">
                        <p style="margin: 0; font-size: 13px; color: #718096;">
                          You'll receive the join link 24 hours before the webinar
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e9ecef;">
                  <p style="margin: 0 0 15px 0; font-size: 16px; color: #2d3748; font-weight: 600;">
                    See you at the webinar! 🚀
                  </p>
                  <p style="margin: 0 0 20px 0; font-size: 14px; color: #718096; line-height: 1.6;">
                    Best regards,<br/>
                    <strong>${process.env.EMAIL_FROM_NAME || "Change Networks"} Team</strong>
                  </p>
                  <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 20px;">
                    <p style="margin: 0; font-size: 12px; color: #a0aec0;">
                      © ${new Date().getFullYear()} ${process.env.EMAIL_FROM_NAME || "Change Networks"}. All rights reserved.
                    </p>
                    <p style="margin: 10px 0 0 0; font-size: 12px;">
                      <a href="${process.env.FRONTEND_URL || 'https://yourwebinar.com'}/contact" style="color: #667eea; text-decoration: none;">Contact Support</a> • 
                      <a href="${process.env.FRONTEND_URL || 'https://yourwebinar.com'}/help" style="color: #667eea; text-decoration: none;">Help Center</a>
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
};

