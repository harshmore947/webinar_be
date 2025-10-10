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
}

export const generateWelcomeEmailTemplate = ({
  firstName,
  role,
  email,
}: WelcomeEmailData): string => {
  const roleSpecificSteps = {
    Host: "<li>Create your first webinar</li>",
    Admin: "<li>Access the admin dashboard</li>",
    Presenter: "<li>Review assigned webinars</li>",
    Moderator: "<li>Familiarize yourself with moderation tools</li>",
    Attendee: "",
  };

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to Change Networks</title>
    </head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f7f9fc; border-radius: 8px; padding: 30px; margin-bottom: 30px; border-top: 4px solid #4361ee;">
        <h2 style="color: #2d3748; margin-top: 0; font-weight: 600;">Welcome to Change Networks, ${firstName}!</h2>
        
        <p>Thank you for joining our webinar platform. We're excited to have you on board!</p>
        
        <p>Your account has been successfully created with the role: <strong>${role}</strong></p>
        
        <p><strong>Next Steps:</strong></p>
        <ul style="padding-left: 20px;">
          <li>Complete your profile information</li>
          <li>Explore upcoming webinars</li>
          <li>Save webinars to your calendar</li>
          ${roleSpecificSteps[role as keyof typeof roleSpecificSteps] || ""}
        </ul>
      </div>
      
      <div style="color: #718096; font-size: 14px; text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
        <p>Thank you for choosing Change Networks!</p>
        <p>Best regards,<br>The Change Networks Team</p>
      </div>
    </body>
    </html>
  `;
};

export const generateReminderEmailTemplate = ({
  firstName,
  webinarTitle,
  webinarDate,
  webinarDescription,
}: ReminderEmailData): string => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Webinar Reminder</title>
    </head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f7f9fc; border-radius: 8px; padding: 30px; margin-bottom: 30px; border-top: 4px solid #4361ee;">
        <h2 style="color: #2d3748; margin-top: 0; font-weight: 600;">Webinar Reminder</h2>
        
        <p>Hello ${firstName},</p>
        
        <p>This is a friendly reminder that your webinar is starting soon:</p>
        
        <div style="background-color: #ffffff; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #e2e8f0;">
          <h3 style="color: #4361ee; margin-top: 0;">${webinarTitle}</h3>
          <p><strong>Date & Time:</strong> ${webinarDate}</p>
          ${webinarDescription ? `<p><strong>Description:</strong> ${webinarDescription}</p>` : ""}
        </div>
        
        <p>We recommend joining a few minutes early to test your audio and video settings.</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="#" style="background-color: #4361ee; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; display: inline-block;">Join Webinar</a>
        </div>
      </div>
      
      <div style="color: #718096; font-size: 14px; text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
        <p>Best regards,<br>The Change Networks Team</p>
      </div>
    </body>
    </html>
  `;
};
