import nodemailer from "nodemailer";

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export async function sendWelcomeEmail(
  toEmail: string,
  name: string,
  password: string,
  role: string,
  loginUrl: string
) {
  const transporter = getTransporter();

  const roleLabel =
    role === "admin" ? "Admin (Agency Head)" : "Insurance Agent";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Welcome to ColdCall AI Platform</h2>
      <p>Hi ${name},</p>
      <p>Your account has been created as <strong>${roleLabel}</strong>.</p>
      <p>Here are your login credentials:</p>
      <table style="border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding: 8px 16px; background: #f3f4f6; font-weight: bold;">Email</td>
          <td style="padding: 8px 16px;">${toEmail}</td>
        </tr>
        <tr>
          <td style="padding: 8px 16px; background: #f3f4f6; font-weight: bold;">Password</td>
          <td style="padding: 8px 16px; font-family: monospace;">${password}</td>
        </tr>
      </table>
      <p>
        <a href="${loginUrl}" style="display: inline-block; padding: 10px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px;">
          Login Now
        </a>
      </p>
      <p style="color: #6b7280; font-size: 14px;">
        Please change your password after your first login for security.
      </p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: toEmail,
      subject: "Welcome to ColdCall AI Platform - Your Account Details",
      html,
    });
    return { sent: true, error: null };
  } catch (error) {
    console.error("Failed to send welcome email:", error);
    return {
      sent: false,
      error: error instanceof Error ? error.message : "Email send failed",
    };
  }
}
