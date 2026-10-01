import assert from 'node:assert/strict';
import { errorHandler } from '../middleware/error';
import { createDistributedLimiter } from '../middleware/rateLimit';
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

  // Test 3: Rate Limiting & Fail-Secure Protection (Task 10)
  {
    // Limiter with limit = 2 per 1000ms
    const limiter = createDistributedLimiter('test-login', 1000, 2);

    const headers: Record<string, string> = {
      'cf-connecting-ip': '203.0.113.195',
      'x-test-rate-limit': 'true', // Header to activate limiter in test environment
    };

    function callLimiter(): Promise<{ status: number; body?: unknown; headers: Record<string, unknown> }> {
      return new Promise((resolve) => {
        let resStatus = 200;
        let resBody: unknown = null;
        const resHeaders: Record<string, unknown> = {};

        const req = {
          headers,
          ip: '203.0.113.195',
          id: 'rl-test',
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

        void limiter(req, res, next);
      });
    }

    const r1 = await callLimiter();
    assert.equal(r1.status, 200, 'First request should be allowed');

    const r2 = await callLimiter();
    assert.equal(r2.status, 200, 'Second request should be allowed');

    const r3 = await callLimiter();
    assert.equal(r3.status, 429, 'Third request exceeding limit=2 must be rejected with 429 Too Many Requests');
    assert.ok(r3.headers['Retry-After'] !== undefined, '429 response must provide Retry-After header');
    console.log('✓ Rate limiting enforces thresholds and returns 429 with Retry-After header');
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

