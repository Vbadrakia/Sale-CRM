import type { Transporter } from 'nodemailer';
import { env } from '../config/env';

let transporter: Transporter | null = null;

async function getTransporter(): Promise<Transporter | null> {
  if (!env.smtp.host) return null;
  if (!transporter) {
    const nodemailer = (await import('nodemailer')).default;
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.password } : undefined,
    });
  }
  return transporter;
}

export async function sendMail(options: { to: string; subject: string; html: string; text: string }) {
  const tx = await getTransporter();
  if (!tx) {
    // No SMTP configured (typical for local dev): log instead of failing the request.
    console.warn(`[mail:dev] To: ${options.to} | ${options.subject}\n${options.text}`);
    return;
  }
  await tx.sendMail({ from: env.smtp.from, ...options });
}

export async function sendOtpEmail(to: string, name: string, code: string) {
  const subject = 'Your CRM verification code';
  const text = `Hi ${name},\n\nYour verification code is ${code}. It expires in ${env.otp.expiresMinutes} minutes.\n\nIf you did not request this, ignore this email.`;
  await sendMail({
    to,
    subject,
    text,
    html: `<p>Hi ${name},</p><p>Your verification code is <strong style="font-size:20px;letter-spacing:3px">${code}</strong>.</p><p>It expires in ${env.otp.expiresMinutes} minutes.</p>`,
  });
}

export async function sendPasswordResetEmail(to: string, name: string, token: string) {
  const link = `${env.frontendUrl}/reset-password?token=${token}`;
  const subject = 'Reset your CRM password';
  const text = `Hi ${name},\n\nReset your password using this link: ${link}\nIt expires in ${env.passwordReset.expiresMinutes} minutes.`;
  await sendMail({
    to,
    subject,
    text,
    html: `<p>Hi ${name},</p><p><a href="${link}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;">Reset your password</a></p><p>Or copy this link into your browser: <br/>${link}</p><p>This link expires in ${env.passwordReset.expiresMinutes} minutes.</p>`,
  });
}

export async function sendWelcomeEmail(to: string, name: string, token: string) {
  const link = `${env.frontendUrl}/reset-password?token=${token}`;
  const subject = 'Your CRM account has been created - Set your password';
  const text = `Hi ${name},\n\nAn account was created for you at ${env.frontendUrl}.\nEmail: ${to}\n\nPlease set your password using this secure link:\n${link}\n\nOn first login you will be asked for an email verification code.`;
  await sendMail({
    to,
    subject,
    text,
    html: `<p>Hi ${name},</p><p>An account was created for you at <a href="${env.frontendUrl}">${env.frontendUrl}</a>.</p><p>Email: <strong>${to}</strong></p><p><a href="${link}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;">Set Your Password</a></p><p>Or copy this link into your browser: <br/>${link}</p><p>On first login you will be asked for an email verification code.</p>`,
  });
}
