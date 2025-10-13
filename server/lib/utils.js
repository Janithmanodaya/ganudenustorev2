import fetch from 'node-fetch';
import nodemailer from 'nodemailer';

export function generateOtp() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

/**
 * sendEmail
 * Priority:
 * 1) If EMAIL_DEV_MODE=true OR missing env → log locally and return ok:true
 * 2) If SMTP_HOST is set → use nodemailer SMTP transport (common providers: Gmail, Mailgun, etc.)
 * 3) Else fallback to Brevo HTTP API (requires BREVO_API_KEY + BREVO_LOGIN)
 */
export async function sendEmail(to, subject, htmlContent) {
  const DEV_MODE = String(process.env.EMAIL_DEV_MODE || '').toLowerCase() === 'true';

  if (DEV_MODE) {
    console.warn('[email] Dev mode enabled. Logging email locally.');
    console.log(`[email:dev]\nTo: ${to}\nSubject: ${subject}\nContent:\n${htmlContent}`);
    return { ok: true, dev: true };
  }

  // Try generic SMTP first if available
  const SMTP_HOST = process.env.SMTP_HOST;
  const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
  const SMTP_SECURE = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
  const SMTP_USER = process.env.SMTP_USER;
  const SMTP_PASS = process.env.SMTP_PASS;
  const SMTP_FROM = process.env.SMTP_FROM || process.env.BREVO_LOGIN || 'no-reply@example.com';

  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    try {
      const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_SECURE,
        auth: { user: SMTP_USER, pass: SMTP_PASS }
      });
      const info = await transporter.sendMail({
        from: SMTP_FROM,
        to,
        subject,
        html: htmlContent
      });
      console.log('[email] Sent via SMTP:', info.messageId);
      return { ok: true, data: { messageId: info.messageId } };
    } catch (err) {
      console.error('[email] SMTP send failed:', err);
      // continue to Brevo fallback
    }
  }

  // Brevo fallback via HTTP
  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  const BREVO_LOGIN = process.env.BREVO_LOGIN;
  if (!BREVO_API_KEY || !BREVO_LOGIN) {
    console.error('[email] No SMTP config and Brevo credentials missing.');
    return { ok: false, error: 'Email provider not configured.' };
  }

  try {
    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': BREVO_API_KEY
      },
      body: JSON.stringify({
        sender: { name: 'Ganudenu', email: BREVO_LOGIN },
        to: [{ email: to }],
        subject,
        htmlContent
      })
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error('[email] Brevo HTTP error:', resp.status, data);
      return { ok: false, error: data?.message || `HTTP ${resp.status}` };
    }
    console.log('[email] Sent via Brevo HTTP:', JSON.stringify(data));
    return { ok: true, data };
  } catch (error) {
    console.error('[email] Brevo send failed:', error);
    return { ok: false, error: String(error) };
  }
}
