import { Op, WhereOptions, fn, col, literal } from 'sequelize';
import { Request, Response } from 'express';
import { Customer, FollowUp, Lead, User, sequelize } from '../models';
import { withDbRetry } from '../config/database';
import { sendSuccess } from '../utils/apiResponse';
import { currentUser } from '../middleware/auth';
import { leadScopeWhere } from '../services/lead.service';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const DASHBOARD_CACHE_TTL_MS = 30_000;
const dashboardCache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = dashboardCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    dashboardCache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCached<T>(key: string, data: T, ttlMs = DASHBOARD_CACHE_TTL_MS): void {
  if (dashboardCache.size > 200) {
    const now = Date.now();
    for (const [k, v] of dashboardCache.entries()) {
      if (now > v.expiresAt) dashboardCache.delete(k);
    }
    if (dashboardCache.size > 200) dashboardCache.clear();
  }
  dashboardCache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export function invalidateDashboardCache(scopeKey?: string): void {
  if (scopeKey) {
    for (const key of dashboardCache.keys()) {
      if (key.includes(scopeKey)) dashboardCache.delete(key);
    }
  } else {
    dashboardCache.clear();
  }
}

function todayRangeUtc() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return { start, end: new Date(start.getTime() + 24 * 3600 * 1000) };
}

function followUpScope(req: Request): WhereOptions {
  const user = currentUser(req);
  return user.role === 'ADMIN' ? {} : { assignedToId: user.id };
}

function lastTwelveMonths(): string[] {
  const cursor = new Date();
  cursor.setUTCMonth(cursor.getUTCMonth() - 11, 1);
  cursor.setUTCHours(0, 0, 0, 0);

  const months: string[] = [];
  for (let i = 0; i < 12; i += 1) {
    months.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

export async function overview(req: Request, res: Response) {
  const user = currentUser(req);
  const scopeKey = user.role === 'ADMIN' ? 'admin' : `bde:${user.id}`;
  const cacheKey = `overview:${scopeKey}`;

  const cached = getCached<Record<string, unknown>>(cacheKey);
  if (cached) {
    return sendSuccess(res, cached);
  }

  const leadWhere = leadScopeWhere(user);
  const fuWhere = followUpScope(req);
  const customerWhere: WhereOptions = user.role === 'ADMIN' ? {} : { assignedBdeId: user.id };
  const { start, end } = todayRangeUtc();
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const now = new Date();

  const since12Months = new Date();
  since12Months.setUTCMonth(since12Months.getUTCMonth() - 11, 1);
  since12Months.setUTCHours(0, 0, 0, 0);
  const monthAttr = fn('TO_CHAR', col('created_at'), 'YYYY-MM');

  const since30Days = new Date(Date.now() - 29 * 24 * 3600 * 1000);
  const dayAttr = fn('TO_CHAR', col('due_at'), 'YYYY-MM-DD');

  const [
    rawStatusRows,
    rawFuRow,
    rawCustRow,
    rawSourceRows,
    rawBdeLeads,
    bdeUsers,
    rawCompletedFu,
    rawMonthlyLeads,
    rawMonthlyCust,
    rawFollowUpTrend,
  ] = await Promise.all([
    withDbRetry(() => Lead.findAll({
      attributes: ['status', [fn('COUNT', col('id')), 'total']],
      where: leadWhere,
      group: ['status'],
      raw: true,
    })),
    withDbRetry(() => FollowUp.findAll({
      attributes: [
        [fn('COUNT', literal(`CASE WHEN status = 'PENDING' AND due_at >= '${start.toISOString()}' AND due_at < '${end.toISOString()}' THEN 1 END`)), 'today'],
        [fn('COUNT', literal(`CASE WHEN status = 'PENDING' AND due_at >= '${end.toISOString()}' THEN 1 END`)), 'upcoming'],
        [fn('COUNT', literal(`CASE WHEN status = 'PENDING' AND due_at < '${now.toISOString()}' THEN 1 END`)), 'overdue'],
        [fn('COUNT', literal(`CASE WHEN status = 'COMPLETED' THEN 1 END`)), 'completed'],
      ],
      where: fuWhere,
      raw: true,
    })),
    withDbRetry(() => Customer.findAll({
      attributes: [
        [fn('COUNT', col('id')), 'total'],
        [fn('COUNT', literal(`CASE WHEN created_at >= '${monthStart.toISOString()}' THEN 1 END`)), 'newThisMonth'],
      ],
      where: customerWhere,
      raw: true,
    })),
    withDbRetry(() => Lead.findAll({
      attributes: ['leadSource', [fn('COUNT', col('id')), 'total']],
      where: leadWhere,
      group: ['leadSource'],
      order: [[literal('total'), 'DESC']],
      limit: 12,
      raw: true,
    })),
    withDbRetry(() => Lead.findAll({
      attributes: ['assignedBdeId', 'status', [fn('COUNT', col('Lead.id')), 'total']],
      where: leadWhere,
      group: ['assigned_bde_id', 'status'],
      raw: true,
    })),
    withDbRetry(() => User.findAll({ where: { role: 'BDE' }, order: [['firstName', 'ASC']] })),
    withDbRetry(() => FollowUp.findAll({
      attributes: ['assignedToId', [fn('COUNT', col('FollowUp.id')), 'total']],
      where: { status: 'COMPLETED' },
      group: ['assigned_to_id'],
      raw: true,
    })),
    withDbRetry(() => Lead.findAll({
      attributes: [[monthAttr, 'month'], [fn('COUNT', col('id')), 'total']],
      where: { ...leadWhere, createdAt: { [Op.gte]: since12Months } },
      group: ['month'],
      order: literal('month ASC'),
      raw: true,
    })),
    withDbRetry(() => Customer.findAll({
      attributes: [[monthAttr, 'month'], [fn('COUNT', col('id')), 'total']],
      where: { ...customerWhere, createdAt: { [Op.gte]: since12Months } },
      group: ['month'],
      order: literal('month ASC'),
      raw: true,
    })),
    withDbRetry(() => FollowUp.findAll({
      attributes: [[dayAttr, 'day'], 'status', [fn('COUNT', col('id')), 'total']],
      where: { ...fuWhere, dueAt: { [Op.gte]: since30Days } },
      group: ['day', 'status'],
      order: literal('day ASC'),
      raw: true,
    })),
  ]);

  // 1. Process summary & conversion & leadsByStatus
  const statusRows = rawStatusRows as unknown as { status: string; total: string }[];
  const fuRow = (rawFuRow as unknown as [{ today?: string; upcoming?: string; overdue?: string; completed?: string }])[0] || {};
  const custRow = (rawCustRow as unknown as [{ total?: string; newThisMonth?: string }])[0] || {};

  const todaysFollowUps = Number(fuRow.today || 0);
  const upcomingFollowUps = Number(fuRow.upcoming || 0);
  const overdueFollowUps = Number(fuRow.overdue || 0);
  const completedFollowUps = Number(fuRow.completed || 0);
  const totalCustomers = Number(custRow.total || 0);
  const newCustomers = Number(custRow.newThisMonth || 0);

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
  const conversionRate = totalLeads ? Number(((totalCustomers / totalLeads) * 100).toFixed(1)) : 0;
  const winRate = totalLeads ? Number(((byStatus.WON / totalLeads) * 100).toFixed(1)) : 0;

  const summaryData = {
    leads: { total: totalLeads, ...byStatus },
    followUps: {
      today: todaysFollowUps,
      upcoming: upcomingFollowUps,
      overdue: overdueFollowUps,
      completed: completedFollowUps,
    },
    customers: { total: totalCustomers, newThisMonth: newCustomers, conversionRate },
    winRate,
  };

  const leadsByStatusData = statusRows.map((r) => ({ label: r.status, value: Number(r.total) }));

  const contacted = (byStatus.CONTACTED || 0) + (byStatus.FOLLOW_UP || 0) + (byStatus.QUALIFIED || 0) + (byStatus.WON || 0);
  const qualified = (byStatus.QUALIFIED || 0) + (byStatus.WON || 0);
  const won = byStatus.WON || 0;
  const conversionData = [
    { label: 'All leads', value: totalLeads },
    { label: 'Contacted', value: contacted },
    { label: 'Qualified', value: qualified },
    { label: 'Won', value: won },
  ];

  // 2. Process leadsBySource
  const sourceRows = rawSourceRows as unknown as { leadSource: string | null; total: string }[];
  const leadsBySourceData = sourceRows.map((r) => ({ label: r.leadSource || 'Unspecified', value: Number(r.total) }));

  // 3. Process leadsByBde
  const bdeRows = rawBdeLeads as unknown as { assignedBdeId: number | null; status: string; total: string }[];
  const completedByUser = rawCompletedFu as unknown as { assignedToId: number | null; total: string }[];
  const completedMap = new Map(completedByUser.map((r) => [Number(r.assignedToId), Number(r.total)]));

  const leadsByBdeData = bdeUsers
    .filter((u) => user.role === 'ADMIN' || u.id === user.id)
    .map((u) => {
      const mine = bdeRows.filter((r) => Number(r.assignedBdeId) === u.id);
      const get = (status: string) => Number(mine.find((r) => r.status === status)?.total || 0);
      const assigned = mine.reduce((sum, r) => sum + Number(r.total), 0);
      const bdeWon = get('WON');
      return {
        bdeId: u.id,
        name: `${u.firstName} ${u.lastName}`.trim(),
        email: u.email,
        isActive: u.isActive,
        assigned,
        contacted: get('CONTACTED'),
        followUp: get('FOLLOW_UP'),
        qualified: get('QUALIFIED'),
        won: bdeWon,
        lost: get('LOST'),
        followUpsCompleted: completedMap.get(u.id) ?? 0,
        conversionRate: assigned ? Number(((bdeWon / assigned) * 100).toFixed(1)) : 0,
      };
    });

  // 4. Process monthlyTrend
  const leadRows = rawMonthlyLeads as unknown as { month: string; total: string }[];
  const customerRows = rawMonthlyCust as unknown as { month: string; total: string }[];
  const months = lastTwelveMonths();
  const monthlyTrendData = months.map((month) => ({
    month,
    leads: Number(leadRows.find((r) => r.month === month)?.total || 0),
    customers: Number(customerRows.find((r) => r.month === month)?.total || 0),
  }));

  // 5. Process followUpTrend
  const fuTrendRows = rawFollowUpTrend as unknown as { day: string; status: string; total: string }[];
  const days = new Map<string, { day: string; completed: number; pending: number; cancelled: number }>();
  for (const row of fuTrendRows) {
    const key = String(row.day);
    const entry = days.get(key) || { day: key, completed: 0, pending: 0, cancelled: 0 };
    if (row.status === 'COMPLETED') entry.completed = Number(row.total);
    if (row.status === 'PENDING') entry.pending = Number(row.total);
    if (row.status === 'CANCELLED') entry.cancelled = Number(row.total);
    days.set(key, entry);
  }
  const followUpTrendData = Array.from(days.values());

  const result = {
    summary: summaryData,
    leadsByStatus: leadsByStatusData,
    leadsBySource: leadsBySourceData,
    leadsByBde: leadsByBdeData,
    monthlyTrend: monthlyTrendData,
    conversion: conversionData,
    followUps: followUpTrendData,
  };

  setCached(cacheKey, result);
  return sendSuccess(res, result);
}

export async function summary(req: Request, res: Response) {
  const user = currentUser(req);
  const scopeKey = user.role === 'ADMIN' ? 'admin' : `bde:${user.id}`;
  const cached = getCached<{ summary: unknown }>(`overview:${scopeKey}`);
  if (cached) {
    return sendSuccess(res, cached.summary);
  }

  const leadWhere = leadScopeWhere(user);
  const fuWhere = followUpScope(req);
  const customerWhere: WhereOptions = user.role === 'ADMIN' ? {} : { assignedBdeId: user.id };
  const { start, end } = todayRangeUtc();
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const now = new Date();

  const [rawStatusRows, rawFuRow, rawCustRow] = await Promise.all([
    withDbRetry(() => Lead.findAll({
      attributes: ['status', [fn('COUNT', col('id')), 'total']],
      where: leadWhere,
      group: ['status'],
      raw: true,
    })),
    withDbRetry(() => FollowUp.findAll({
      attributes: [
        [fn('COUNT', literal(`CASE WHEN status = 'PENDING' AND due_at >= '${start.toISOString()}' AND due_at < '${end.toISOString()}' THEN 1 END`)), 'today'],
        [fn('COUNT', literal(`CASE WHEN status = 'PENDING' AND due_at >= '${end.toISOString()}' THEN 1 END`)), 'upcoming'],
        [fn('COUNT', literal(`CASE WHEN status = 'PENDING' AND due_at < '${now.toISOString()}' THEN 1 END`)), 'overdue'],
        [fn('COUNT', literal(`CASE WHEN status = 'COMPLETED' THEN 1 END`)), 'completed'],
      ],
      where: fuWhere,
      raw: true,
    })),
    withDbRetry(() => Customer.findAll({
      attributes: [
        [fn('COUNT', col('id')), 'total'],
        [fn('COUNT', literal(`CASE WHEN created_at >= '${monthStart.toISOString()}' THEN 1 END`)), 'newThisMonth'],
      ],
      where: customerWhere,
      raw: true,
    })),
  ]);

  const statusRows = rawStatusRows as unknown as { status: string; total: string }[];
  const fuRow = (rawFuRow as unknown as [{ today?: string; upcoming?: string; overdue?: string; completed?: string }])[0] || {};
  const custRow = (rawCustRow as unknown as [{ total?: string; newThisMonth?: string }])[0] || {};

  const todaysFollowUps = Number(fuRow.today || 0);
  const upcomingFollowUps = Number(fuRow.upcoming || 0);
  const overdueFollowUps = Number(fuRow.overdue || 0);
  const completedFollowUps = Number(fuRow.completed || 0);
  const totalCustomers = Number(custRow.total || 0);
  const newCustomers = Number(custRow.newThisMonth || 0);

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
  const user = currentUser(req);
  const scopeKey = user.role === 'ADMIN' ? 'admin' : `bde:${user.id}`;
  const cached = getCached<{ leadsByStatus: unknown }>(`overview:${scopeKey}`);
  if (cached) {
    return sendSuccess(res, cached.leadsByStatus);
  }

  const rows = (await withDbRetry(() => Lead.findAll({
    attributes: ['status', [fn('COUNT', col('id')), 'total']],
    where: leadScopeWhere(user),
    group: ['status'],
    raw: true,
  }))) as unknown as { status: string; total: string }[];
  return sendSuccess(
    res,
    rows.map((r) => ({ label: r.status, value: Number(r.total) })),
  );
}

export async function leadsBySource(req: Request, res: Response) {
  const user = currentUser(req);
  const scopeKey = user.role === 'ADMIN' ? 'admin' : `bde:${user.id}`;
  const cached = getCached<{ leadsBySource: unknown }>(`overview:${scopeKey}`);
  if (cached) {
    return sendSuccess(res, cached.leadsBySource);
  }

  const rows = (await withDbRetry(() => Lead.findAll({
    attributes: ['leadSource', [fn('COUNT', col('id')), 'total']],
    where: leadScopeWhere(user),
    group: ['leadSource'],
    order: [[literal('total'), 'DESC']],
    limit: 12,
    raw: true,
  }))) as unknown as { leadSource: string | null; total: string }[];
  return sendSuccess(
    res,
    rows.map((r) => ({ label: r.leadSource || 'Unspecified', value: Number(r.total) })),
  );
}

export async function leadsByBde(req: Request, res: Response) {
  const user = currentUser(req);
  const scopeKey = user.role === 'ADMIN' ? 'admin' : `bde:${user.id}`;
  const cached = getCached<{ leadsByBde: unknown }>(`overview:${scopeKey}`);
  if (cached) {
    return sendSuccess(res, cached.leadsByBde);
  }

  const where = leadScopeWhere(user);

  const [rawRows, users, rawCompleted] = await Promise.all([
    withDbRetry(() => Lead.findAll({
      attributes: ['assignedBdeId', 'status', [fn('COUNT', col('Lead.id')), 'total']],
      where,
      group: ['assigned_bde_id', 'status'],
      raw: true,
    })),
    withDbRetry(() => User.findAll({ where: { role: 'BDE' }, order: [['firstName', 'ASC']] })),
    withDbRetry(() => FollowUp.findAll({
      attributes: ['assignedToId', [fn('COUNT', col('FollowUp.id')), 'total']],
      where: { status: 'COMPLETED' },
      group: ['assigned_to_id'],
      raw: true,
    })),
  ]);

  const rows = rawRows as unknown as { assignedBdeId: number | null; status: string; total: string }[];
  const completedByUser = rawCompleted as unknown as { assignedToId: number | null; total: string }[];
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
  const scopeKey = user.role === 'ADMIN' ? 'admin' : `bde:${user.id}`;
  const cached = getCached<{ monthlyTrend: unknown }>(`overview:${scopeKey}`);
  if (cached) {
    return sendSuccess(res, cached.monthlyTrend);
  }

  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - 11, 1);
  since.setUTCHours(0, 0, 0, 0);

  const monthAttr = fn('TO_CHAR', col('created_at'), 'YYYY-MM');
  const customerWhere: WhereOptions =
    user.role === 'ADMIN' ? { createdAt: { [Op.gte]: since } } : { assignedBdeId: user.id, createdAt: { [Op.gte]: since } };

  const [rawLeadRows, rawCustomerRows] = await Promise.all([
    withDbRetry(() => Lead.findAll({
      attributes: [
        [monthAttr, 'month'],
        [fn('COUNT', col('id')), 'total'],
      ],
      where: { ...leadScopeWhere(user), createdAt: { [Op.gte]: since } },
      group: ['month'],
      order: literal('month ASC'),
      raw: true,
    })),
    withDbRetry(() => Customer.findAll({
      attributes: [
        [monthAttr, 'month'],
        [fn('COUNT', col('id')), 'total'],
      ],
      where: customerWhere,
      group: ['month'],
      order: literal('month ASC'),
      raw: true,
    })),
  ]);

  const leadRows = rawLeadRows as unknown as { month: string; total: string }[];
  const customerRows = rawCustomerRows as unknown as { month: string; total: string }[];
  const months = lastTwelveMonths();

  const data = months.map((month) => ({
    month,
    leads: Number(leadRows.find((r) => r.month === month)?.total || 0),
    customers: Number(customerRows.find((r) => r.month === month)?.total || 0),
  }));

  return sendSuccess(res, data);
}

export async function conversionFunnel(req: Request, res: Response) {
  const user = currentUser(req);
  const scopeKey = user.role === 'ADMIN' ? 'admin' : `bde:${user.id}`;
  const cached = getCached<{ conversion: unknown }>(`overview:${scopeKey}`);
  if (cached) {
    return sendSuccess(res, cached.conversion);
  }

  const where = leadScopeWhere(user);
  const rows = (await withDbRetry(() => Lead.findAll({
    attributes: ['status', [fn('COUNT', col('id')), 'total']],
    where,
    group: ['status'],
    raw: true,
  }))) as unknown as { status: string; total: string }[];

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
  const user = currentUser(req);
  const scopeKey = user.role === 'ADMIN' ? 'admin' : `bde:${user.id}`;
  const cached = getCached<{ followUps: unknown }>(`overview:${scopeKey}`);
  if (cached) {
    return sendSuccess(res, cached.followUps);
  }

  const where = followUpScope(req);
  const since = new Date(Date.now() - 29 * 24 * 3600 * 1000);
  const dayAttr = fn('TO_CHAR', col('due_at'), 'YYYY-MM-DD');

  const rows = (await withDbRetry(() => FollowUp.findAll({
    attributes: [
      [dayAttr, 'day'],
      'status',
      [fn('COUNT', col('id')), 'total'],
    ],
    where: { ...where, dueAt: { [Op.gte]: since } },
    group: ['day', 'status'],
    order: literal('day ASC'),
    raw: true,
  }))) as unknown as { day: string; status: string; total: string }[];

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
    await withDbRetry(() => sequelize.authenticate());
    return sendSuccess(res, { status: 'ok', database: 'up' }, 'Healthy');
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[HEALTH] Health check failed reqId=${req.id || 'none'}:`, err);
    return res.status(503).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Database temporarily unavailable',
        details: errMsg,
      },
      requestId: req.id || undefined,
    });
  }
}
