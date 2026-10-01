import type { Request, Response, NextFunction } from 'express';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';

interface RateLimitRow {
  points: number;
  expire_at: Date | string;
}

interface MemoryRateLimitRecord {
  count: number;
  resetAt: number;
}

const isWorkerRuntime =
  typeof (globalThis as unknown as { WebSocketPair?: unknown }).WebSocketPair !== 'undefined';

function resolveClientIp(req: Request): string {
  // Only trust cf-connecting-ip in genuine Cloudflare Worker runtime
  if (isWorkerRuntime) {
    const cfIp = req.headers['cf-connecting-ip'];
    if (typeof cfIp === 'string' && cfIp.trim()) {
      return cfIp.split(',')[0].trim();
    }
  }
  // For test suites activating rate limit test
  if (process.env.NODE_ENV === 'test' && req.headers['cf-connecting-ip']) {
    return String(req.headers['cf-connecting-ip']).split(',')[0].trim();
  }
  // Standard Express ip resolution (honors trust proxy)
  if (req.ip) {
    return req.ip;
  }
  return req.socket?.remoteAddress || '127.0.0.1';
}

// Bounded in-memory fallback with LRU eviction to prevent memory DoS
const MAX_IN_MEMORY_KEYS = 5000;
const fallbackHits = new Map<string, MemoryRateLimitRecord>();

function pruneExpiredHits(now: number) {
  for (const [k, v] of fallbackHits.entries()) {
    if (v.resetAt <= now) {
      fallbackHits.delete(k);
    }
  }
}

function inMemoryFallback(
  key: string,
  windowMs: number,
  limit: number,
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  if (fallbackHits.size > MAX_IN_MEMORY_KEYS) {
    pruneExpiredHits(now);
    if (fallbackHits.size >= MAX_IN_MEMORY_KEYS) {
      const firstKey = fallbackHits.keys().next().value;
      if (firstKey) fallbackHits.delete(firstKey);
    }
  }

  const record = fallbackHits.get(key);
  if (!record || record.resetAt <= now) {
    const resetAt = now + windowMs;
    fallbackHits.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }
  if (record.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: record.resetAt };
  }
  record.count++;
  return { allowed: true, remaining: limit - record.count, resetAt: record.resetAt };
}

async function dbRateLimit(
  key: string,
  windowMs: number,
  limit: number,
): Promise<{ allowed: boolean; remaining: number; resetAt: number } | null> {
  // In test mode, use memory rate limiter for fast tests
  if (process.env.NODE_ENV === 'test') {
    return null;
  }

  try {
    const expireAt = new Date(Date.now() + windowMs);
    const [row] = await sequelize.query<RateLimitRow>(
      `INSERT INTO rate_limits (key, points, expire_at, created_at, updated_at)
       VALUES (:key, 1, :expireAt, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE
       SET points = CASE
             WHEN rate_limits.expire_at <= CURRENT_TIMESTAMP THEN 1
             ELSE rate_limits.points + 1
           END,
           expire_at = CASE
             WHEN rate_limits.expire_at <= CURRENT_TIMESTAMP THEN :expireAt
             ELSE rate_limits.expire_at
           END,
           updated_at = CURRENT_TIMESTAMP
       RETURNING points, expire_at;`,
      {
        replacements: { key, expireAt },
        type: QueryTypes.SELECT,
      },
    );

    if (row) {
      const resetAt = new Date(row.expire_at).getTime();
      const points = Number(row.points);
      const allowed = points <= limit;
      const remaining = Math.max(0, limit - points);
      return { allowed, remaining, resetAt };
    }
  } catch {
    // If DB is unreachable, fail securely to in-memory fallback
  }
  return null;
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

    const ip = resolveClientIp(req);
    const customKey = keyGenerator ? keyGenerator(req) : '';
    const key = customKey ? `${prefix}:${ip}:${customKey}` : `${prefix}:${ip}`;

    // Try DB-backed counter for distributed worker isolates, fallback to bounded in-memory
    let result = await dbRateLimit(key, windowMs, limit);
    if (!result) {
      result = inMemoryFallback(key, windowMs, limit);
    }

    const retryAfterSeconds = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));

    if (!result.allowed) {
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

// Per-IP global login rate limit (30 attempts per 15 min per IP to stop credential spraying)
const loginIpLimiter = createDistributedLimiter('auth:login:ip', 15 * 60 * 1000, 30);

// Per-(IP + Email) login rate limit (10 attempts per 15 min per account)
const loginAccountLimiter = createDistributedLimiter('auth:login:account', 15 * 60 * 1000, 10, (req) => {
  const email = (req.body as { email?: string })?.email;
  return email ? email.toLowerCase().trim() : '';
});

// Dual-bucket login limiter: checks both per-IP and per-account limits
export const loginLimiter = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  await loginIpLimiter(req, res, async () => {
    await loginAccountLimiter(req, res, next);
  });
};

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
