import { Request, Response } from 'express';
import { env } from '../config/env';

export const AUTH_COOKIE_NAME = 'crm_session';

/**
 * Parses raw Cookie header string into key-value pairs without external dependencies.
 */
export function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx < 0) continue;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    try {
      cookies[key] = decodeURIComponent(val);
    } catch {
      cookies[key] = val;
    }
  }
  return cookies;
}

/**
 * Issues an httpOnly, Secure, SameSite=Lax session cookie if cookieAuth is enabled.
 */
export function setAuthCookie(req: Request, res: Response, token: string): void {
  if (!env.cookieAuth.enabled) return;
  const isSecure = env.isProduction || req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'test';
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    path: '/api',
    maxAge: env.cookieAuth.maxAgeMs,
  });
}

/**
 * Clears the crm_session cookie on logout.
 */
export function clearAuthCookie(req: Request, res: Response): void {
  const isSecure = env.isProduction || req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'test';
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    path: '/api',
  });
}
