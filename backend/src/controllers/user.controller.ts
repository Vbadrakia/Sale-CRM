import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Op, WhereOptions } from 'sequelize';
import { Request, Response } from 'express';
import { z } from 'zod';
import { Customer, FollowUp, Lead, PasswordResetToken, User, toPublicUser } from '../models';
import { ApiError } from '../utils/ApiError';
import { sendCreated, sendPaginated, sendSuccess } from '../utils/apiResponse';
import { buildPaginationMeta, parsePagination } from '../utils/pagination';
import { getValidatedQuery } from '../middleware/validate';
import { listUsersQuerySchema } from '../validators/user.validators';
import { sendWelcomeEmail } from '../services/mailer.service';
import { clearUserAuthCache, currentUser } from '../middleware/auth';
import { env } from '../config/env';
import { sequelize, withDbRetry } from '../config/database';
import { generateResetToken, minutesFromNow, sha256 } from '../utils/tokens';
import { escapeLike } from '../utils/normalize';

const BCRYPT_SALT_ROUNDS = 12;

export async function listUsers(req: Request, res: Response) {
  const query = getValidatedQuery<z.infer<typeof listUsersQuerySchema>>(req);
  const { page, pageSize, offset } = parsePagination(query as Record<string, unknown>);

  const where: WhereOptions = {};
  if (query.role) Object.assign(where, { role: query.role });
  if (query.isActive) Object.assign(where, { isActive: query.isActive === 'true' });
  if (query.search) {
    const safeSearch = escapeLike(query.search);
    Object.assign(where, {
      [Op.or]: [
        { firstName: { [Op.like]: `%${safeSearch}%` } },
        { lastName: { [Op.like]: `%${safeSearch}%` } },
        { email: { [Op.like]: `%${safeSearch}%` } },
      ],
    });
  }

  const { rows, count } = await withDbRetry(() => User.findAndCountAll({
    where,
    limit: pageSize,
    offset,
    order: [['created_at', 'DESC']],
  }));

  // Attach workload counts so the admin list is useful at a glance.
  const ids = rows.map((u) => u.id);
  const leadCounts = new Map<number, number>();
  if (ids.length) {
    try {
      const grouped = await Lead.findAll({
        attributes: [['assigned_bde_id', 'assignedBdeId'], [sequelize.fn('COUNT', sequelize.col('id')), 'total']],
        where: { assignedBdeId: { [Op.in]: ids } },
        group: ['assigned_bde_id'],
        raw: true,
      });
      for (const row of grouped as unknown as { assignedBdeId: number; total: string | number }[]) {
        if (row && row.assignedBdeId) {
          leadCounts.set(Number(row.assignedBdeId), Number(row.total || 0));
        }
      }
    } catch (countErr) {
      console.warn('[listUsers] Failed to calculate lead workload counts:', countErr);
    }
  }

  const data = rows.map((user) => ({ ...toPublicUser(user), assignedLeadCount: leadCounts.get(user.id) ?? 0 }));
  return sendPaginated(res, data, buildPaginationMeta(page, pageSize, count));
}

interface AssignableBdeItem {
  id: number;
  fullName: string;
  email: string;
}

let assignableBdesCache: { data: AssignableBdeItem[]; expiresAt: number } | null = null;
let inFlightAssignableBdes: Promise<AssignableBdeItem[]> | null = null;

export function invalidateAssignableBdesCache(): void {
  assignableBdesCache = null;
  inFlightAssignableBdes = null;
}

/** Lightweight list for assignment dropdowns. */
export async function listAssignableBdes(_req: Request, res: Response) {
  try {
    if (assignableBdesCache && Date.now() < assignableBdesCache.expiresAt) {
      return sendSuccess(res, assignableBdesCache.data);
    }

    if (!inFlightAssignableBdes) {
      inFlightAssignableBdes = (async () => {
        const users = await withDbRetry(() =>
          User.findAll({
            attributes: ['id', 'firstName', 'lastName', 'email'],
            where: { role: 'BDE', isActive: true },
            order: [['firstName', 'ASC'], ['lastName', 'ASC']],
            raw: true,
          })
        );
        const mapped: AssignableBdeItem[] = (users || []).map((u: unknown) => {
          const userObj = u as { id: number; firstName?: string; lastName?: string; email: string };
          return {
            id: userObj.id,
            fullName: `${userObj.firstName || ''} ${userObj.lastName || ''}`.trim() || userObj.email,
            email: userObj.email,
          };
        });
        assignableBdesCache = { data: mapped, expiresAt: Date.now() + 60_000 };
        return mapped;
      })().finally(() => {
        inFlightAssignableBdes = null;
      });
    }

    const data = await inFlightAssignableBdes;
    return sendSuccess(res, data);
  } catch (err) {
    console.error('[listAssignableBdes] Error:', err);
    return sendSuccess(res, []);
  }
}

export async function createUser(req: Request, res: Response) {
  const body = req.body as {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string | null;
    role: 'ADMIN' | 'BDE';
    password?: string;
  };

  const existing = await withDbRetry(() => User.findOne({ where: { email: body.email } }));
  if (existing) throw ApiError.conflict('A user with this email already exists', [{ field: 'email', message: 'Already in use' }]);

  const initialPassword = body.password || crypto.randomBytes(32).toString('hex');
  const user = await withDbRetry(async () => User.create({
    firstName: body.firstName,
    lastName: body.lastName,
    email: body.email,
    phone: body.phone ?? null,
    role: body.role,
    passwordHash: await bcrypt.hash(initialPassword, BCRYPT_SALT_ROUNDS),
    isActive: true,
    emailVerified: false,
  }));

  // Invalidate any previous tokens for this user and generate a secure 48h set-password link
  await withDbRetry(() => PasswordResetToken.update(
    { usedAt: new Date() },
    { where: { userId: user.id, usedAt: null } },
  ));

  const rawToken = generateResetToken();
  await withDbRetry(() => PasswordResetToken.create({
    userId: user.id,
    tokenHash: sha256(rawToken),
    expiresAt: minutesFromNow(48 * 60), // 48-hour setup window
  }));

  await sendWelcomeEmail(user.email, user.firstName, rawToken).catch((error) => {
    console.error('[mail] failed to send welcome email', error);
  });

  invalidateAssignableBdesCache();
  return sendCreated(
    res,
    toPublicUser(user),
    'User created. A welcome email with password setup instructions was sent.',
  );
}

export async function getUser(req: Request, res: Response) {
  const user = await withDbRetry(() => User.findByPk(Number(req.params.id)));
  if (!user) throw ApiError.notFound('User not found');

  const [assignedLeads, wonLeads, customers, completedFollowUps] = await withDbRetry(() => Promise.all([
    Lead.count({ where: { assignedBdeId: user.id } }),
    Lead.count({ where: { assignedBdeId: user.id, status: 'WON' } }),
    Customer.count({ where: { assignedBdeId: user.id } }),
    FollowUp.count({ where: { assignedToId: user.id, status: 'COMPLETED' } }),
  ]));

  return sendSuccess(res, {
    ...toPublicUser(user),
    stats: { assignedLeads, wonLeads, customers, completedFollowUps },
  });
}

export async function updateUser(req: Request, res: Response) {
  const actor = currentUser(req);
  const user = await withDbRetry(() => User.findByPk(Number(req.params.id)));
  if (!user) throw ApiError.notFound('User not found');

  const body = req.body as Partial<{ firstName: string; lastName: string; phone: string | null; role: 'ADMIN' | 'BDE' }>;
  if (body.role && user.id === actor.id && body.role !== actor.role) {
    throw ApiError.badRequest('You cannot change your own role');
  }
  if (body.firstName !== undefined) user.firstName = body.firstName;
  if (body.lastName !== undefined) user.lastName = body.lastName;
  if (body.phone !== undefined) user.phone = body.phone;
  if (body.role !== undefined && body.role !== user.role) {
    user.role = body.role;
    user.tokenVersion = (user.tokenVersion || 1) + 1;
    clearUserAuthCache(user.id);
  }
  await withDbRetry(() => user.save());
  invalidateAssignableBdesCache();

  return sendSuccess(res, toPublicUser(user), 'User updated');
}

export async function updateUserStatus(req: Request, res: Response) {
  const actor = currentUser(req);
  const user = await withDbRetry(() => User.findByPk(Number(req.params.id)));
  if (!user) throw ApiError.notFound('User not found');
  if (user.id === actor.id) throw ApiError.badRequest('You cannot disable your own account');

  const { isActive } = req.body as { isActive: boolean };
  if (!isActive && user.role === 'ADMIN') {
    const activeAdmins = await User.count({ where: { role: 'ADMIN', isActive: true } });
    if (activeAdmins <= 1) throw ApiError.badRequest('At least one active admin is required');
  }
  user.isActive = isActive;
  user.tokenVersion = (user.tokenVersion || 1) + 1;
  clearUserAuthCache(user.id);
  await withDbRetry(() => user.save());
  invalidateAssignableBdesCache();
  return sendSuccess(res, toPublicUser(user), isActive ? 'Account enabled' : 'Account disabled');
}

export async function resetUserPassword(req: Request, res: Response) {
  const user = await withDbRetry(() => User.findByPk(Number(req.params.id)));
  if (!user) throw ApiError.notFound('User not found');

  user.tokenVersion = (user.tokenVersion || 1) + 1;
  clearUserAuthCache(user.id);
  await withDbRetry(() => user.save());

  // Invalidate any previous reset tokens for this user
  await withDbRetry(() => PasswordResetToken.update(
    { usedAt: new Date() },
    { where: { userId: user.id, usedAt: null } },
  ));

  const rawToken = generateResetToken();
  await withDbRetry(() => PasswordResetToken.create({
    userId: user.id,
    tokenHash: sha256(rawToken),
    expiresAt: minutesFromNow(env.passwordReset.expiresMinutes),
  }));

  await sendWelcomeEmail(user.email, user.firstName, rawToken).catch(() => undefined);

  return sendSuccess(
    res,
    { success: true },
    'Password reset link generated and emailed to the user.',
  );
}
