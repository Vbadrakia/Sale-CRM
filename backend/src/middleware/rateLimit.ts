import type { Request, Response, NextFunction } from 'express';

const message = { success: false, message: 'Too many attempts. Please try again later.', errors: [] };

/**
 * Worker-safe in-memory rate limiter.
 * Cloudflare Workers disallows background setTimeout/setInterval timers in the global module scope.
 * This implementation lazily checks and expires windows on incoming requests without global timers,
 * while respecting Cloudflare's cf-connecting-ip header.
 */
function createLimiter(windowMs: number, limit: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    if (process.env.NODE_ENV === 'test') {
      next();
      return;
    }
    const ip = req.headers['cf-connecting-ip'] || req.ip || req.headers['x-forwarded-for'] || 'client';
    const key = String(ip);
    const now = Date.now();

    const record = hits.get(key);
    if (!record || record.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (record.count >= limit) {
      res.status(429).json(message);
      return;
    }

    record.count++;
    next();
  };
}

export const loginLimiter = createLimiter(15 * 60 * 1000, 10);
export const otpLimiter = createLimiter(15 * 60 * 1000, 15);
export const passwordResetLimiter = createLimiter(60 * 60 * 1000, 10);
export const apiLimiter = createLimiter(60 * 1000, 300);
