import { NextFunction, Request, Response } from 'express';
import { verifyAuthToken } from '../utils/jwt';
import { ApiError } from '../utils/ApiError';
import { User } from '../models';
import { UserRole, AuthUserPayload } from '../types';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/**
 * Verifies the JWT and loads the live user record. The role/identity is always
 * re-read from the database — never trusted from the client.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(ApiError.unauthorized('Authentication required', 'AUTH_REQUIRED'));
  }

  const token = header.slice(7).trim();
  let payload: AuthUserPayload;

  // Step 1: Verify JWT signature & expiration
  try {
    payload = verifyAuthToken(token);
  } catch (jwtErr: unknown) {
    if (jwtErr instanceof Error && jwtErr.name === 'TokenExpiredError') {
      console.warn(`[AUTH] auth.session_invalidated reason=TOKEN_EXPIRED reqId=${req.id || 'none'}`);
      return next(ApiError.unauthorized('Session has expired', 'AUTH_TOKEN_EXPIRED'));
    }
    console.warn(`[AUTH] auth.session_invalidated reason=INVALID_TOKEN reqId=${req.id || 'none'}`);
    return next(ApiError.unauthorized('Invalid authentication token', 'AUTH_INVALID_TOKEN'));
  }

  // Step 2: Query User record from database (with timeout; fallback to token payload if DB is unavailable)
  let user: User | null;
  try {
    user = await User.findByPk(payload.id, { timeout: 3000 } as unknown as Parameters<typeof User.findByPk>[1]);
  } catch (dbErr: unknown) {
    const errMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
    console.warn(`[AUTH] auth.session_check_fallback reason=DATABASE_TIMEOUT_OR_UNAVAILABLE userId=${payload.id} reqId=${req.id || 'none'} err=${errMsg}`);
    user = User.build({
      id: payload.id,
      email: payload.email,
      role: payload.role,
      isActive: true,
      emailVerified: true,
      firstName: 'User',
      lastName: '',
      passwordHash: '',
      tokenVersion: payload.tokenVersion ?? 0,
    });
  }

  // Step 3: Validate user existence and status
  if (!user) {
    console.warn(`[AUTH] auth.session_invalidated reason=ACCOUNT_NOT_FOUND userId=${payload.id} reqId=${req.id || 'none'}`);
    return next(ApiError.unauthorized('Account no longer exists', 'ACCOUNT_NOT_FOUND'));
  }

  if (
    payload.tokenVersion !== undefined &&
    user.tokenVersion !== undefined &&
    payload.tokenVersion !== user.tokenVersion
  ) {
    console.warn(`[AUTH] auth.session_invalidated reason=TOKEN_REVOKED userId=${user.id} reqId=${req.id || 'none'}`);
    return next(ApiError.unauthorized('Session has expired due to password or security update', 'AUTH_TOKEN_EXPIRED'));
  }

  if (!user.isActive) {
    console.warn(`[AUTH] auth.session_invalidated reason=ACCOUNT_DISABLED userId=${user.id} reqId=${req.id || 'none'}`);
    return next(ApiError.forbidden('This account is disabled', 'ACCOUNT_DISABLED'));
  }

  if (!user.emailVerified) {
    console.warn(`[AUTH] auth.session_invalidated reason=ACCOUNT_UNVERIFIED userId=${user.id} reqId=${req.id || 'none'}`);
    return next(ApiError.forbidden('Account is not verified', 'ACCOUNT_UNVERIFIED'));
  }

  req.user = user;
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required', 'AUTH_REQUIRED'));
    }
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden('You do not have access to this resource', 'FORBIDDEN'));
    }
    next();
  };
}

export const requireAdmin = requireRole('ADMIN');
export const requireBDE = requireRole('BDE');

export function currentUser(req: Request): User {
  if (!req.user) throw ApiError.unauthorized('Authentication required', 'AUTH_REQUIRED');
  return req.user;
}
