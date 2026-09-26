import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';
import { sendSuccess } from '../utils/apiResponse';
import {
  executeDatabaseMigrations,
  takeDatabaseBackup,
  verifyDatabaseMigrations,
} from '../services/dbMigration.service';
import { User } from '../models';

function checkSystemAuth(req: Request): void {
  const migrationKey = req.headers['x-migration-key'] || req.headers['x-system-key'];
  if (typeof migrationKey === 'string' && migrationKey && migrationKey === env.jwt.secret) {
    return;
  }

  // Also allow authenticated admin
  const user = (req as unknown as { user?: { role?: string } }).user;
  if (user && user.role === 'ADMIN') {
    return;
  }

  throw ApiError.forbidden('Invalid system migration key or admin privileges required');
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

export async function getDatabaseBackup(req: Request, res: Response) {
  checkSystemAuth(req);
  try {
    const backup = await takeDatabaseBackup();
    return sendSuccess(res, backup, 'Database snapshot backup created');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[getDatabaseBackup ERROR]', msg);
    return res.status(500).json({
      success: false,
      code: 'BACKUP_ERROR',
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

export async function seedInitialUsers(req: Request, res: Response) {
  checkSystemAuth(req);
  try {
    // Precomputed 6-round bcrypt hash of 'Password123' to guarantee fast execution (<15ms) well within Worker 50ms CPU limit
    const hash = '$2a$06$XRMS.CDW.UWH22s5nKHVbOcypjtSybbb/z0P8uJiXpsT7OXiNMMXe';
    const users = [
      { firstName: 'Ava', lastName: 'Admin', email: 'admin@crm.local', phone: '+911234567890', passwordHash: hash, role: 'ADMIN' as const, isActive: true, emailVerified: true },
      { firstName: 'Ravi', lastName: 'Kumar', email: 'ravi@crm.local', phone: '+919876543210', passwordHash: hash, role: 'BDE' as const, isActive: true, emailVerified: true },
      { firstName: 'Neha', lastName: 'Patel', email: 'neha@crm.local', phone: '+919876543211', passwordHash: hash, role: 'BDE' as const, isActive: true, emailVerified: true },
    ];

    const created: string[] = [];
    for (const u of users) {
      let userRecord = await User.findOne({ where: { email: u.email } });
      if (!userRecord) {
        userRecord = await User.create(u);
      } else {
        await userRecord.update({
          passwordHash: hash,
          role: u.role,
          isActive: true,
          emailVerified: true,
        });
      }
      created.push(u.email);
    }

    return sendSuccess(res, { createdUsers: created }, 'Initial users verified/provisioned');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[seedInitialUsers ERROR]', msg);
    return res.status(500).json({
      success: false,
      code: 'SEED_USERS_ERROR',
      message: msg,
      requestId: req.id,
    });
  }
}
