const nodemailer = require("nodemailer");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");

function invitationSettings() {
  const publicUrl = process.env.APP_PUBLIC_URL?.trim();
  let origin;
  try {
    const parsed = new URL(publicUrl);
    if (!['https:', 'http:'].includes(parsed.protocol) || (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:')) throw new Error('invalid protocol');
    origin = parsed.origin;
  } catch { throw Object.assign(new Error('Invitation email is not configured: set APP_PUBLIC_URL to the survey URL.'), { statusCode: 503 }); }
  const ftmsFile = process.env.FTMS_EMAIL_ENV_FILE?.trim();
  if (ftmsFile) {
    try {
      if (!path.isAbsolute(ftmsFile)) throw new Error('FTMS_EMAIL_ENV_FILE must be an absolute path.');
      const ftmsConfig = dotenv.parse(readFileSync(ftmsFile));
      const user = ftmsConfig.EMAIL_USER?.trim();
      const password = ftmsConfig.EMAIL_PASS;
      if (!user || !password) throw new Error('FTMS email credentials are missing.');
      return { host: 'smtp.gmail.com', from: `"MoA Leadership Survey" <${user}>`, origin, port: 587, auth: { user, pass: password }, source: 'ftms' };
    } catch {
      throw Object.assign(new Error('FTMS email is unavailable. Check FTMS_EMAIL_ENV_FILE, file permissions, and FTMS EMAIL_USER/EMAIL_PASS.'), { statusCode: 503 });
    }
  }
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.SMTP_FROM?.trim();
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD;
  const port = Number(process.env.SMTP_PORT || 587);
  if (!host || !from || !Number.isInteger(port) || port < 1 || port > 65535 || Boolean(user) !== Boolean(password)) {
    throw Object.assign(new Error('Invitation email is not configured: check SMTP_HOST, SMTP_PORT, SMTP_FROM, SMTP_USER and SMTP_PASSWORD.'), { statusCode: 503 });
  }
  return { host, from, origin, port, auth: user ? { user, pass: password } : undefined };
}

async function sendAccountEmail({ email, subject, text }) {
  const { host, from, origin, port, auth } = invitationSettings();
  const transporter = nodemailer.createTransport({ host, port, secure: port === 465, requireTLS: port !== 465, auth, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 });
  await transporter.sendMail({ from, to: email, subject, text });
  return origin;
}

async function sendInvitation({ email, displayName, token }) {
  const { origin } = invitationSettings();
  const link = `${origin}/#admin/invite/${token}`;
  await sendAccountEmail({ email, subject: 'Your Ministry survey administration invitation',
    text: `Hello ${displayName},\n\nYou have been invited to the Ministry of Agriculture survey administration system. Open this one-time link to set your password before signing in:\n\n${link}\n\nThe link expires in 48 hours. If you did not expect this invitation, please contact the Ministry administrator. Do not forward the link.\n` });
}

async function sendPasswordReset({ email, displayName, token }) {
  const { origin } = invitationSettings();
  const link = `${origin}/#admin/reset/${token}`;
  await sendAccountEmail({ email, subject: 'Reset your Ministry survey administration password',
    text: `Hello ${displayName},\n\nA password change was requested for your Ministry of Agriculture survey administration account. Use this one-time link to choose a new password:\n\n${link}\n\nThe link expires in 1 hour. If you did not request this, ignore this message. Your current password will continue to work. Do not forward the link.\n` });
}

module.exports = { invitationSettings, sendInvitation, sendPasswordReset };
