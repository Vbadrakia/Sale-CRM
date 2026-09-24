import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import { Request, Response } from 'express';
import { OtpToken, PasswordResetToken, User, toPublicUser } from '../models';
import { ApiError } from '../utils/ApiError';
import { sendSuccess } from '../utils/apiResponse';
import { signAuthToken } from '../utils/jwt';
import {
  compareSecret,
  generateOtpCode,
  generateResetToken,
  hashSecret,
  minutesFromNow,
  sha256,
} from '../utils/tokens';
import { env } from '../config/env';
import { sendOtpEmail, sendPasswordResetEmail } from '../services/mailer.service';
import { currentUser } from '../middleware/auth';

const VERIFICATION = 'ACCOUNT_VERIFICATION';

async function issueOtp(user: User): Promise<void> {
  const latest = await OtpToken.findOne({
    where: { userId: user.id, purpose: VERIFICATION, consumedAt: null },
    order: [['createdAt', 'DESC']],
  });
  if (latest) {
    const secondsSince = (Date.now() - new Date(latest.createdAt).getTime()) / 1000;
    if (secondsSince < env.otp.resendCooldownSeconds) {
      throw ApiError.tooManyRequests(
        `Please wait ${Math.ceil(env.otp.resendCooldownSeconds - secondsSince)}s before requesting another code`,
      );
    }
  }
  // Invalidate any previous codes so only the newest one works.
  await OtpToken.update(
    { consumedAt: new Date() },
    { where: { userId: user.id, purpose: VERIFICATION, consumedAt: null } },
  );

  const code = generateOtpCode();
  await OtpToken.create({
    userId: user.id,
    purpose: VERIFICATION,
    codeHash: await hashSecret(code),
    expiresAt: minutesFromNow(env.otp.expiresMinutes),
  });
  await sendOtpEmail(user.email, user.firstName, code);
}

export async function login(req: Request, res: Response) {
  const reqId = req.id || (req.headers['x-request-id'] as string) || 'unknown';
  const { email, password } = req.body as { email: string; password: string };

  // Step 1: Search user in DB
  let user: User | null;
  try {
    user = await User.findOne({ where: { email } });
  } catch (err: unknown) {
    console.error(`[login] reqId=${reqId} User.findOne failed:`, err instanceof Error ? err.message : String(err));
    throw ApiError.database('Database unavailable. Please try again.', 'DATABASE_UNAVAILABLE');
  }

  if (!user) {
    throw ApiError.unauthorized('Invalid email or password', 'AUTH_INVALID_CREDENTIALS');
  }

  // Step 2: Bcrypt comparison
  let matches: boolean;
  try {
    matches = await bcrypt.compare(password, user.passwordHash);
  } catch (err: unknown) {
    console.error(`[login] reqId=${reqId} bcrypt.compare failed:`, err instanceof Error ? err.message : String(err));
    throw new ApiError(500, 'Password verification failed', 'AUTH_PASSWORD_CHECK_FAILED');
  }

  if (!matches) {
    throw ApiError.unauthorized('Invalid email or password', 'AUTH_INVALID_CREDENTIALS');
  }

  if (!user.isActive) {
    throw ApiError.forbidden('This account is disabled. Contact your administrator.', 'ACCOUNT_DISABLED');
  }

  if (!user.emailVerified) {
    await issueOtp(user).catch(() => undefined);
    return sendSuccess(
      res,
      { requiresVerification: true, email: user.email },
      'Verification required. We emailed you a 6-digit code.',
    );
  }

  user.lastLoginAt = new Date();
  await user.save().catch(() => undefined);

  // Step 3: JWT Signing
  let token: string;
  try {
    token = signAuthToken({ id: user.id, role: user.role, email: user.email, tokenVersion: user.tokenVersion });
  } catch (err: unknown) {
    console.error(`[login] reqId=${reqId} signAuthToken failed:`, err instanceof Error ? err.message : String(err));
    throw new ApiError(500, 'Failed to issue authentication token', 'AUTH_TOKEN_ERROR');
  }

  return sendSuccess(res, { token, user: toPublicUser(user), requiresVerification: false }, 'Signed in');
}

export async function verifyOtp(req: Request, res: Response) {
  const { email, code } = req.body as { email: string; code: string };
  const user = await User.findOne({ where: { email } });
  if (!user) throw ApiError.badRequest('Invalid or expired code');
  if (!user.isActive) throw ApiError.forbidden('This account is disabled');

  const token = await OtpToken.findOne({
    where: { userId: user.id, purpose: VERIFICATION, consumedAt: null },
    order: [['createdAt', 'DESC']],
  });
  if (!token) throw ApiError.badRequest('Invalid or expired code');
  if (token.expiresAt.getTime() < Date.now()) throw ApiError.badRequest('This code has expired. Request a new one.');
  if (token.attempts >= env.otp.maxAttempts) {
    throw ApiError.tooManyRequests('Too many incorrect attempts. Request a new code.');
  }

  const valid = await compareSecret(code, token.codeHash);
  if (!valid) {
    token.attempts += 1;
    await token.save();
    throw ApiError.badRequest('Invalid or expired code');
  }

  token.consumedAt = new Date();
  await token.save();

  user.emailVerified = true;
  user.lastLoginAt = new Date();
  await user.save();

  const jwtToken = signAuthToken({ id: user.id, role: user.role, email: user.email, tokenVersion: user.tokenVersion });
  return sendSuccess(res, { token: jwtToken, user: toPublicUser(user) }, 'Account verified');
}

export async function resendOtp(req: Request, res: Response) {
  const { email } = req.body as { email: string };
  const user = await User.findOne({ where: { email } });
  if (user && user.isActive && !user.emailVerified) {
    await issueOtp(user);
  }
  return sendSuccess(res, { sent: true }, 'If the account needs verification, a new code has been sent.');
}

export async function forgotPassword(req: Request, res: Response) {
  const { email } = req.body as { email: string };
  const user = await User.findOne({ where: { email } });
  if (user && user.isActive) {
    await PasswordResetToken.update(
      { usedAt: new Date() },
      { where: { userId: user.id, usedAt: null } },
    );
    const rawToken = generateResetToken();
    await PasswordResetToken.create({
      userId: user.id,
      tokenHash: sha256(rawToken),
      expiresAt: minutesFromNow(env.passwordReset.expiresMinutes),
    });
    await sendPasswordResetEmail(user.email, user.firstName, rawToken);
  }
  return sendSuccess(res, { sent: true }, 'If that email exists, a reset link has been sent.');
}

export async function resetPassword(req: Request, res: Response) {
  const { token, password } = req.body as { token: string; password: string };
  const record = await PasswordResetToken.findOne({
    where: { tokenHash: sha256(token), usedAt: null, expiresAt: { [Op.gt]: new Date() } },
  });
  if (!record) throw ApiError.badRequest('This reset link is invalid or has expired');

  const user = await User.findByPk(record.userId);
  if (!user) throw ApiError.badRequest('This reset link is invalid or has expired');

  user.passwordHash = await bcrypt.hash(password, 10);
  user.tokenVersion = (user.tokenVersion || 1) + 1;
  await user.save();
  record.usedAt = new Date();
  await record.save();

  return sendSuccess(res, { reset: true }, 'Password updated. You can now sign in.');
}

export async function changePassword(req: Request, res: Response) {
  const user = currentUser(req);
  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
  const matches = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!matches) throw ApiError.badRequest('Current password is incorrect');
  user.passwordHash = await bcrypt.hash(newPassword, 10);
  user.tokenVersion = (user.tokenVersion || 1) + 1;
  await user.save();
  return sendSuccess(res, { changed: true }, 'Password changed');
}

export async function updateProfile(req: Request, res: Response) {
  const user = currentUser(req);
  const body = req.body as { firstName: string; lastName: string; phone?: string | null };
  user.firstName = body.firstName;
  user.lastName = body.lastName;
  user.phone = body.phone ?? null;
  await user.save();
  return sendSuccess(res, toPublicUser(user), 'Profile updated');
}

export async function me(req: Request, res: Response) {
  return sendSuccess(res, toPublicUser(currentUser(req)), 'OK');
}

export async function logout(_req: Request, res: Response) {
  // JWTs are stateless; the client discards the token. Endpoint exists for
  // symmetry and future token-revocation support.
  return sendSuccess(res, { loggedOut: true }, 'Signed out');
}
