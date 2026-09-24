import { Op, WhereOptions } from 'sequelize';
import { Request, Response } from 'express';
import { z } from 'zod';
import { FollowUp, Lead, User } from '../models';
import { ApiError } from '../utils/ApiError';
import { sendCreated, sendPaginated, sendSuccess } from '../utils/apiResponse';
import { buildPaginationMeta, parsePagination } from '../utils/pagination';
import { getValidatedQuery } from '../middleware/validate';
import { listFollowUpsQuerySchema } from '../validators/followup.validators';
import { currentUser } from '../middleware/auth';
import { getAccessibleLead, leadScopeWhere } from '../services/lead.service';
import { logActivity } from '../services/activity.service';

const USER_ATTRS = ['id', 'firstName', 'lastName', 'email'];

function combineDueAt(dueDate: string, dueTime?: string | null): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    throw ApiError.badRequest('Invalid due date format. Expected YYYY-MM-DD');
  }
  const [yStr, mStr, dStr] = dueDate.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);
  const testDate = new Date(Date.UTC(year, month - 1, day));
  if (
    testDate.getUTCFullYear() !== year ||
    testDate.getUTCMonth() + 1 !== month ||
    testDate.getUTCDate() !== day
  ) {
    throw ApiError.badRequest(`Invalid calendar date: ${dueDate}`);
  }

  let hours = 9;
  let minutes = 0;
  if (dueTime) {
    if (!/^\d{2}:\d{2}/.test(dueTime)) {
      throw ApiError.badRequest('Invalid due time format. Expected HH:mm');
    }
    const [hStr, minStr] = dueTime.split(':');
    hours = Number(hStr);
    minutes = Number(minStr);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      throw ApiError.badRequest('Invalid due time values');
    }
  }

  return new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));
}

export async function recalculateLeadNextFollowUp(leadId: number): Promise<void> {
  const lead = await Lead.findByPk(leadId);
  if (!lead) return;
  const nextPending = await FollowUp.findOne({
    where: { leadId: lead.id, status: 'PENDING' },
    order: [['dueAt', 'ASC']],
  });
  lead.nextFollowUpAt = nextPending ? nextPending.dueAt : null;
  await lead.save();
}

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Loads a follow-up and enforces that the caller can access its lead. */
async function getAccessibleFollowUp(id: number, req: Request): Promise<FollowUp> {
  const user = currentUser(req);
  const followUp = await FollowUp.findByPk(id);
  if (!followUp) throw ApiError.notFound('Follow-up not found');
  if (user.role !== 'ADMIN' && followUp.assignedToId !== user.id) {
    throw ApiError.notFound('Follow-up not found');
  }
  await getAccessibleLead(followUp.leadId, user); // throws 404 if lead not accessible
  return followUp;
}

export async function listFollowUps(req: Request, res: Response) {
  const user = currentUser(req);
  const query = getValidatedQuery<z.infer<typeof listFollowUpsQuerySchema>>(req);
  const { page, pageSize, offset } = parsePagination(query as Record<string, unknown>);

  const conditions: WhereOptions[] = [];
  if (user.role !== 'ADMIN') conditions.push({ assignedToId: user.id });
  else if (query.assignedToId) conditions.push({ assignedToId: query.assignedToId });

  if (query.leadId) {
    if (user.role !== 'ADMIN') {
      await getAccessibleLead(query.leadId, user);
    }
    conditions.push({ leadId: query.leadId });
  }
  if (query.status) conditions.push({ status: query.status });
  if (query.search) conditions.push({ title: { [Op.like]: `%${query.search}%` } });

  const todayStart = startOfTodayUtc();
  const todayEnd = new Date(todayStart.getTime() + 24 * 3600 * 1000);
  switch (query.view) {
    case 'today':
      conditions.push({ status: 'PENDING', dueAt: { [Op.gte]: todayStart, [Op.lt]: todayEnd } });
      break;
    case 'upcoming':
      conditions.push({ status: 'PENDING', dueAt: { [Op.gte]: todayEnd } });
      break;
    case 'overdue':
      conditions.push({ status: 'PENDING', dueAt: { [Op.lt]: new Date() } });
      break;
    case 'completed':
      conditions.push({ status: 'COMPLETED' });
      break;
    default:
      break;
  }

  const leadInclude: Record<string, unknown> = {
    model: Lead,
    as: 'lead',
    attributes: ['id', 'leadCode', 'companyName', 'contactName', 'phone', 'email', 'status'],
  };

  if (user.role !== 'ADMIN') {
    leadInclude.where = leadScopeWhere(user);
    leadInclude.required = true;
  }

  const { rows, count } = await FollowUp.findAndCountAll({
    where: conditions.length ? { [Op.and]: conditions } : undefined,
    include: [
      leadInclude,
      { model: User, as: 'assignedTo', attributes: USER_ATTRS },
    ],
    limit: pageSize,
    offset,
    order: [['dueAt', query.view === 'completed' ? 'DESC' : 'ASC']],
    distinct: true,
  });

  return sendPaginated(res, rows, buildPaginationMeta(page, pageSize, count));
}

export async function getFollowUp(req: Request, res: Response) {
  const followUp = await getAccessibleFollowUp(Number(req.params.id), req);
  await followUp.reload({
    include: [
      { model: Lead, as: 'lead' },
      { model: User, as: 'assignedTo', attributes: USER_ATTRS },
    ],
  });
  return sendSuccess(res, followUp);
}

export async function createFollowUp(req: Request, res: Response) {
  const user = currentUser(req);
  const body = req.body as {
    leadId: number;
    title: string;
    description?: string | null;
    dueDate: string;
    dueTime?: string | null;
    assignedToId?: number | null;
  };

  const lead = await getAccessibleLead(body.leadId, user);

  // MODEL A: Follow-up assignee must strictly match the lead's owner
  let assignedToId = lead.assignedBdeId;
  if (user.role === 'ADMIN' && body.assignedToId !== undefined && body.assignedToId !== null) {
    if (lead.assignedBdeId && body.assignedToId !== lead.assignedBdeId) {
      throw ApiError.badRequest('Follow-up assignee must match the lead owner. Reassign the lead if you wish to change ownership.');
    }
    const target = await User.findOne({ where: { id: body.assignedToId, role: 'BDE', isActive: true } });
    if (!target) throw ApiError.badRequest('Selected user must be a valid, active BDE');
    assignedToId = target.id;
  }

  const dueAt = combineDueAt(body.dueDate, body.dueTime);
  const followUp = await FollowUp.create({
    leadId: lead.id,
    createdById: user.id,
    assignedToId,
    title: body.title,
    description: body.description ?? null,
    dueDate: body.dueDate,
    dueTime: body.dueTime ?? null,
    dueAt,
    status: 'PENDING',
  });

  // Keep the lead's next follow-up pointer accurate.
  await recalculateLeadNextFollowUp(lead.id);

  await logActivity({
    leadId: lead.id,
    userId: user.id,
    activityType: 'FOLLOWUP_CREATED',
    description: `Follow-up scheduled: ${body.title} (${body.dueDate})`,
    metadata: { followUpId: followUp.id },
  });

  return sendCreated(res, followUp, 'Follow-up created');
}

export async function updateFollowUp(req: Request, res: Response) {
  const user = currentUser(req);
  const followUp = await getAccessibleFollowUp(Number(req.params.id), req);
  if (followUp.status !== 'PENDING') {
    throw ApiError.badRequest(`A ${followUp.status.toLowerCase()} follow-up can no longer be edited`);
  }

  const body = req.body as Partial<{
    title: string;
    description: string | null;
    dueDate: string;
    dueTime: string | null;
    assignedToId: number | null;
  }>;

  if (body.title !== undefined) followUp.title = body.title;
  if (body.description !== undefined) followUp.description = body.description;
  if (body.dueDate !== undefined) followUp.dueDate = body.dueDate;
  if (body.dueTime !== undefined) followUp.dueTime = body.dueTime;
  if (body.dueDate !== undefined || body.dueTime !== undefined) {
    followUp.dueAt = combineDueAt(followUp.dueDate, followUp.dueTime);
    // Rescheduling restarts the reminder cycle.
    followUp.reminderSentAt = null;
    followUp.overdueNotifiedAt = null;
  }
  if (body.assignedToId !== undefined) {
    if (user.role !== 'ADMIN') throw ApiError.forbidden('Only an admin can reassign follow-ups');
    const lead = await Lead.findByPk(followUp.leadId);
    if (lead && lead.assignedBdeId && body.assignedToId !== lead.assignedBdeId) {
      throw ApiError.badRequest('Follow-up assignee must match the lead owner. Reassign the lead if you wish to change ownership.');
    }
    if (body.assignedToId !== null) {
      const target = await User.findOne({ where: { id: body.assignedToId, role: 'BDE', isActive: true } });
      if (!target) throw ApiError.badRequest('Selected user must be a valid, active BDE');
    }
    followUp.assignedToId = body.assignedToId;
  }


  await followUp.save();
  await recalculateLeadNextFollowUp(followUp.leadId);

  await logActivity({
    leadId: followUp.leadId,
    userId: user.id,
    activityType: 'FOLLOWUP_UPDATED',
    description: `Follow-up updated: ${followUp.title}`,
    metadata: { followUpId: followUp.id },
  });

  return sendSuccess(res, followUp, 'Follow-up updated');
}

export async function completeFollowUp(req: Request, res: Response) {
  const user = currentUser(req);
  const followUp = await getAccessibleFollowUp(Number(req.params.id), req);
  if (followUp.status !== 'PENDING') throw ApiError.badRequest('Only a pending follow-up can be completed');

  const { outcome } = req.body as { outcome?: string | null };
  followUp.status = 'COMPLETED';
  followUp.completedAt = new Date();
  followUp.outcome = outcome ?? null;
  await followUp.save();

  await recalculateLeadNextFollowUp(followUp.leadId);

  await logActivity({
    leadId: followUp.leadId,
    userId: user.id,
    activityType: 'FOLLOWUP_COMPLETED',
    description: `Follow-up completed: ${followUp.title}${outcome ? ` — ${outcome}` : ''}`,
    metadata: { followUpId: followUp.id },
  });

  return sendSuccess(res, followUp, 'Follow-up completed');
}

export async function cancelFollowUp(req: Request, res: Response) {
  const user = currentUser(req);
  const followUp = await getAccessibleFollowUp(Number(req.params.id), req);
  if (followUp.status !== 'PENDING') throw ApiError.badRequest('Only a pending follow-up can be cancelled');

  const { reason } = req.body as { reason?: string | null };
  followUp.status = 'CANCELLED';
  followUp.outcome = reason ?? null;
  await followUp.save();

  await recalculateLeadNextFollowUp(followUp.leadId);

  await logActivity({
    leadId: followUp.leadId,
    userId: user.id,
    activityType: 'FOLLOWUP_CANCELLED',
    description: `Follow-up cancelled: ${followUp.title}${reason ? ` — ${reason}` : ''}`,
    metadata: { followUpId: followUp.id },
  });

  return sendSuccess(res, followUp, 'Follow-up cancelled');
}

export async function deleteFollowUp(req: Request, res: Response) {
  const followUp = await getAccessibleFollowUp(Number(req.params.id), req);
  const leadId = followUp.leadId;
  const user = currentUser(req);

  await followUp.destroy();
  await recalculateLeadNextFollowUp(leadId);

  await logActivity({
    leadId,
    userId: user.id,
    activityType: 'FOLLOWUP_CANCELLED',
    description: `Follow-up deleted: ${followUp.title}`,
    metadata: { followUpId: followUp.id },
  });

  return sendSuccess(res, { id: followUp.id }, 'Follow-up deleted');
}

