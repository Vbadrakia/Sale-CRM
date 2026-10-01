import crypto from 'crypto';
import { Request, Response } from 'express';
import { ApiError } from '../utils/ApiError';
import { sendSuccess } from '../utils/apiResponse';
import {
  executeDatabaseMigrations,
  verifyDatabaseMigrations,
} from '../services/dbMigration.service';

function timingSafeMatch(headerVal: string, expectedVal: string): boolean {
  const a = Buffer.from(headerVal);
  const b = Buffer.from(expectedVal);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function checkSystemAuth(req: Request): void {
  // 1. Authenticated Admin session
  if (req.user && req.user.role === 'ADMIN') {
    return;
  }

  // 2. Dedicated SYSTEM_KEY for automated pipelines (never reusing JWT secret)
  const systemKey = req.headers['x-system-key'];
  const configuredSystemKey = process.env.SYSTEM_KEY;
  if (
    typeof systemKey === 'string' &&
    systemKey &&
    typeof configuredSystemKey === 'string' &&
    configuredSystemKey.length >= 32 &&
    timingSafeMatch(systemKey, configuredSystemKey)
  ) {
    return;
  }

  throw ApiError.forbidden('Admin privileges or valid system key required');
}

export async function getMigrationStatus(req: Request, res: Response) {
  checkSystemAuth(req);
  try {
    const status = await verifyDatabaseMigrations();
    return sendSuccess(res, status, 'Migration status retrieved');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[getMigrationStatus ERROR]', msg);
    return res.status(500).json({
      success: false,
      code: 'MIGRATION_STATUS_ERROR',
      message: msg,
      requestId: req.id,
    });
  }
}

export async function runMigrations(req: Request, res: Response) {
  checkSystemAuth(req);
  try {
    const result = await executeDatabaseMigrations();
    return sendSuccess(res, result, 'Database migrations applied successfully');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[runMigrations ERROR]', msg);
    return res.status(500).json({
      success: false,
      code: 'MIGRATION_ERROR',
      message: msg,
      requestId: req.id,
    });
  }
}
