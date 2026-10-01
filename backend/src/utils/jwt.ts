import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthUserPayload } from '../types';

export function signAuthToken(payload: AuthUserPayload): string {
  const options = {
    expiresIn: env.jwt.expiresIn,
    algorithm: 'HS256',
  } as SignOptions;
  return jwt.sign(payload, env.jwt.secret, options);
}

export function verifyAuthToken(token: string): AuthUserPayload {
  const decoded = jwt.verify(token, env.jwt.secret, { algorithms: ['HS256'] });
  if (typeof decoded === 'string') {
    throw new Error('Invalid token payload');
  }
  const { id, role, email, tokenVersion } = decoded as Record<string, unknown>;
  const numericId = Number(id);
  if (isNaN(numericId) || (role !== 'ADMIN' && role !== 'BDE') || typeof email !== 'string') {
    throw new Error('Invalid token payload');
  }
  return {
    id: numericId,
    role,
    email,
    tokenVersion: typeof tokenVersion === 'number' ? tokenVersion : undefined,
  };
}
