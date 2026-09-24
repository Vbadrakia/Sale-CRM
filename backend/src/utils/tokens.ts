import crypto from 'crypto';
import bcrypt from 'bcryptjs';

/** 6-digit numeric OTP. The raw value is emailed and never persisted. */
export function generateOtpCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export async function hashSecret(value: string): Promise<string> {
  return bcrypt.hash(value, 10);
}

export async function compareSecret(value: string, hash: string): Promise<boolean> {
  return bcrypt.compare(value, hash);
}

export function generateResetToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function minutesFromNow(minutes: number): Date {
  return new Date(Date.now() + minutes * 60_000);
}
