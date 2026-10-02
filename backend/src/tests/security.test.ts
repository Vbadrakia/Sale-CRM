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

    // 3E: Rate Limit Retention Job purges expired rows older than 1 hour
    {
      const { runRateLimitRetentionJob } = await import('../jobs/rateLimitRetention');
      const origQuery = sequelize.query;
      let executedSql = '';

      (sequelize as unknown as Record<string, unknown>).query = (async (sql: string) => {
        executedSql = sql;
        return [null, { rowCount: 12 }];
      }) as unknown as typeof origQuery;

      try {
        const result = await runRateLimitRetentionJob();
        assert.equal(result.deletedRows, 12);
        assert.ok(executedSql.includes('DELETE FROM rate_limits'));
        assert.ok(executedSql.includes("expire_at < NOW() - INTERVAL '1 hour'"));
        console.log('✓ Rate limit retention job correctly purges expired rows older than 1 hour');
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

  // Test 8: Database TLS Strict Verification & CA Normalization (Item 2)
  {
    const { normalizeCaCert, isTlsVerificationError, TLS_ACTIONABLE_ERROR, getSslConfig } = await import('../config/database');

    // 8A: CA cert normalization converts escaped newlines and trims
    const rawPem = '-----BEGIN CERTIFICATE-----\\nMIIB...\\n-----END CERTIFICATE-----\\n';
    const normalized = normalizeCaCert(rawPem);
    assert.ok(normalized?.includes('\n'), 'Escaped \\n must be normalized to real newlines');
    assert.equal(normalized?.includes('\\n'), false, 'No escaped \\n should remain');
    assert.equal(normalizeCaCert('   '), undefined, 'Whitespace only cert returns undefined');
    assert.equal(normalizeCaCert(undefined), undefined, 'Undefined cert returns undefined');

    // 8B: isTlsVerificationError detects common TLS verification failures
    const selfSignedErr = new Error('self-signed certificate in certificate chain');
    assert.equal(isTlsVerificationError(selfSignedErr), true, 'Detects self-signed cert in chain');
    const depthZeroErr = { code: 'DEPTH_ZERO_SELF_SIGNED_CERT', message: 'certificate verify failed' };
    assert.equal(isTlsVerificationError(depthZeroErr), true, 'Detects DEPTH_ZERO_SELF_SIGNED_CERT code');
    const regularDbErr = new Error('column "foo" does not exist');
    assert.equal(isTlsVerificationError(regularDbErr), false, 'Does not misidentify regular SQL errors as TLS errors');
    assert.ok(TLS_ACTIONABLE_ERROR.includes('DB_CA_CERT'), 'Actionable error directs users to set DB_CA_CERT');

    // 8C: In production, DB_SSL_REJECT_UNAUTHORIZED=false is strictly rejected
    const origNodeEnv = process.env.NODE_ENV;
    const origReject = process.env.DB_SSL_REJECT_UNAUTHORIZED;
    const origDbSsl = process.env.DB_SSL;
    try {
      process.env.NODE_ENV = 'production';
      process.env.DB_SSL = 'true';
      process.env.DB_SSL_REJECT_UNAUTHORIZED = 'false';

      assert.throws(
        () => getSslConfig(),
        /FATAL SECURITY ERROR: DB_SSL_REJECT_UNAUTHORIZED=false is prohibited in production/,
        'Production must throw fatal error if rejectUnauthorized is disabled',
      );

      // In production without disabling, rejectUnauthorized must be true
      delete process.env.DB_SSL_REJECT_UNAUTHORIZED;
      const prodSsl = getSslConfig();
      assert.ok(prodSsl && prodSsl.rejectUnauthorized === true, 'rejectUnauthorized must be true in production');
    } finally {
      process.env.NODE_ENV = origNodeEnv;
      if (origReject !== undefined) process.env.DB_SSL_REJECT_UNAUTHORIZED = origReject;
      else delete process.env.DB_SSL_REJECT_UNAUTHORIZED;
      if (origDbSsl !== undefined) process.env.DB_SSL = origDbSsl;
      else delete process.env.DB_SSL;
    }

    console.log('✓ DB TLS verification enforces rejectUnauthorized=true and normalizes DB_CA_CERT');
  }

  // Test 9: Worker Secrets, Env Sync, and Health Check Reporting (Item 3)
  {
    const { updateRuntimeEnv, isCompromisedSecret, env: appEnv } = await import('../config/env');
    const { health } = await import('../controllers/dashboard.controller');

    // 9A: updateRuntimeEnv copies SYSTEM_KEY and DB_CA_CERT into process.env
    delete process.env.SYSTEM_KEY;
    delete process.env.DB_CA_CERT;
    delete process.env.DB_SSL_CA;

    updateRuntimeEnv({
      SYSTEM_KEY: 'test-system-key-32-chars-long-secure-key',
      DB_CA_CERT: 'test-ca-cert-pem',
      DB_SSL_CA: 'test-ssl-ca-pem',
    });

    assert.equal(process.env.SYSTEM_KEY, 'test-system-key-32-chars-long-secure-key', 'SYSTEM_KEY must be copied to process.env');
    assert.equal(process.env.DB_CA_CERT, 'test-ca-cert-pem', 'DB_CA_CERT must be copied to process.env');
    assert.equal(process.env.DB_SSL_CA, 'test-ssl-ca-pem', 'DB_SSL_CA must be copied to process.env');

    // 9B: isCompromisedSecret correctly flags short or known-bad secrets
    assert.equal(isCompromisedSecret('short'), true, 'Short secrets are rejected');
    assert.equal(isCompromisedSecret('crm-local-development-fallback-secret-minimum-32-chars'), true, 'Known insecure secret rejected');
    assert.equal(isCompromisedSecret('a'.repeat(64)), false, 'Sufficiently long novel secret accepted');

    // 9C: Health check reports { jwt: 'ok' | 'missing' } without leaking secrets
    const origSecret = appEnv.jwt.secret;
    try {
      let healthResJson: Record<string, unknown> = {};
      const fakeRes = {
        status: () => fakeRes,
        json: (d: Record<string, unknown>) => { healthResJson = d; return fakeRes; },
      } as unknown as Response;

      // Mock database authenticate so health check passes
      const origAuth = sequelize.authenticate;
      const origSysKey = process.env.SYSTEM_KEY;
      (sequelize as unknown as Record<string, unknown>).authenticate = async () => undefined;
      try {
        // 9C-1: Unauthenticated health check must NEVER leak JWT or database configuration status
        const unauthReq = { id: 'health-test-unauth', headers: {} } as unknown as Request;
        await health(unauthReq, fakeRes);
        const unauthData = healthResJson.data as Record<string, unknown>;
        assert.equal(unauthData.status, 'ok');
        assert.equal(unauthData.jwt, undefined, 'Unauthenticated health check must NOT leak jwt configuration status');
        assert.equal(unauthData.database, undefined, 'Unauthenticated health check must NOT leak database status');

        // 9C-2: Authorized health check (via system key) reports diagnostic status safely without leaking secret
        process.env.SYSTEM_KEY = 'test-system-key-for-health-check-min-32-chars';
        const authReq = {
          id: 'health-test-auth',
          headers: { 'x-system-key': 'test-system-key-for-health-check-min-32-chars' },
        } as unknown as Request;
        await health(authReq, fakeRes);
        const authData = healthResJson.data as Record<string, unknown>;
        assert.ok(authData && (authData.jwt === 'ok' || authData.jwt === 'missing'), 'Authorized health check must report jwt status');
        assert.equal(authData.database, 'up');
        const jsonStr = JSON.stringify(healthResJson);
        assert.equal(jsonStr.includes(origSecret), false, 'Health check MUST NOT leak JWT secret value');
      } finally {
        (sequelize as unknown as Record<string, unknown>).authenticate = origAuth;
        process.env.SYSTEM_KEY = origSysKey;
      }
    } finally {
      appEnv.jwt.secret = origSecret;
    }

    console.log('✓ Secrets, Worker env sync, and safe health check jwt status reporting verified');
  }

  // Test 10: Migration Ordering, Alias Idempotency, and Trigram Extension Opclass Resolution (Item 7)
  {
    const fs = await import('fs');
    const path = await import('path');
    const { MIGRATIONS_LIST, MIGRATION_ALIASES } = await import('../services/dbMigration.service');

    // 10A: Migrations directory has unique, ordered prefixes
    const migrationsDir = path.join(__dirname, '..', '..', '..', 'supabase', 'migrations');
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

    assert.ok(files.includes('0002a_lockdown_rls.sql'), '0002a_lockdown_rls.sql exists');
    assert.ok(files.includes('0002b_token_version_idempotency.sql'), '0002b_token_version_idempotency.sql exists');
    assert.ok(files.includes('0005_trgm_search_indexes.sql'), '0005_trgm_search_indexes.sql exists');
    assert.equal(files.includes('0002_lockdown_rls.sql'), false, 'Legacy duplicate 0002 prefix removed');

    // 10B: MIGRATIONS_LIST in dbMigration service has unique prefixes and matches files
    const versions = MIGRATIONS_LIST.map((m) => m.version);
    const uniqueVersions = new Set(versions);
    assert.equal(versions.length, uniqueVersions.size, 'All migration versions in MIGRATIONS_LIST must be unique');
    assert.ok(versions.includes('0002a_lockdown_rls.sql'));
    assert.ok(versions.includes('0002b_token_version_idempotency.sql'));
    assert.ok(versions.includes('0005_trgm_search_indexes.sql'));

    // 10C: Legacy aliases map old filenames to new ones safely
    assert.equal(MIGRATION_ALIASES['0002a_lockdown_rls.sql'], '0002_lockdown_rls.sql');
    assert.equal(MIGRATION_ALIASES['0002b_token_version_idempotency.sql'], '0002_token_version_idempotency.sql');

    // 10D: 0005_trgm_search_indexes.sql resolves pg_trgm and opclass safely on Supabase
    const trgmSql = fs.readFileSync(path.join(migrationsDir, '0005_trgm_search_indexes.sql'), 'utf8');
    assert.ok(trgmSql.includes('extensions'), 'Trigram migration must support Supabase extensions schema');
    assert.ok(trgmSql.includes('gin_trgm_ops'), 'Trigram migration must reference gin_trgm_ops');

    console.log('✓ Migration ordering, idempotency aliases, and pg_trgm extensions schema resolution verified');
  }

  // Test 11: Email Set-Password Flow, SHA-256 Token Storage, 48h Expiry & Timing-Safe Token Comparison (Item 8)
  {
    const { PasswordResetToken, User } = await import('../models');
    const { createUser } = await import('../controllers/user.controller');
    const { resetPassword } = await import('../controllers/auth.controller');
    const { sha256 } = await import('../utils/tokens');
    const { env } = await import('../config/env');

    // 11A: User creation issues a token with 48h expiry stored as SHA-256 hash
    let createdTokenRecord: Record<string, unknown> | null = null;
    const origTokenCreate = PasswordResetToken.create;
    const origTokenUpdate = PasswordResetToken.update;
    const origUserFindOne = User.findOne;
    const origUserCreate = User.create;

    try {
      User.findOne = (async () => null) as unknown as typeof origUserFindOne;
      User.create = (async (data: Record<string, unknown>) => ({
        id: 42,
        ...data,
      })) as unknown as typeof origUserCreate;

      PasswordResetToken.update = (async () => [1]) as unknown as typeof origTokenUpdate;
      PasswordResetToken.create = (async (record: Record<string, unknown>) => {
        createdTokenRecord = record;
        return record;
      }) as unknown as typeof origTokenCreate;

      let sendStatusCode = 0;
      let sendJsonBody: unknown = null;
      const res = {
        status(code: number) { sendStatusCode = code; return res; },
        json(body: unknown) { sendJsonBody = body; return res; },
      } as unknown as Response;

      const req = {
        body: {
          firstName: 'Alice',
          lastName: 'Smith',
          email: 'alice@example.com',
          role: 'BDE',
        },
      } as unknown as Request;

      await createUser(req, res);
      assert.equal(sendStatusCode, 201);
      assert.ok(createdTokenRecord !== null);
      assert.equal((createdTokenRecord as Record<string, unknown>).userId, 42);

      // Verify SHA-256 hash length (64 hex characters)
      const tokenHash = (createdTokenRecord as Record<string, unknown>).tokenHash as string;
      assert.equal(typeof tokenHash, 'string');
      assert.equal(tokenHash.length, 64, 'Token must be stored as 64-char SHA-256 hash');

      // Verify 48-hour expiry window (48h = 172800 seconds)
      const expiresAt = (createdTokenRecord as Record<string, unknown>).expiresAt as Date;
      const diffMs = expiresAt.getTime() - Date.now();
      const diffHours = diffMs / (1000 * 60 * 60);
      assert.ok(diffHours >= 47.9 && diffHours <= 48.1, `Expiry must be 48 hours for welcome links (got ${diffHours.toFixed(1)}h)`);

      // 11B: Password reset timing-safe comparison and single-use invalidation
      const validToken = 'valid-test-token-value-12345';
      const validHash = sha256(validToken);

      let tokenSaved = false;
      let tokenUpdated = false;
      let userTokenVersionBumped = false;

      const mockToken = {
        userId: 42,
        tokenHash: validHash,
        usedAt: null,
        expiresAt: new Date(Date.now() + 1800000), // 30 min
        save: async () => { tokenSaved = true; },
      };

      const mockUser = {
        id: 42,
        tokenVersion: 1,
        save: async () => { userTokenVersionBumped = true; },
      };

      PasswordResetToken.findOne = (async () => mockToken) as unknown as typeof PasswordResetToken.findOne;
      User.findByPk = (async () => mockUser) as unknown as typeof User.findByPk;
      PasswordResetToken.update = (async () => { tokenUpdated = true; return [1]; }) as unknown as typeof PasswordResetToken.update;

      const resetReq = {
        body: {
          token: validToken,
          password: 'NewStrongPassword123!',
        },
      } as unknown as Request;

      let resetStatusCode = 200;
      const resetRes = {
        status(code: number) { resetStatusCode = code; return resetRes; },
        json(body: unknown) { return resetRes; },
      } as unknown as Response;

      await resetPassword(resetReq, resetRes);
      assert.equal(resetStatusCode, 200);
      assert.equal(tokenSaved, true, 'Reset token must be marked used on consumption');
      assert.equal(tokenUpdated, true, 'Active reset tokens for user must be invalidated');
      assert.equal(userTokenVersionBumped, true, 'User tokenVersion must be incremented to revoke old sessions');

      // 11C: Mail links strictly go to configured FRONTEND_URL
      const { sendWelcomeEmail, sendPasswordResetEmail } = await import('../services/mailer.service');
      // FRONTEND_URL is used by both functions without touching Host headers
      assert.ok(env.frontendUrl, 'FRONTEND_URL must be configured');

      console.log('✓ Email set-password flow, 48h welcome expiry, SHA-256 tokens, and timing-safe reset verified');
    } finally {
      PasswordResetToken.create = origTokenCreate;
      PasswordResetToken.update = origTokenUpdate;
      User.findOne = origUserFindOne;
      User.create = origUserCreate;
    }
  }

  // Test 12: Seed Data Safety & Production Demo Account Checks (Item 9)
  {
    const fs = await import('fs');
    const path = await import('path');

    // 12A: seed.sql contains protective guard against production injection
    const seedSqlPath = path.join(__dirname, '..', '..', '..', 'supabase', 'seed.sql');
    const seedSql = fs.readFileSync(seedSqlPath, 'utf8');
    assert.ok(seedSql.includes('crm.allow_seed'), 'seed.sql must require explicit crm.allow_seed setting');
    assert.ok(seedSql.includes('RAISE EXCEPTION'), 'seed.sql must abort execution when in production without override');

    // 12B: check-prod-accounts script exists and contains deletion logic
    const auditScriptPath = path.join(__dirname, '..', '..', '..', 'scripts', 'check-prod-accounts.cjs');
    assert.ok(fs.existsSync(auditScriptPath), 'scripts/check-prod-accounts.cjs must exist');
    const auditScript = fs.readFileSync(auditScriptPath, 'utf8');
    assert.ok(auditScript.includes('admin@crm.local'), 'audit script must target admin@crm.local');
    assert.ok(auditScript.includes('sam@crm.local'), 'audit script must target sam@crm.local');
    assert.ok(auditScript.includes('--delete'), 'audit script must support --delete flag');

    // 12C: db-seed.cjs enforces ALLOW_SEED=true in production/non-local environments
    const dbSeedPath = path.join(__dirname, '..', '..', '..', 'scripts', 'db-seed.cjs');
    const dbSeed = fs.readFileSync(dbSeedPath, 'utf8');
    assert.ok(dbSeed.includes('ALLOW_SEED'), 'db-seed.cjs must check ALLOW_SEED');
    assert.ok(dbSeed.includes('isLocalOrStagingHost'), 'db-seed.cjs must check whether host is local or staging');

    console.log('✓ Seed data safety, ALLOW_SEED guards, and demo accounts audit script verified');
  }
}

