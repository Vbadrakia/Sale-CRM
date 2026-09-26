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
  try {
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

    // Step 2: Query User record from database (FAIL CLOSED: never construct fallback from JWT claims)
    let user: User | null;
    try {
      const targetId = Number(payload.id);
      user = await User.findByPk(isNaN(targetId) ? payload.id : targetId);
    } catch (dbErr: unknown) {
      const errMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      console.error(`[AUTH] auth.session_check_failed reason=DATABASE_UNAVAILABLE userId=${payload.id} reqId=${req.id || 'none'} err=${errMsg}`);
      return next(ApiError.database('Authentication service temporarily unavailable', 'DATABASE_UNAVAILABLE'));
    }

    // Step 3: Validate user existence and status
    if (!user) {
      console.warn(`[AUTH] auth.session_invalidated reason=ACCOUNT_NOT_FOUND userId=${payload.id} reqId=${req.id || 'none'}`);
      return next(ApiError.unauthorized('Account no longer exists', 'ACCOUNT_NOT_FOUND'));
    }

    const dbTokenVersion = user.tokenVersion ?? (user.dataValues as unknown as { token_version?: number })?.token_version;
    if (
      payload.tokenVersion !== undefined &&
      dbTokenVersion !== undefined &&
      Number(payload.tokenVersion) !== Number(dbTokenVersion)
    ) {
      console.warn(`[AUTH] auth.session_invalidated reason=TOKEN_REVOKED userId=${user.id} reqId=${req.id || 'none'}`);
      return next(ApiError.unauthorized('Session has been revoked. Please sign in again.', 'AUTH_TOKEN_REVOKED'));
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
    return next();
  } catch (outerErr: unknown) {
    console.error(`[AUTH] auth.unexpected_error reqId=${req.id || 'none'} err=`, outerErr);
    return next(outerErr);
  }
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
