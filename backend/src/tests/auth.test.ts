import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { authenticate, requireAdmin, requireBDE } from '../middleware/auth';
import { signAuthToken, verifyAuthToken } from '../utils/jwt';
import { env } from '../config/env';
import { User } from '../models';
import { ApiError } from '../utils/ApiError';
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
      assert.equal((nextError as ApiError).code, 'AUTH_TOKEN_EXPIRED');
      console.log('✓ Token with obsolete tokenVersion rejected with 401 AUTH_TOKEN_EXPIRED');
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
  } finally {
    User.findByPk = originalFindByPk;
  }
}
