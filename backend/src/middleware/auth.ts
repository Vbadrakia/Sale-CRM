import { NextFunction, Request, Response } from 'express';
import { verifyAuthToken } from '../utils/jwt';
import { ApiError } from '../utils/ApiError';
import { User } from '../models';
import { UserRole, AuthUserPayload } from '../types';
import { withDbRetry } from '../config/database';
import { env } from '../config/env';
import { AUTH_COOKIE_NAME, parseCookies } from '../utils/cookies';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

interface CachedUserRecord {
  user: User;
  cachedAt: number;
}

const AUTH_CACHE_TTL_MS = 30_000; // 30 seconds max TTL
const MAX_AUTH_CACHE_SIZE = 1000;

const userAuthCache = new Map<string, CachedUserRecord>();
const userAuthInFlight = new Map<string, Promise<User | null>>();

export function clearUserAuthCache(userId?: number | string) {
  if (userId) {
    const prefix = `${userId}:`;
    for (const key of userAuthCache.keys()) {
      if (key.startsWith(prefix) || key === String(userId)) {
        userAuthCache.delete(key);
      }
    }
  } else {
    userAuthCache.clear();
  }
}

function pruneExpiredAuthCache(now: number) {
  for (const [key, record] of userAuthCache.entries()) {
    if (now - record.cachedAt > AUTH_CACHE_TTL_MS) {
      userAuthCache.delete(key);
    }
  }
}

/**
 * Verifies the JWT and loads the live user record. The role/identity is always
 * verified against the database — never trusted from unverified client claims.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    let token: string | undefined;
    let isFromCookie = false;

    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
      token = header.slice(7).trim();
    } else if (env.cookieAuth.enabled) {
      const cookies = parseCookies(req.headers.cookie);
      if (cookies[AUTH_COOKIE_NAME]) {
        token = cookies[AUTH_COOKIE_NAME];
        isFromCookie = true;
      }
    }

    if (!token) {
      return next(ApiError.unauthorized('Authentication required', 'AUTH_REQUIRED'));
    }

    // CSRF protection: When cookie auth is used on state-changing requests (POST/PUT/PATCH/DELETE), enforce custom header X-Requested-With: crm
    if (isFromCookie) {
      const method = (req.method || 'GET').toUpperCase();
      const isStateChanging = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
      if (isStateChanging) {
        const rawRequestedWith = req.headers['x-requested-with'];
        const requestedWith = Array.isArray(rawRequestedWith) ? rawRequestedWith[0] : rawRequestedWith;
        if (!requestedWith || requestedWith.toLowerCase() !== 'crm') {
          return next(ApiError.forbidden('CSRF protection: missing or invalid X-Requested-With header', 'CSRF_INVALID'));
        }
      }
    }
    let payload: AuthUserPayload;

    // Step 1: Verify JWT signature & expiration (pinned to HS256)
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

    // Step 2: Query User record from database or short-lived cache (30s)
    let user: User | null = null;
    const targetId = Number(payload.id);
    const queryId = isNaN(targetId) ? payload.id : targetId;
    const cacheKey = `${queryId}:${payload.tokenVersion ?? 0}`;
    const now = Date.now();

    if (userAuthCache.size > MAX_AUTH_CACHE_SIZE) {
      pruneExpiredAuthCache(now);
    }

    const cached = userAuthCache.get(cacheKey);

    if (cached && now - cached.cachedAt < AUTH_CACHE_TTL_MS) {
      user = cached.user;
    } else {
      let inFlight = userAuthInFlight.get(cacheKey);
      if (!inFlight) {
        inFlight = withDbRetry(() => User.findByPk(queryId));
        userAuthInFlight.set(cacheKey, inFlight);
      }
      try {
        user = await inFlight;
        if (user) {
          userAuthCache.set(cacheKey, { user, cachedAt: now });
        }
      } catch (dbErr: unknown) {
        const errMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
        console.error(`[AUTH] DB user lookup failed: ${errMsg}`);
        // FAIL CLOSED: Return 503 instead of fabricating a mock active admin/user
        return next(ApiError.database('Database connection unavailable. Please try again.', 'DATABASE_UNAVAILABLE'));
      } finally {
        userAuthInFlight.delete(cacheKey);
      }
    }

    // Step 3: Validate user existence and status
    if (!user) {
      userAuthCache.delete(cacheKey);
      console.warn(`[AUTH] auth.session_invalidated reason=ACCOUNT_NOT_FOUND userId=${payload.id} reqId=${req.id || 'none'}`);
      return next(ApiError.unauthorized('Account no longer exists', 'ACCOUNT_NOT_FOUND'));
    }

    const dbTokenVersion = user.tokenVersion ?? (user.dataValues as unknown as { token_version?: number })?.token_version;
    if (
      payload.tokenVersion !== undefined &&
      dbTokenVersion !== undefined &&
      Number(payload.tokenVersion) !== Number(dbTokenVersion)
    ) {
      console.warn(`[AUTH] auth.session_invalidated reason=TOKEN_REVOKED userId=${user.id} payloadVer=${payload.tokenVersion} dbVer=${dbTokenVersion} reqId=${req.id || 'none'}`);
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
