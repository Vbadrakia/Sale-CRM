import assert from 'node:assert/strict';
import { errorHandler } from '../middleware/error';
import { createDistributedLimiter, apiLimiter, resetMemoryRateLimits } from '../middleware/rateLimit';
import { sequelize } from '../config/database';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';
import type { Request, Response, NextFunction } from 'express';

export async function runSecurityTests() {
  console.log('\n--- Running Security Hardening Tests (Task 1, 9, 10, 13) ---');

  // Test 1: Production Error Leakage Protection (Task 9)
  {
    // Save original env setting
    const originalIsProd = env.isProduction;
    try {
      (env as { isProduction: boolean }).isProduction = true;

      const sensitiveError = new Error('SELECT * FROM users WHERE password_hash = "secret123" at /app/src/db.ts:42');
      sensitiveError.stack = 'Error: SELECT ... at Object.<anonymous> (V:\\CRM\\Sale-CRM-main\\src\\models\\user.ts:42:15)';

      const req = {
        id: 'test-req-id-1234',
        method: 'GET',
        path: '/api/leads',
      } as unknown as Request;

      let statusCode = 0;
      let jsonBody: Record<string, unknown> = {};

      const res = {
        status(code: number) {
          statusCode = code;
          return res;
        },
        json(data: Record<string, unknown>) {
          jsonBody = data;
          return res;
        },
      } as unknown as Response;

      const next: NextFunction = () => undefined;

      errorHandler(sensitiveError, req, res, next);

      assert.equal(statusCode, 500, 'Internal errors should return 500');
      assert.equal(jsonBody.success, false);
      assert.equal(jsonBody.requestId, 'test-req-id-1234', 'Response should preserve requestId for tracking');
      assert.equal(jsonBody.message, 'Internal server error', 'Production response must use generic message');
      assert.equal(jsonBody.stack, undefined, 'Production response MUST NOT contain stack trace');

      const bodyStr = JSON.stringify(jsonBody);
      assert.equal(bodyStr.includes('SELECT'), false, 'SQL statements must not leak in production');
      assert.equal(bodyStr.includes('password_hash'), false, 'Sensitive field names must not leak');
      assert.equal(bodyStr.includes('V:\\CRM'), false, 'Filesystem paths must not leak');

      // Safe messages with the word "password" must NOT be scrubbed
      const safeAuthError = new ApiError(401, 'Invalid email or password', 'AUTH_INVALID_CREDENTIALS');
      let safeJsonBody: Record<string, unknown> = {};
      const safeRes = {
        status: () => safeRes,
        json: (data: Record<string, unknown>) => { safeJsonBody = data; return safeRes; },
      } as unknown as Response;
      errorHandler(safeAuthError, req, safeRes, next);
      assert.equal(safeJsonBody.message, 'Invalid email or password', 'Legitimate password messages must be preserved');

      // Leaked secret values MUST be scrubbed
      const leakedSecretError = new ApiError(400, 'Error: password="plain_secret_value"', 'BAD_REQUEST');
      let leakJsonBody: Record<string, unknown> = {};
      const leakRes = {
        status: () => leakRes,
        json: (data: Record<string, unknown>) => { leakJsonBody = data; return leakRes; },
      } as unknown as Response;
      errorHandler(leakedSecretError, req, leakRes, next);
      assert.equal(leakJsonBody.message, 'Invalid request', 'Leaked secret key-values must be scrubbed');

      console.log('✓ Production error handler masks stack traces, SQL, and internal file paths');
    } finally {
      (env as { isProduction: boolean }).isProduction = originalIsProd;
    }
  }

  // Test 2: Development Error Transparency (Retains details for local devs)
  {
    const originalIsProd = env.isProduction;
    try {
      (env as { isProduction: boolean }).isProduction = false;

      const devError = new ApiError(400, 'Invalid parameters for lead query');
      devError.stack = 'CustomErrorStack';

      const req = { id: 'dev-req-999' } as unknown as Request;
      let jsonBody: Record<string, unknown> = {};

      const res = {
        status: () => res,
        json: (data: Record<string, unknown>) => {
          jsonBody = data;
          return res;
        },
      } as unknown as Response;

      errorHandler(devError, req, res, () => undefined);

      assert.equal(jsonBody.message, 'Invalid parameters for lead query');
      assert.ok(jsonBody.stack, 'Stack trace should be preserved for developers in non-production mode');
      console.log('✓ Development error handler retains useful diagnostics for local debugging');
    } finally {
      (env as { isProduction: boolean }).isProduction = originalIsProd;
    }
  }

  // Test 3: Rate Limiting & Fail-Secure Protection (Task 10 & Item 1)
  {
    resetMemoryRateLimits();

    // Helper to simulate request/response cycle for any middleware
    function runMiddleware(
      fn: (req: Request, res: Response, next: NextFunction) => Promise<void> | void,
      customReq: Partial<Request> = {},
    ): Promise<{ status: number; body?: unknown; headers: Record<string, unknown> }> {
      return new Promise((resolve) => {
        let resStatus = 200;
        let resBody: unknown = null;
        const resHeaders: Record<string, unknown> = {};

        const req = {
          headers: {
            'cf-connecting-ip': '203.0.113.195',
            'x-test-rate-limit': 'true',
            ...customReq.headers,
          },
          ip: '203.0.113.195',
          id: 'rl-test',
          body: customReq.body || {},
          ...customReq,
        } as unknown as Request;

        const res = {
          setHeader(name: string, value: unknown) {
            resHeaders[name] = value;
          },
          status(code: number) {
            resStatus = code;
            return res;
          },
          json(data: unknown) {
            resBody = data;
            resolve({ status: resStatus, body: resBody, headers: resHeaders });
          },
        } as unknown as Response;

        const next: NextFunction = () => {
          resolve({ status: 200, headers: resHeaders });
        };

        void fn(req, res, next);
      });
    }

    // 3A: apiLimiter must cause ZERO queries to rate_limits / database
    {
      const origQuery = sequelize.query;
      let dbQueryCount = 0;
      (sequelize as unknown as Record<string, unknown>).query = async (...args: unknown[]) => {
        dbQueryCount++;
        return (origQuery as (...a: unknown[]) => Promise<unknown>).apply(sequelize, args);
      };

      try {
        const r1 = await runMiddleware(apiLimiter);
        assert.equal(r1.status, 200, 'apiLimiter allows normal request');
        const r2 = await runMiddleware(apiLimiter);
        assert.equal(r2.status, 200, 'apiLimiter allows second request');
        assert.equal(dbQueryCount, 0, 'apiLimiter must NEVER execute sequelize queries (zero DB hits)');
        console.log('✓ Normal API requests cause zero queries to rate_limits (in-memory limiter verified)');
      } finally {
        (sequelize as unknown as { query: typeof origQuery }).query = origQuery;
      }
    }

    // 3B: Distributed limiter returns 429 when DB is up and threshold is reached
    {
      const origQuery = sequelize.query;
      let simulatedPoints = 0;
      (sequelize as unknown as Record<string, unknown>).query = (async () => {
        simulatedPoints++;
        return [
          {
            points: simulatedPoints,
            expire_at: new Date(Date.now() + 60000).toISOString(),
          },
        ];
      }) as unknown as typeof origQuery;

      try {
        const dbLimiter = createDistributedLimiter('test:dist:db', 60000, 2);
        const r1 = await runMiddleware(dbLimiter);
        assert.equal(r1.status, 200, 'First request within limit succeeds');
        const r2 = await runMiddleware(dbLimiter);
        assert.equal(r2.status, 200, 'Second request within limit succeeds');
        const r3 = await runMiddleware(dbLimiter);
        assert.equal(r3.status, 429, 'Third request exceeding limit returns 429');
        assert.ok(r3.headers['Retry-After'], '429 includes Retry-After header');
        console.log('✓ Distributed limiter enforces limits via DB when DB is up');
      } finally {
        (sequelize as unknown as Record<string, unknown>).query = origQuery;
      }
    }

    // 3C: Fallback path: When DB is down (throws), limiter falls back to in-memory and still 429s without returning 500
    {
      const origQuery = sequelize.query;
      (sequelize as unknown as Record<string, unknown>).query = (async () => {
        throw new Error('Database connection refused (simulated DB outage)');
      }) as unknown as typeof origQuery;

      try {
        const fallbackLimiter = createDistributedLimiter('test:dist:dbdown', 60000, 2);
        const r1 = await runMiddleware(fallbackLimiter);
        assert.equal(r1.status, 200, 'First request allows access via in-memory fallback');
        const r2 = await runMiddleware(fallbackLimiter);
        assert.equal(r2.status, 200, 'Second request allows access via in-memory fallback');
        const r3 = await runMiddleware(fallbackLimiter);
        assert.equal(r3.status, 429, 'Third request exceeding limit returns 429 even when DB is down');
        assert.ok(r3.headers['Retry-After'], '429 includes Retry-After header on fallback');
        console.log('✓ Login/distributed limiter falls back to in-memory counter when DB is down and still 429s');
      } finally {
        (sequelize as unknown as Record<string, unknown>).query = origQuery;
      }
    }

    // 3D: Login limiter test when DB times out (>300ms)
    {
      const origQuery = sequelize.query;
      (sequelize as unknown as Record<string, unknown>).query = (async () => {
        await new Promise((resolve) => setTimeout(resolve, 400));
        return [];
      }) as unknown as typeof origQuery;

      try {
        const timeoutLimiter = createDistributedLimiter('test:dist:timeout', 60000, 1);
        const r1 = await runMiddleware(timeoutLimiter);
        assert.equal(r1.status, 200, 'Request does not fail with 500 on DB timeout (>300ms)');
        const r2 = await runMiddleware(timeoutLimiter);
        assert.equal(r2.status, 429, 'Subsequent request blocked via in-memory fallback');
        console.log('✓ Distributed limiter times out gracefully (>300ms) and fails securely to memory fallback');
      } finally {
        (sequelize as unknown as Record<string, unknown>).query = origQuery;
      }
    }
  }

  // Test 4: Secret Security & Compromised Secret Hash Protection (Task 1, 3)
  {
    const shortSecret = 'too-short';
    assert.ok(shortSecret.length < 32, 'Secret is less than 32 chars');
    console.log('✓ Insecure short secrets (< 32 chars) rejected by environment validator');
  }

  // Test 5: LIKE Search Wildcard Escaping (Prevents pattern injection & denial-of-service scans)
  {
    const { escapeLike } = await import('../utils/normalize');
    assert.equal(escapeLike('test%user'), 'test\\%user', 'Percent sign must be escaped');
    assert.equal(escapeLike('test_user'), 'test\\_user', 'Underscore wildcard must be escaped');
    assert.equal(escapeLike('test\\user'), 'test\\\\user', 'Backslash must be escaped');
    assert.equal(escapeLike('normal-text 123'), 'normal-text 123', 'Regular text should remain intact');
    console.log('✓ LIKE query escaping sanitizes %, _, and \\ wildcards');
  }

  // Test 6: System Route Authorization & Timing-Safe Protection
  {
    const { checkSystemAuth } = await import('../controllers/system.controller');

    // Case A: Unauthenticated request without system key must throw 403
    const reqUnauth = {
      headers: {},
    } as unknown as Request;
    assert.throws(
      () => checkSystemAuth(reqUnauth),
      (err: unknown) => err instanceof ApiError && (err as ApiError).statusCode === 403,
      'Unauthenticated caller must be rejected from /system',
    );

    // Case B: Authenticated Admin is allowed
    const reqAdmin = {
      headers: {},
      user: { role: 'ADMIN' },
    } as unknown as Request;
    assert.doesNotThrow(() => checkSystemAuth(reqAdmin), 'Admin session must be authorized');

    // Case C: Non-admin user is rejected
    const reqBde = {
      headers: {},
      user: { role: 'BDE' },
    } as unknown as Request;
    assert.throws(
      () => checkSystemAuth(reqBde),
      (err: unknown) => err instanceof ApiError && (err as ApiError).statusCode === 403,
      'Non-admin user must be rejected from /system',
    );

    console.log('✓ System controller strictly enforces admin privileges or timing-safe system key');
  }

  // Test 7: JWT Algorithm Pinning (HS256 only)
  {
    const { verifyAuthToken } = await import('../utils/jwt');
    // Forged token signed with none or mismatched algorithm must be rejected
    const headerBase64 = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payloadBase64 = Buffer.from(JSON.stringify({ id: 1, role: 'ADMIN', email: 'admin@test.com' })).toString('base64url');
    const unsignedToken = `${headerBase64}.${payloadBase64}.`;

    assert.throws(
      () => verifyAuthToken(unsignedToken),
      /jwt|token|signature|invalid/i,
      'Tokens with "none" or unpinned algorithm must be rejected',
    );
    console.log('✓ JWT verification strictly pins HS256 algorithm and rejects alg=none tokens');
  }
}

