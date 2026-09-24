import { Op, WhereOptions, fn, col, literal } from 'sequelize';
import { Request, Response } from 'express';
import { Customer, FollowUp, Lead, User, sequelize } from '../models';
import { sendSuccess } from '../utils/apiResponse';
import { currentUser } from '../middleware/auth';
import { leadScopeWhere } from '../services/lead.service';

function todayRangeUtc() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return { start, end: new Date(start.getTime() + 24 * 3600 * 1000) };
}

function followUpScope(req: Request): WhereOptions {
  const user = currentUser(req);
  return user.role === 'ADMIN' ? {} : { assignedToId: user.id };
}

export async function summary(req: Request, res: Response) {
  const user = currentUser(req);
  const leadWhere = leadScopeWhere(user);
  const fuWhere = followUpScope(req);
  const customerWhere: WhereOptions = user.role === 'ADMIN' ? {} : { assignedBdeId: user.id };
  const { start, end } = todayRangeUtc();
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));

  const statusRows = (await Lead.findAll({
    attributes: ['status', [fn('COUNT', col('id')), 'total']],
    where: leadWhere,
    group: ['status'],
    raw: true,
  })) as unknown as { status: string; total: string }[];

  const byStatus: Record<string, number> = {
    NEW: 0,
    CONTACTED: 0,
    FOLLOW_UP: 0,
    QUALIFIED: 0,
    WON: 0,
    LOST: 0,
  };
  for (const row of statusRows) byStatus[row.status] = Number(row.total);
  const totalLeads = Object.values(byStatus).reduce((a, b) => a + b, 0);

  const todaysFollowUps = await FollowUp.count({ where: { ...fuWhere, status: 'PENDING', dueAt: { [Op.gte]: start, [Op.lt]: end } } });
  const upcomingFollowUps = await FollowUp.count({ where: { ...fuWhere, status: 'PENDING', dueAt: { [Op.gte]: end } } });
  const overdueFollowUps = await FollowUp.count({ where: { ...fuWhere, status: 'PENDING', dueAt: { [Op.lt]: new Date() } } });
  const completedFollowUps = await FollowUp.count({ where: { ...fuWhere, status: 'COMPLETED' } });
  const totalCustomers = await Customer.count({ where: customerWhere });
  const newCustomers = await Customer.count({ where: { ...customerWhere, createdAt: { [Op.gte]: monthStart } } });

  const conversionRate = totalLeads ? Number(((totalCustomers / totalLeads) * 100).toFixed(1)) : 0;
  const winRate = totalLeads ? Number(((byStatus.WON / totalLeads) * 100).toFixed(1)) : 0;

  return sendSuccess(res, {
    leads: { total: totalLeads, ...byStatus },
    followUps: {
      today: todaysFollowUps,
      upcoming: upcomingFollowUps,
      overdue: overdueFollowUps,
      completed: completedFollowUps,
    },
    customers: { total: totalCustomers, newThisMonth: newCustomers, conversionRate },
    winRate,
  });
}

export async function leadsByStatus(req: Request, res: Response) {
  const rows = (await Lead.findAll({
    attributes: ['status', [fn('COUNT', col('id')), 'total']],
    where: leadScopeWhere(currentUser(req)),
    group: ['status'],
    raw: true,
  })) as unknown as { status: string; total: string }[];
  return sendSuccess(
    res,
    rows.map((r) => ({ label: r.status, value: Number(r.total) })),
  );
}

export async function leadsBySource(req: Request, res: Response) {
  const rows = (await Lead.findAll({
    attributes: ['leadSource', [fn('COUNT', col('id')), 'total']],
    where: leadScopeWhere(currentUser(req)),
    group: ['leadSource'],
    order: [[literal('total'), 'DESC']],
    limit: 12,
    raw: true,
  })) as unknown as { leadSource: string | null; total: string }[];
  return sendSuccess(
    res,
    rows.map((r) => ({ label: r.leadSource || 'Unspecified', value: Number(r.total) })),
  );
}

export async function leadsByBde(req: Request, res: Response) {
  const user = currentUser(req);
  const where = leadScopeWhere(user);
  const rows = (await Lead.findAll({
    attributes: ['assignedBdeId', 'status', [fn('COUNT', col('Lead.id')), 'total']],
    where,
    group: ['assigned_bde_id', 'status'],
    raw: true,
  })) as unknown as { assignedBdeId: number | null; status: string; total: string }[];

  const users = await User.findAll({ where: { role: 'BDE' }, order: [['firstName', 'ASC']] });
  const completedByUser = (await FollowUp.findAll({
    attributes: ['assignedToId', [fn('COUNT', col('FollowUp.id')), 'total']],
    where: { status: 'COMPLETED' },
    group: ['assigned_to_id'],
    raw: true,
  })) as unknown as { assignedToId: number | null; total: string }[];
  const completedMap = new Map(completedByUser.map((r) => [Number(r.assignedToId), Number(r.total)]));

  const data = users
    .filter((u) => user.role === 'ADMIN' || u.id === user.id)
    .map((u) => {
      const mine = rows.filter((r) => Number(r.assignedBdeId) === u.id);
      const get = (status: string) => Number(mine.find((r) => r.status === status)?.total || 0);
      const assigned = mine.reduce((sum, r) => sum + Number(r.total), 0);
      const won = get('WON');
      return {
        bdeId: u.id,
        name: `${u.firstName} ${u.lastName}`.trim(),
        email: u.email,
        isActive: u.isActive,
        assigned,
        contacted: get('CONTACTED'),
        followUp: get('FOLLOW_UP'),
        qualified: get('QUALIFIED'),
        won,
        lost: get('LOST'),
        followUpsCompleted: completedMap.get(u.id) ?? 0,
        conversionRate: assigned ? Number(((won / assigned) * 100).toFixed(1)) : 0,
      };
    });

  return sendSuccess(res, data);
}

export async function monthlyTrend(req: Request, res: Response) {
  const user = currentUser(req);
  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - 11, 1);
  since.setUTCHours(0, 0, 0, 0);

  const monthAttr = fn('TO_CHAR', col('created_at'), 'YYYY-MM');

  const leadRows = (await Lead.findAll({
    attributes: [
      [monthAttr, 'month'],
      [fn('COUNT', col('id')), 'total'],
    ],
    where: { ...leadScopeWhere(user), createdAt: { [Op.gte]: since } },
    group: ['month'],
    order: literal('month ASC'),
    raw: true,
  })) as unknown as { month: string; total: string }[];

  const customerWhere: WhereOptions =
    user.role === 'ADMIN' ? { createdAt: { [Op.gte]: since } } : { assignedBdeId: user.id, createdAt: { [Op.gte]: since } };
  const customerRows = (await Customer.findAll({
    attributes: [
      [monthAttr, 'month'],
      [fn('COUNT', col('id')), 'total'],
    ],
    where: customerWhere,
    group: ['month'],
    order: literal('month ASC'),
    raw: true,
  })) as unknown as { month: string; total: string }[];

  const months: string[] = [];
  const cursor = new Date(since);
  for (let i = 0; i < 12; i += 1) {
    months.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  const data = months.map((month) => ({
    month,
    leads: Number(leadRows.find((r) => r.month === month)?.total || 0),
    customers: Number(customerRows.find((r) => r.month === month)?.total || 0),
  }));

  return sendSuccess(res, data);
}

export async function conversionFunnel(req: Request, res: Response) {
  const where = leadScopeWhere(currentUser(req));
  const rows = (await Lead.findAll({
    attributes: ['status', [fn('COUNT', col('id')), 'total']],
    where,
    group: ['status'],
    raw: true,
  })) as unknown as { status: string; total: string }[];

  const counts: Record<string, number> = {};
  for (const r of rows) {
    counts[r.status] = Number(r.total);
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const contacted = (counts.CONTACTED || 0) + (counts.FOLLOW_UP || 0) + (counts.QUALIFIED || 0) + (counts.WON || 0);
  const qualified = (counts.QUALIFIED || 0) + (counts.WON || 0);
  const won = counts.WON || 0;

  return sendSuccess(res, [
    { label: 'All leads', value: total },
    { label: 'Contacted', value: contacted },
    { label: 'Qualified', value: qualified },
    { label: 'Won', value: won },
  ]);
}

export async function followUpTrend(req: Request, res: Response) {
  const where = followUpScope(req);
  const since = new Date(Date.now() - 29 * 24 * 3600 * 1000);
  const dayAttr = fn('TO_CHAR', col('due_at'), 'YYYY-MM-DD');

  const rows = (await FollowUp.findAll({
    attributes: [
      [dayAttr, 'day'],
      'status',
      [fn('COUNT', col('id')), 'total'],
    ],
    where: { ...where, dueAt: { [Op.gte]: since } },
    group: ['day', 'status'],
    order: literal('day ASC'),
    raw: true,
  })) as unknown as { day: string; status: string; total: string }[];

  const days = new Map<string, { day: string; completed: number; pending: number; cancelled: number }>();
  for (const row of rows) {
    const key = String(row.day);
    const entry = days.get(key) || { day: key, completed: 0, pending: 0, cancelled: 0 };
    if (row.status === 'COMPLETED') entry.completed = Number(row.total);
    if (row.status === 'PENDING') entry.pending = Number(row.total);
    if (row.status === 'CANCELLED') entry.cancelled = Number(row.total);
    days.set(key, entry);
  }

  return sendSuccess(res, Array.from(days.values()));
}

export async function health(req: Request, res: Response) {
  try {
    await sequelize.authenticate();
    return sendSuccess(res, { status: 'ok', database: 'up' }, 'Healthy');
  } catch (err: unknown) {
    console.error(`[HEALTH] Health check failed reqId=${req.id || 'none'}:`, err);
    return res.status(503).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Database temporarily unavailable',
      },
      requestId: req.id || undefined,
    });
  }
}
