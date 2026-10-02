import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { authenticate, requireAdmin, requireBDE } from '../middleware/auth';
import { signAuthToken, verifyAuthToken } from '../utils/jwt';
import { env } from '../config/env';
import { User } from '../models';
import { ApiError } from '../utils/ApiError';
import { setAuthCookie, clearAuthCookie, AUTH_COOKIE_NAME } from '../utils/cookies';
import type { Request, Response, NextFunction } from 'express';

export async function runAuthTests() {
  console.log('\n--- Running Authentication Tests (Task 2 & Regression) ---');

  // Test 1: Valid JWT signing and decoding
  {
    const payload = { id: 101, email: 'user@example.com', role: 'ADMIN' as const, tokenVersion: 1 };
    const token = signAuthToken(payload);
    const decoded = verifyAuthToken(token);
    assert.equal(decoded.id, 101, 'Decoded ID should match payload');
    assert.equal(decoded.role, 'ADMIN', 'Decoded role should match');
    assert.equal(decoded.email, 'user@example.com', 'Decoded email should match');
    assert.equal(decoded.tokenVersion, 1, 'Decoded tokenVersion should match');
    console.log('✓ Valid JWT signed and verified correctly');
  }

  // Test 2: Expired JWT rejected
  {
    const expiredToken = jwt.sign(
      { id: 101, email: 'user@example.com', role: 'ADMIN', tokenVersion: 1 },
      env.jwt.secret,
      { expiresIn: '-1s' }
    );
    assert.throws(
      () => verifyAuthToken(expiredToken),
      (err: unknown) => err instanceof Error && err.name === 'TokenExpiredError',
      'Expired token must throw TokenExpiredError'
    );
    console.log('✓ Expired JWT correctly rejected');
  }

  // Test 3: Token with invalid signature rejected
  {
    const forgedToken = jwt.sign(
      { id: 101, email: 'user@example.com', role: 'ADMIN', tokenVersion: 1 },
      'wrong-secret-key-that-does-not-match-env-secret-32-chars'
    );
    assert.throws(
      () => verifyAuthToken(forgedToken),
      (err: unknown) => err instanceof Error && err.name === 'JsonWebTokenError',
      'Token with invalid signature must throw JsonWebTokenError'
    );
    console.log('✓ Token with forged signature correctly rejected');
  }

  // Mock Request/Response/Next helper
  function createHttpMock(authHeader?: string) {
    const req = {
      headers: {
        authorization: authHeader,
      },
    } as unknown as Request;
    const res = {} as Response;
    let nextError: unknown = null;
    let nextCalled = false;
    const next: NextFunction = (err?: unknown) => {
      nextCalled = true;
      nextError = err ?? null;
    };
    return { req, res, next, getResult: () => ({ nextCalled, nextError }) };
  }

  // Preserve original User.findByPk
  const originalFindByPk = User.findByPk;

  try {
    // Test 4: Missing Authorization header -> 401 AUTH_REQUIRED
    {
      const { req, res, next, getResult } = createHttpMock();
      await authenticate(req, res, next);
      const { nextError } = getResult();
      assert.ok(nextError instanceof ApiError, 'Expected ApiError');
      assert.equal((nextError as ApiError).statusCode, 401);
      assert.equal((nextError as ApiError).code, 'AUTH_REQUIRED');
      console.log('✓ Missing Authorization header rejected with 401 AUTH_REQUIRED');
    }

    // Test 5: Malformed Authorization header -> 401 AUTH_REQUIRED
    {
      const { req, res, next, getResult } = createHttpMock('Token xyz123');
      await authenticate(req, res, next);
      const { nextError } = getResult();
      assert.ok(nextError instanceof ApiError, 'Expected ApiError');
      assert.equal((nextError as ApiError).statusCode, 401);
      assert.equal((nextError as ApiError).code, 'AUTH_REQUIRED');
      console.log('✓ Malformed Authorization header rejected');
    }

    // Test 6: Database failure during auth -> FAILS CLOSED with 503 DATABASE_UNAVAILABLE
    // NEVER creates a fallback user from JWT claims!
    {
      User.findByPk = (async () => {
        throw new Error('Connection refused: database host down');
      }) as unknown as typeof User.findByPk;

      const validToken = signAuthToken({ id: 99, email: 'admin@example.com', role: 'ADMIN', tokenVersion: 1 });
      const { req, res, next, getResult } = createHttpMock(`Bearer ${validToken}`);

      await authenticate(req, res, next);
      const { nextError } = getResult();

      assert.ok(nextError instanceof ApiError, 'Expected ApiError on DB failure');
      assert.equal((nextError as ApiError).statusCode, 503, 'DB failure must yield 503');
      assert.equal((nextError as ApiError).code, 'DATABASE_UNAVAILABLE');
      assert.equal(req.user, undefined, 'req.user MUST NEVER be populated from JWT when DB fails');
      console.log('✓ DB failure fails closed: returns 503 and NEVER creates fallback user');
    }

    // Test 7: User not found in DB -> 401 ACCOUNT_NOT_FOUND
    {
      User.findByPk = (async () => null) as unknown as typeof User.findByPk;

      const validToken = signAuthToken({ id: 999, email: 'deleted@example.com', role: 'BDE', tokenVersion: 1 });
      const { req, res, next, getResult } = createHttpMock(`Bearer ${validToken}`);

      await authenticate(req, res, next);
      const { nextError } = getResult();

      assert.ok(nextError instanceof ApiError);
      assert.equal((nextError as ApiError).statusCode, 401);
      assert.equal((nextError as ApiError).code, 'ACCOUNT_NOT_FOUND');
      console.log('✓ Deleted/non-existent DB user rejected with 401 ACCOUNT_NOT_FOUND');
    }

    // Test 8: Revoked tokenVersion in DB -> 401 AUTH_TOKEN_EXPIRED
    {
      User.findByPk = (async () => ({
        id: 101,
        email: 'user@example.com',
        role: 'ADMIN',
        isActive: true,
        emailVerified: true,
        tokenVersion: 2, // DB has bumped tokenVersion
      })) as unknown as typeof User.findByPk;

      // Token has old tokenVersion: 1
      const oldToken = signAuthToken({ id: 101, email: 'user@example.com', role: 'ADMIN', tokenVersion: 1 });
      const { req, res, next, getResult } = createHttpMock(`Bearer ${oldToken}`);

      await authenticate(req, res, next);
      const { nextError } = getResult();

      assert.ok(nextError instanceof ApiError);
      assert.equal((nextError as ApiError).statusCode, 401);
      assert.equal((nextError as ApiError).code, 'AUTH_TOKEN_REVOKED');
      console.log('✓ Token with obsolete tokenVersion rejected with 401 AUTH_TOKEN_REVOKED');
    }

    // Test 9: Disabled account in DB (isActive: false) -> 403 ACCOUNT_DISABLED
    {
      User.findByPk = (async () => ({
        id: 102,
        email: 'disabled@example.com',
        role: 'BDE',
        isActive: false, // Inactive in DB
        emailVerified: true,
        tokenVersion: 1,
      })) as unknown as typeof User.findByPk;

      const token = signAuthToken({ id: 102, email: 'disabled@example.com', role: 'BDE', tokenVersion: 1 });
      const { req, res, next, getResult } = createHttpMock(`Bearer ${token}`);

      await authenticate(req, res, next);
      const { nextError } = getResult();

      assert.ok(nextError instanceof ApiError);
      assert.equal((nextError as ApiError).statusCode, 403);
      assert.equal((nextError as ApiError).code, 'ACCOUNT_DISABLED');
      console.log('✓ Disabled account rejected with 403 ACCOUNT_DISABLED');
    }

    // Test 10: Unverified account in DB (emailVerified: false) -> 403 ACCOUNT_UNVERIFIED
    {
      User.findByPk = (async () => ({
        id: 103,
        email: 'unverified@example.com',
        role: 'BDE',
        isActive: true,
        emailVerified: false, // Unverified in DB
        tokenVersion: 1,
      })) as unknown as typeof User.findByPk;

      const token = signAuthToken({ id: 103, email: 'unverified@example.com', role: 'BDE', tokenVersion: 1 });
      const { req, res, next, getResult } = createHttpMock(`Bearer ${token}`);

      await authenticate(req, res, next);
      const { nextError } = getResult();

      assert.ok(nextError instanceof ApiError);
      assert.equal((nextError as ApiError).statusCode, 403);
      assert.equal((nextError as ApiError).code, 'ACCOUNT_UNVERIFIED');
      console.log('✓ Unverified account rejected with 403 ACCOUNT_UNVERIFIED');
    }

    // Test 11: Valid JWT + Valid DB user -> Allowed & Authoritative DB user attached
    {
      const dbUserRecord = {
        id: 104,
        email: 'valid@example.com',
        role: 'ADMIN',
        isActive: true,
        emailVerified: true,
        tokenVersion: 1,
      };
      User.findByPk = (async () => dbUserRecord) as unknown as typeof User.findByPk;

      const token = signAuthToken({ id: 104, email: 'valid@example.com', role: 'ADMIN', tokenVersion: 1 });
      const { req, res, next, getResult } = createHttpMock(`Bearer ${token}`);

      await authenticate(req, res, next);
      const { nextError, nextCalled } = getResult();

      assert.equal(nextError, null, 'next() called without error');
      assert.equal(nextCalled, true);
      assert.equal(req.user?.id, 104);
      assert.equal(req.user?.role, 'ADMIN');
      console.log('✓ Valid user authenticated and attached to req.user');
    }

    // Test 12: Forged JWT role claim -> Authoritative DB role enforced
    // User claims ADMIN in token, but DB says BDE!
    {
      const dbUserRecord = {
        id: 105,
        email: 'bde@example.com',
        role: 'BDE', // Authoritative DB role
        isActive: true,
        emailVerified: true,
        tokenVersion: 1,
      };
      User.findByPk = (async () => dbUserRecord) as unknown as typeof User.findByPk;

      // Token forged with ADMIN role
      const forgedToken = signAuthToken({ id: 105, email: 'bde@example.com', role: 'ADMIN', tokenVersion: 1 });
      const { req, res, next, getResult } = createHttpMock(`Bearer ${forgedToken}`);

      await authenticate(req, res, next);
      const { nextError } = getResult();

      assert.equal(nextError, null);
      assert.equal(req.user?.role, 'BDE', 'req.user.role must match authoritative DB record, not forged JWT claim');

      // Now verify requireAdmin rejects this user
      let adminCheckErr: unknown = null;
      requireAdmin(req, res, (err?: unknown) => {
        adminCheckErr = err;
      });
      assert.ok(adminCheckErr instanceof ApiError, 'requireAdmin must reject user with BDE DB role');
      assert.equal((adminCheckErr as ApiError).statusCode, 403);
      console.log('✓ Forged role claim defeated: authoritative DB role enforced');
    }

    // Test 13: requireBDE passes for BDE and rejects non-BDE
    {
      const req = { user: { role: 'BDE' } } as unknown as Request;
      const res = {} as Response;
      let nextCalled = false;
      requireBDE(req, res, () => {
        nextCalled = true;
      });
      assert.equal(nextCalled, true, 'requireBDE should pass for BDE');

      const reqAdmin = { user: { role: 'ADMIN' } } as unknown as Request;
      let adminDenied = false;
      requireBDE(reqAdmin, res, (err?: unknown) => {
        if (err instanceof ApiError && err.statusCode === 403) adminDenied = true;
      });
      assert.equal(adminDenied, true, 'requireBDE should reject ADMIN');
      console.log('✓ Role guards (requireAdmin, requireBDE) strictly enforced');
    }

    // --- Cookie Authentication & CSRF Protection (Task Item 10) ---

    // Test 14: Cookie auth disabled by default
    {
      assert.equal(env.cookieAuth.enabled, false, 'Cookie auth must be disabled by default');
      const req = { headers: {}, secure: false } as unknown as Request;
      let cookieCalled = false;
      const res = {
        cookie: () => { cookieCalled = true; },
      } as unknown as Response;
      setAuthCookie(req, res, 'dummy-token');
      assert.equal(cookieCalled, false, 'setAuthCookie must not set cookie when disabled');

      // authenticate with cookie header when disabled -> 401 AUTH_REQUIRED
      const cookieMock = {
        headers: { cookie: `${AUTH_COOKIE_NAME}=dummy-token` },
        method: 'GET',
      } as unknown as Request;
      let authErr: unknown = null;
      await authenticate(cookieMock, {} as Response, (err?: unknown) => { authErr = err; });
      assert.ok(authErr instanceof ApiError);
      assert.equal((authErr as ApiError).statusCode, 401);
      assert.equal((authErr as ApiError).code, 'AUTH_REQUIRED');
      console.log('✓ Cookie auth disabled by default and ignored when feature flag is OFF');
    }

    // Test 15: Cookie auth enabled: setAuthCookie sets httpOnly session cookie
    {
      interface MockCookieOptions {
        httpOnly?: boolean;
        secure?: boolean;
        sameSite?: string;
        path?: string;
        maxAge?: number;
      }
      const prevFlag = env.cookieAuth.enabled;
      env.cookieAuth.enabled = true;
      try {
        const req = { headers: {}, secure: false } as unknown as Request;
        const cookieRecord: { name: string; val: string; opts: MockCookieOptions | null } = {
          name: '',
          val: '',
          opts: null,
        };
        const res = {
          cookie: (name: string, val: string, opts?: MockCookieOptions) => {
            cookieRecord.name = name;
            cookieRecord.val = val;
            cookieRecord.opts = opts ?? null;
          },
        } as unknown as Response;

        setAuthCookie(req, res, 'sample-jwt-token-string');
        assert.equal(cookieRecord.name, AUTH_COOKIE_NAME);
        assert.equal(cookieRecord.val, 'sample-jwt-token-string');
        assert.ok(cookieRecord.opts, 'Cookie options must be defined');
        assert.equal(cookieRecord.opts.httpOnly, true, 'Cookie must be HttpOnly');
        assert.equal(cookieRecord.opts.secure, true, 'Cookie must be Secure in production/test');
        assert.equal(cookieRecord.opts.sameSite, 'lax', 'Cookie must have SameSite=Lax');
        assert.equal(cookieRecord.opts.path, '/api', 'Cookie path must be /api');
        assert.equal(cookieRecord.opts.maxAge, 24 * 60 * 60 * 1000, 'Cookie maxAge must be 24h');
        console.log('✓ Cookie auth enabled: setAuthCookie sets HttpOnly, Secure, SameSite=Lax, Path=/api cookie');
      } finally {
        env.cookieAuth.enabled = prevFlag;
      }
    }

    // Test 16: clearAuthCookie clears crm_session cookie on logout
    {
      interface MockClearOptions {
        httpOnly?: boolean;
        secure?: boolean;
        sameSite?: string;
        path?: string;
      }
      const req = { headers: {}, secure: false } as unknown as Request;
      const clearRecord: { name: string; opts: MockClearOptions | null } = {
        name: '',
        opts: null,
      };
      const res = {
        clearCookie: (name: string, opts?: MockClearOptions) => {
          clearRecord.name = name;
          clearRecord.opts = opts ?? null;
        },
      } as unknown as Response;

      clearAuthCookie(req, res);
      assert.equal(clearRecord.name, AUTH_COOKIE_NAME);
      assert.ok(clearRecord.opts, 'Clear cookie options must be defined');
      assert.equal(clearRecord.opts.path, '/api');
      assert.equal(clearRecord.opts.httpOnly, true);
      assert.equal(clearRecord.opts.sameSite, 'lax');
      console.log('✓ clearAuthCookie properly invalidates session cookie on /api');
    }

    // Test 17: authenticate reads crm_session cookie on GET request
    {
      const prevFlag = env.cookieAuth.enabled;
      env.cookieAuth.enabled = true;
      try {
        User.findByPk = (async () => ({
          id: 201,
          email: 'cookieuser@example.com',
          role: 'BDE',
          isActive: true,
          emailVerified: true,
          tokenVersion: 1,
        })) as unknown as typeof User.findByPk;

        const token = signAuthToken({ id: 201, email: 'cookieuser@example.com', role: 'BDE', tokenVersion: 1 });
        const req = {
          method: 'GET',
          headers: {
            cookie: `${AUTH_COOKIE_NAME}=${token}`,
          },
        } as unknown as Request;
        let nextErr: unknown = null;
        let nextCalled = false;
        await authenticate(req, {} as Response, (err?: unknown) => {
          nextCalled = true;
          nextErr = err ?? null;
        });
        assert.equal(nextCalled, true);
        assert.equal(nextErr, null);
        assert.equal(req.user?.id, 201);
        console.log('✓ authenticate middleware accepts valid crm_session cookie on GET requests');
      } finally {
        env.cookieAuth.enabled = prevFlag;
      }
    }

    // Test 18: CSRF protection enforces X-Requested-With: crm on state-changing requests
    {
      const prevFlag = env.cookieAuth.enabled;
      env.cookieAuth.enabled = true;
      try {
        User.findByPk = (async () => ({
          id: 201,
          email: 'cookieuser@example.com',
          role: 'BDE',
          isActive: true,
          emailVerified: true,
          tokenVersion: 1,
        })) as unknown as typeof User.findByPk;

        const token = signAuthToken({ id: 201, email: 'cookieuser@example.com', role: 'BDE', tokenVersion: 1 });

        for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
          const reqNoHeader = {
            method,
            headers: {
              cookie: `${AUTH_COOKIE_NAME}=${token}`,
            },
          } as unknown as Request;
          let postErr: unknown = null;
          await authenticate(reqNoHeader, {} as Response, (err?: unknown) => { postErr = err; });
          assert.ok(postErr instanceof ApiError, `Expected CSRF rejection for ${method}`);
          assert.equal((postErr as ApiError).statusCode, 403);
          assert.equal((postErr as ApiError).code, 'CSRF_INVALID');

          const reqBadHeader = {
            method,
            headers: {
              cookie: `${AUTH_COOKIE_NAME}=${token}`,
              'x-requested-with': 'XMLHttpRequest',
            },
          } as unknown as Request;
          let badHeaderErr: unknown = null;
          await authenticate(reqBadHeader, {} as Response, (err?: unknown) => { badHeaderErr = err; });
          assert.ok(badHeaderErr instanceof ApiError);
          assert.equal((badHeaderErr as ApiError).statusCode, 403);
          assert.equal((badHeaderErr as ApiError).code, 'CSRF_INVALID');
        }
        console.log('✓ CSRF protection blocks state-changing cookie requests missing X-Requested-With: crm');
      } finally {
        env.cookieAuth.enabled = prevFlag;
      }
    }

    // Test 19: CSRF protection allows state-changing requests when X-Requested-With: crm is present
    {
      const prevFlag = env.cookieAuth.enabled;
      env.cookieAuth.enabled = true;
      try {
        User.findByPk = (async () => ({
          id: 201,
          email: 'cookieuser@example.com',
          role: 'BDE',
          isActive: true,
          emailVerified: true,
          tokenVersion: 1,
        })) as unknown as typeof User.findByPk;

        const token = signAuthToken({ id: 201, email: 'cookieuser@example.com', role: 'BDE', tokenVersion: 1 });

        for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
          const reqValid = {
            method,
            headers: {
              cookie: `${AUTH_COOKIE_NAME}=${token}`,
              'x-requested-with': 'crm',
            },
          } as unknown as Request;
          let validErr: unknown = null;
          await authenticate(reqValid, {} as Response, (err?: unknown) => { validErr = err ?? null; });
          assert.equal(validErr, null, `${method} with X-Requested-With: crm must succeed`);
          assert.equal(reqValid.user?.id, 201);
        }
        console.log('✓ CSRF protection permits state-changing cookie requests with X-Requested-With: crm');
      } finally {
        env.cookieAuth.enabled = prevFlag;
      }
    }

    // Test 20: Bearer token auth in Authorization header does not require X-Requested-With
    {
      const prevFlag = env.cookieAuth.enabled;
      env.cookieAuth.enabled = true;
      try {
        User.findByPk = (async () => ({
          id: 201,
          email: 'cookieuser@example.com',
          role: 'BDE',
          isActive: true,
          emailVerified: true,
          tokenVersion: 1,
        })) as unknown as typeof User.findByPk;

        const token = signAuthToken({ id: 201, email: 'cookieuser@example.com', role: 'BDE', tokenVersion: 1 });
        const reqBearer = {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
          },
        } as unknown as Request;
        let bearerErr: unknown = null;
        await authenticate(reqBearer, {} as Response, (err?: unknown) => { bearerErr = err ?? null; });
        assert.equal(bearerErr, null, 'Bearer token auth does not require X-Requested-With');
        assert.equal(reqBearer.user?.id, 201);
        console.log('✓ Bearer token header auth operates without CSRF header requirement');
      } finally {
        env.cookieAuth.enabled = prevFlag;
      }
    }
  } finally {
    User.findByPk = originalFindByPk;
  }
}
