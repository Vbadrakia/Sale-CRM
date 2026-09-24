import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Op, WhereOptions } from 'sequelize';
import { Request, Response } from 'express';
import { z } from 'zod';
import { Customer, FollowUp, Lead, User, toPublicUser } from '../models';
import { ApiError } from '../utils/ApiError';
import { sendCreated, sendPaginated, sendSuccess } from '../utils/apiResponse';
import { buildPaginationMeta, parsePagination } from '../utils/pagination';
import { getValidatedQuery } from '../middleware/validate';
import { listUsersQuerySchema } from '../validators/user.validators';
import { sendWelcomeEmail } from '../services/mailer.service';
import { currentUser } from '../middleware/auth';
import { env } from '../config/env';

function generateTemporaryPassword(): string {
  return `Crm${crypto.randomBytes(4).toString('hex')}${crypto.randomInt(10, 99)}`;
}

export async function listUsers(req: Request, res: Response) {
  const query = getValidatedQuery<z.infer<typeof listUsersQuerySchema>>(req);
  const { page, pageSize, offset } = parsePagination(query as Record<string, unknown>);

  const where: WhereOptions = {};
  if (query.role) Object.assign(where, { role: query.role });
  if (query.isActive) Object.assign(where, { isActive: query.isActive === 'true' });
  if (query.search) {
    Object.assign(where, {
      [Op.or]: [
        { firstName: { [Op.like]: `%${query.search}%` } },
        { lastName: { [Op.like]: `%${query.search}%` } },
        { email: { [Op.like]: `%${query.search}%` } },
      ],
    });
  }

  const { rows, count } = await User.findAndCountAll({
    where,
    limit: pageSize,
    offset,
    order: [['createdAt', 'DESC']],
  });

  // Attach workload counts so the admin list is useful at a glance.
  const ids = rows.map((u) => u.id);
  const leadCounts = new Map<number, number>();
  if (ids.length) {
    const grouped = await Lead.findAll({
      attributes: ['assignedBdeId', [Lead.sequelize!.fn('COUNT', Lead.sequelize!.col('id')), 'total']],
      where: { assignedBdeId: { [Op.in]: ids } },
      group: ['assignedBdeId'],
      raw: true,
    });
    for (const row of grouped as unknown as { assignedBdeId: number; total: string }[]) {
      leadCounts.set(Number(row.assignedBdeId), Number(row.total));
    }
  }

  const data = rows.map((user) => ({ ...toPublicUser(user), assignedLeadCount: leadCounts.get(user.id) ?? 0 }));
  return sendPaginated(res, data, buildPaginationMeta(page, pageSize, count));
}

/** Lightweight list for assignment dropdowns. */
export async function listAssignableBdes(_req: Request, res: Response) {
  const users = await User.findAll({
    where: { role: 'BDE', isActive: true },
    order: [['firstName', 'ASC']],
  });
  return sendSuccess(
    res,
    users.map((u) => ({ id: u.id, fullName: `${u.firstName} ${u.lastName}`.trim(), email: u.email })),
  );
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

  const existing = await User.findOne({ where: { email: body.email } });
  if (existing) throw ApiError.conflict('A user with this email already exists', [{ field: 'email', message: 'Already in use' }]);

  const temporaryPassword = body.password || generateTemporaryPassword();
  const user = await User.create({
    firstName: body.firstName,
    lastName: body.lastName,
    email: body.email,
    phone: body.phone ?? null,
    role: body.role,
    passwordHash: await bcrypt.hash(temporaryPassword, 10),
    isActive: true,
    emailVerified: false,
  });

  await sendWelcomeEmail(user.email, user.firstName, temporaryPassword).catch((error) => {
    console.error('[mail] failed to send welcome email', error);
  });

  return sendCreated(
    res,
    {
      ...toPublicUser(user),
      ...(env.isProduction ? {} : { temporaryPassword: body.password ? undefined : temporaryPassword }),
    },
    'User created. A welcome email with login instructions was sent.',
  );
}

export async function getUser(req: Request, res: Response) {
  const user = await User.findByPk(Number(req.params.id));
  if (!user) throw ApiError.notFound('User not found');

  const [assignedLeads, wonLeads, customers, completedFollowUps] = await Promise.all([
    Lead.count({ where: { assignedBdeId: user.id } }),
    Lead.count({ where: { assignedBdeId: user.id, status: 'WON' } }),
    Customer.count({ where: { assignedBdeId: user.id } }),
    FollowUp.count({ where: { assignedToId: user.id, status: 'COMPLETED' } }),
  ]);

  return sendSuccess(res, {
    ...toPublicUser(user),
    stats: { assignedLeads, wonLeads, customers, completedFollowUps },
  });
}

export async function updateUser(req: Request, res: Response) {
  const actor = currentUser(req);
  const user = await User.findByPk(Number(req.params.id));
  if (!user) throw ApiError.notFound('User not found');

  const body = req.body as Partial<{ firstName: string; lastName: string; phone: string | null; role: 'ADMIN' | 'BDE' }>;
  if (body.role && user.id === actor.id && body.role !== actor.role) {
    throw ApiError.badRequest('You cannot change your own role');
  }
  if (body.firstName !== undefined) user.firstName = body.firstName;
  if (body.lastName !== undefined) user.lastName = body.lastName;
  if (body.phone !== undefined) user.phone = body.phone;
  if (body.role !== undefined) user.role = body.role;
  await user.save();

  return sendSuccess(res, toPublicUser(user), 'User updated');
}

export async function updateUserStatus(req: Request, res: Response) {
  const actor = currentUser(req);
  const user = await User.findByPk(Number(req.params.id));
  if (!user) throw ApiError.notFound('User not found');
  if (user.id === actor.id) throw ApiError.badRequest('You cannot disable your own account');

  const { isActive } = req.body as { isActive: boolean };
  if (!isActive && user.role === 'ADMIN') {
    const activeAdmins = await User.count({ where: { role: 'ADMIN', isActive: true } });
    if (activeAdmins <= 1) throw ApiError.badRequest('At least one active admin is required');
  }
  user.isActive = isActive;
  await user.save();
  return sendSuccess(res, toPublicUser(user), isActive ? 'Account enabled' : 'Account disabled');
}

export async function resetUserPassword(req: Request, res: Response) {
  const user = await User.findByPk(Number(req.params.id));
  if (!user) throw ApiError.notFound('User not found');

  const { password } = req.body as { password?: string };
  const newPassword = password || generateTemporaryPassword();
  user.passwordHash = await bcrypt.hash(newPassword, 10);
  user.tokenVersion = (user.tokenVersion || 1) + 1;
  await user.save();

  await sendWelcomeEmail(user.email, user.firstName, newPassword).catch(() => undefined);

  return sendSuccess(
    res,
    {
      success: true,
      ...(env.isProduction ? {} : { temporaryPassword: password ? undefined : newPassword }),
    },
    'Password reset. The user has been emailed their new password.',
  );
}

