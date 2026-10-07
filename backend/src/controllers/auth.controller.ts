import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Op, QueryTypes } from 'sequelize';
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
import { sequelize, withDbRetry } from '../config/database';
import { sendOtpEmail, sendPasswordResetEmail } from '../services/mailer.service';
import { currentUser, primeUserAuthCache } from '../middleware/auth';
import { setAuthCookie, clearAuthCookie } from '../utils/cookies';

const VERIFICATION = 'ACCOUNT_VERIFICATION';
export const BCRYPT_SALT_ROUNDS = 12;

// Precomputed bcrypt cost-12 hash to equalize execution time on unknown email logins
const DUMMY_BCRYPT_HASH = '$2a$12$e8kL1QGzQoG7yM0p.V5t7eO3N9o0U4s8m1Y4z2W6k8r0t2y4u6i8o';

async function issueOtp(user: User): Promise<void> {
  const latest = await withDbRetry(() => OtpToken.findOne({
    where: { userId: user.id, purpose: VERIFICATION, consumedAt: null },
    order: [['createdAt', 'DESC']],
  }));
  if (latest) {
    const secondsSince = (Date.now() - new Date(latest.createdAt).getTime()) / 1000;
    if (secondsSince < env.otp.resendCooldownSeconds) {
      throw ApiError.tooManyRequests(
        `Please wait ${Math.ceil(env.otp.resendCooldownSeconds - secondsSince)}s before requesting another code`,
      );
    }
  }
  // Invalidate any previous codes so only the newest one works.
  await withDbRetry(() => OtpToken.update(
    { consumedAt: new Date() },
    { where: { userId: user.id, purpose: VERIFICATION, consumedAt: null } },
  ));

  const code = generateOtpCode();
  await withDbRetry(async () => OtpToken.create({
    userId: user.id,
    purpose: VERIFICATION,
    codeHash: await hashSecret(code),
    expiresAt: minutesFromNow(env.otp.expiresMinutes),
  }));
  await sendOtpEmail(user.email, user.firstName, code);
}

export async function login(req: Request, res: Response) {
  const reqId = req.id || (req.headers['x-request-id'] as string) || 'unknown';
  const { email, password } = req.body as { email: string; password: string };

  // Step 1: Search user in DB with auto retry
  let user: User | null;
  try {
    user = await withDbRetry(() => User.findOne({ where: { email } }));
  } catch (err: unknown) {
    console.error(`[login] reqId=${reqId} User.findOne failed:`, err instanceof Error ? err.message : String(err));
    throw ApiError.database('Database unavailable. Please try again.', 'DATABASE_UNAVAILABLE');
  }

  if (!user) {
    // Timing attack mitigation: Run bcrypt.compare against dummy hash to equalize timing
    await bcrypt.compare(password, DUMMY_BCRYPT_HASH).catch(() => false);
    throw ApiError.unauthorized('Invalid email or password', 'AUTH_INVALID_CREDENTIALS');
  }

  // Step 2: Bcrypt comparison
  let matches: boolean;
  try {
    matches = await bcrypt.compare(password, user.passwordHash);
  } catch (err: unknown) {
    console.error(`[login] reqId=${reqId} bcrypt.compare failed:`, err instanceof Error ? err.message : String(err));
    throw new ApiError(500, 'Authentication verification failed', 'AUTH_PASSWORD_CHECK_FAILED');
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

  primeUserAuthCache(user);
  setAuthCookie(req, res, token);
  return sendSuccess(res, { token, user: toPublicUser(user), requiresVerification: false }, 'Signed in');
}

export async function verifyOtp(req: Request, res: Response) {
  const { email, code } = req.body as { email: string; code: string };
  const user = await withDbRetry(() => User.findOne({ where: { email } }));
  if (!user) throw ApiError.badRequest('Invalid or expired code');
  if (!user.isActive) throw ApiError.forbidden('This account is disabled');

  const token = await withDbRetry(() => OtpToken.findOne({
    where: { userId: user.id, purpose: VERIFICATION, consumedAt: null },
    order: [['createdAt', 'DESC']],
  }));
  if (!token) throw ApiError.badRequest('Invalid or expired code');
  if (token.expiresAt.getTime() < Date.now()) throw ApiError.badRequest('This code has expired. Request a new one.');

  // Atomic attempt counter: Increment in DB and return new value to prevent race condition bypassing 5-attempt limit
  const [updateResult] = await withDbRetry(() => sequelize.query<{ attempts: number }>(
    `UPDATE otp_tokens
     SET attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP
     WHERE id = :id AND attempts < :maxAttempts AND consumed_at IS NULL
     RETURNING attempts;`,
    {
      replacements: { id: token.id, maxAttempts: env.otp.maxAttempts },
      type: QueryTypes.SELECT,
    },
  ));

  if (!updateResult || Number(updateResult.attempts) > env.otp.maxAttempts) {
    throw ApiError.tooManyRequests('Too many incorrect attempts. Request a new code.');
  }

  const valid = await compareSecret(code, token.codeHash);
  if (!valid) {
    throw ApiError.badRequest('Invalid or expired code');
  }

  token.consumedAt = new Date();
  await withDbRetry(() => token.save());

  user.emailVerified = true;
  user.lastLoginAt = new Date();
  await withDbRetry(() => user.save());

  const jwtToken = signAuthToken({ id: user.id, role: user.role, email: user.email, tokenVersion: user.tokenVersion });
  primeUserAuthCache(user);
  setAuthCookie(req, res, jwtToken);
  return sendSuccess(res, { token: jwtToken, user: toPublicUser(user) }, 'Account verified');
}

export async function resendOtp(req: Request, res: Response) {
  const { email } = req.body as { email: string };
  const user = await withDbRetry(() => User.findOne({ where: { email } }));
  if (user && user.isActive && !user.emailVerified) {
    await issueOtp(user);
  }
  return sendSuccess(res, { sent: true }, 'If the account needs verification, a new code has been sent.');
}

export async function forgotPassword(req: Request, res: Response) {
  const { email } = req.body as { email: string };
  const user = await withDbRetry(() => User.findOne({ where: { email } }));
  if (user && user.isActive) {
    await withDbRetry(() => PasswordResetToken.update(
      { usedAt: new Date() },
      { where: { userId: user.id, usedAt: null } },
    ));
    const rawToken = generateResetToken();
    await withDbRetry(() => PasswordResetToken.create({
      userId: user.id,
      tokenHash: sha256(rawToken),
      expiresAt: minutesFromNow(env.passwordReset.expiresMinutes),
    }));
    await sendPasswordResetEmail(user.email, user.firstName, rawToken);
  }
  return sendSuccess(res, { sent: true }, 'If that email exists, a reset link has been sent.');
}

export async function resetPassword(req: Request, res: Response) {
  const { token, password } = req.body as { token: string; password: string };
  const candidateHash = sha256(token || '');
  const record = await withDbRetry(() => PasswordResetToken.findOne({
    where: { tokenHash: candidateHash, usedAt: null, expiresAt: { [Op.gt]: new Date() } },
  }));

  const dummyHash = sha256('dummy-token-for-constant-time-comparison');
  const expectedHash = record ? record.tokenHash : dummyHash;
  const candidateBuf = Buffer.from(candidateHash, 'hex');
  const expectedBuf = Buffer.from(expectedHash, 'hex');
  const isMatch = candidateBuf.length === expectedBuf.length && crypto.timingSafeEqual(candidateBuf, expectedBuf);

  if (!record || !isMatch) {
    throw ApiError.badRequest('This reset link is invalid or has expired');
  }

  const user = await withDbRetry(() => User.findByPk(record.userId));
  if (!user) throw ApiError.badRequest('This reset link is invalid or has expired');

  user.passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
  user.tokenVersion = (user.tokenVersion || 1) + 1;
  await withDbRetry(() => user.save());
  record.usedAt = new Date();
  await withDbRetry(() => record.save());

  // Invalidate any other active reset tokens for this user
  await withDbRetry(() => PasswordResetToken.update(
    { usedAt: new Date() },
    { where: { userId: user.id, usedAt: null } },
  ));

  return sendSuccess(res, { reset: true }, 'Password updated. You can now sign in.');
}

export async function changePassword(req: Request, res: Response) {
  const user = currentUser(req);
  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
  const matches = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!matches) throw ApiError.badRequest('Current password is incorrect');
  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
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
  const user = currentUser(req);
  return sendSuccess(res, toPublicUser(user), 'OK');
}

export async function logout(req: Request, res: Response) {
  const user = currentUser(req);
  user.tokenVersion = (Number(user.tokenVersion) || 1) + 1;
  await user.save();
  clearAuthCookie(req, res);
  return sendSuccess(res, { loggedOut: true }, 'Signed out');
}
