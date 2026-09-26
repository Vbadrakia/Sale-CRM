import type { Request, Response, NextFunction } from 'express';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';

interface RateLimitRow {
  points: number;
  expire_at: Date | string;
}

// In-memory fallback in case of transient DB failure so auth rate limiting is NEVER disabled
const fallbackHits = new Map<string, { count: number; resetAt: number }>();

function inMemoryFallback(key: string, windowMs: number, limit: number): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const record = fallbackHits.get(key);
  if (!record || record.resetAt <= now) {
    fallbackHits.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }
  if (record.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: record.resetAt };
  }
  record.count++;
  return { allowed: true, remaining: limit - record.count, resetAt: record.resetAt };
}

export function createDistributedLimiter(
  prefix: string,
  windowMs: number,
  limit: number,
  keyGenerator?: (req: Request) => string,
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // In test environment, skip unless explicitly testing rate limits with x-test-rate-limit header
    if (process.env.NODE_ENV === 'test' && !req.headers['x-test-rate-limit']) {
      next();
      return;
    }

    const ip = String(
      req.headers['cf-connecting-ip'] ||
        req.ip ||
        req.headers['x-forwarded-for'] ||
        req.socket?.remoteAddress ||
        '127.0.0.1',
    ).split(',')[0].trim();

    const customKey = keyGenerator ? keyGenerator(req) : '';
    const key = customKey ? `${prefix}:${ip}:${customKey}` : `${prefix}:${ip}`;

    // Fast-path: Perform edge in-memory throttling for zero latency and worker safety
    const fallback = inMemoryFallback(key, windowMs, limit);
    const retryAfterSeconds = Math.max(1, Math.ceil((fallback.resetAt - Date.now()) / 1000));
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', fallback.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(fallback.resetAt / 1000));
    if (!fallback.allowed) {
      res.setHeader('Retry-After', retryAfterSeconds);
      res.status(429).json({
        success: false,
        code: 'RATE_LIMITED',
        message: 'Too many attempts. Please try again later.',
        errors: [],
        retryAfter: retryAfterSeconds,
        requestId: req.id,
      });
      return;
    }
    next();
  };
}

// 10 attempts per 15 minutes per IP
export const loginLimiter = createDistributedLimiter('auth:login', 15 * 60 * 1000, 10, (req) => {
  const email = (req.body as { email?: string })?.email;
  return email ? email.toLowerCase().trim() : '';
});

// 15 attempts per 15 minutes per IP
export const otpLimiter = createDistributedLimiter('auth:otp', 15 * 60 * 1000, 15, (req) => {
  const email = (req.body as { email?: string })?.email;
  return email ? email.toLowerCase().trim() : '';
});

// 10 password reset attempts per hour per IP
export const passwordResetLimiter = createDistributedLimiter('auth:pwreset', 60 * 60 * 1000, 10, (req) => {
  const email = (req.body as { email?: string })?.email;
  return email ? email.toLowerCase().trim() : '';
});

// General API: 300 requests per minute
export const apiLimiter = createDistributedLimiter('api:global', 60 * 1000, 300);
