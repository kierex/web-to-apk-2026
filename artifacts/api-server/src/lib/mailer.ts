import nodemailer from "nodemailer";
import { logger } from "./logger";
import { getConfig } from "./config";

let transporter: nodemailer.Transporter | null = null;

export async function createTransporter() {
  const config = getConfig();
  if (!config.smtp.host || !config.smtp.user || !config.smtp.pass) {
    return null;
  }

  const t = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  });

  try {
    await t.verify();
    logger.info({ host: config.smtp.host }, "SMTP transporter verified");
    transporter = t;
  } catch (error) {
    logger.warn({ err: error }, "SMTP verification failed, mail will be logged only");
  }

  return transporter;
}

function emailLayout(title: string, body: string) {
  return `<!doctype html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px 12px;">
    <div style="background:#1e293b;border-radius:16px;padding:28px;color:#e2e8f0;border:1px solid #334155;">
      <div style="font-size:22px;font-weight:800;color:#38bdf8;margin-bottom:6px;">Webz</div>
      <h1 style="font-size:18px;margin:18px 0 10px;color:#f8fafc;">${title}</h1>
      <div style="font-size:14px;line-height:1.65;color:#cbd5e1;">${body}</div>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #334155;font-size:12px;color:#64748b;">
        Webz HTML to APK Studio &middot; You receive this email because of your account activity.
      </div>
    </div>
  </div>
</body>
</html>`;
}

export async function sendEmail(to: string, subject: string, html: string, text?: string) {
  if (!transporter) {
    const t = await createTransporter();
    if (!t) {
      logger.info({ to, subject }, "SMTP not configured, skipping email (dev mode)");
      return false;
    }
    transporter = t;
  }

  const config = getConfig();
  try {
    await transporter!.sendMail({
      from: config.smtp.from,
      to,
      subject,
      html,
      text: text || `Webz: ${subject}`,
    });
    logger.info({ to, subject }, "Email sent");
    return true;
  } catch (error) {
    logger.error({ err: error, to, subject }, "Failed to send email");
    return false;
  }
}

export async function sendVerificationEmail(email: string, code: string, name: string) {
  const body = `<p>Hi ${name},</p>
  <p>Welcome to <strong>Webz HTML to APK Studio</strong>! Use this verification code to activate your account:</p>
  <div style="text-align:center;margin:20px 0;">
    <span style="display:inline-block;background:#0ea5e9;color:#fff;font-size:28px;font-weight:800;letter-spacing:8px;padding:12px 24px;border-radius:10px;">${code}</span>
  </div>
  <p>This code expires in <strong>15 minutes</strong>.</p>
  <p>If you did not create this account, you can safely ignore this email.</p>`;
  return sendEmail(email, "Verify your Webz account", emailLayout("Verify your email", body), `Your Webz verification code is: ${code}`);
}

export async function sendPasswordResetEmail(email: string, code: string, name: string) {
  const body = `<p>Hi ${name},</p>
  <p>We received a request to reset your password. Use this code to set a new one:</p>
  <div style="text-align:center;margin:20px 0;">
    <span style="display:inline-block;background:#0ea5e9;color:#fff;font-size:28px;font-weight:800;letter-spacing:8px;padding:12px 24px;border-radius:10px;">${code}</span>
  </div>
  <p>This code expires in <strong>15 minutes</strong>. If you did not request a reset, ignore this email — your password stays unchanged.</p>`;
  return sendEmail(email, "Reset your Webz password", emailLayout("Password reset", body), `Your Webz password reset code is: ${code}`);
}

export async function sendWelcomeEmail(email: string, name: string) {
  const body = `<p>Hi ${name},</p>
  <p>Your account is ready! You can now build real Android APKs from HTML, CSS and JS — or convert any website into an APK by pasting its URL.</p>
  <p>Quick start:</p>
  <ol>
    <li>Open the <strong>Build Studio</strong></li>
    <li>Upload your HTML/CSS/JS or paste a website URL</li>
    <li>Click <strong>Build APK</strong> and download your signed app</li>
  </ol>
  <p>Free accounts get <strong>3 builds per day</strong>. Need more? Redeem a premium key from the <strong>Premium</strong> page.</p>`;
  return sendEmail(email, "Welcome to Webz HTML to APK Studio", emailLayout("Welcome aboard!", body));
}

export async function sendPremiumActivatedEmail(email: string, name: string, expiresAt: string | null) {
  const period = expiresAt
    ? `until <strong>${new Date(expiresAt).toDateString()}</strong>`
    : "<strong>forever</strong>";
  const body = `<p>Hi ${name},</p>
  <p>Premium is now active on your account ${period}.</p>
  <p>You now enjoy:</p>
  <ul>
    <li>Unlimited daily builds</li>
    <li>Up to 500&nbsp;MB project uploads</li>
    <li>Faster chat rate limits</li>
    <li>Premium badge in world chat</li>
  </ul>
  <p>Happy building!</p>`;
  return sendEmail(email, "Webz Premium activated", emailLayout("Premium is active", body));
}

export async function sendBuildCompletedEmail(email: string, name: string, buildName: string, downloadUrl: string) {
  const config = getConfig();
  const fullUrl = `${config.app.url}${downloadUrl}`;
  const body = `<p>Hi ${name},</p>
  <p>Your APK <strong>${buildName}</strong> is ready to download.</p>
  <p><a href="${fullUrl}" style="display:inline-block;background:#22c55e;color:#fff;padding:12px 24px;border-radius:10px;font-weight:700;text-decoration:none;">Download APK</a></p>
  <p style="font-size:12px;color:#94a3b8;">Link: ${fullUrl}</p>`;
  return sendEmail(email, "Your Webz APK is ready", emailLayout("Build completed", body));
}

export async function sendBuildFailedEmail(email: string, name: string, buildName: string, error: string) {
  const body = `<p>Hi ${name},</p>
  <p>We could not finish building <strong>${buildName}</strong>.</p>
  <p style="background:#312e81;padding:12px;border-radius:8px;font-size:12px;white-space:pre-wrap;">${error.slice(0, 800)}</p>
  <p>Open the <strong>History</strong> page for full details, or contact the developer if the issue persists.</p>`;
  return sendEmail(email, "Your Webz build failed", emailLayout("Build failed", body));
}

export async function sendSupportEmail(to: string, subject: string, message: string, userEmail: string, userName: string) {
  const body = `<p><strong>From:</strong> ${userName} &lt;${userEmail}&gt;</p>
  <p><strong>Subject:</strong> ${subject}</p>
  <div style="background:#0f172a;padding:14px;border-radius:8px;font-size:13px;white-space:pre-wrap;">${message}</div>`;
  return sendEmail(to, `[Webz Support] ${subject}`, emailLayout("Support request", body));
}

export async function sendAdminNotificationEmail(subject: string, message: string) {
  const config = getConfig();
  const adminEmail = config.smtp.user || "admin@webz.local";
  return sendEmail(adminEmail, `[Webz Admin] ${subject}`, emailLayout(subject, `<p>${message}</p>`));
}
