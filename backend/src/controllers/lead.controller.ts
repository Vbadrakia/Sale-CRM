import { Op, Order, WhereOptions } from 'sequelize';
import { Request, Response } from 'express';
import { z } from 'zod';
import { Activity, Customer, FollowUp, Lead, User } from '../models';
import { ApiError } from '../utils/ApiError';
import { sendCreated, sendPaginated, sendSuccess } from '../utils/apiResponse';
import { buildPaginationMeta, parsePagination } from '../utils/pagination';
import { getValidatedQuery } from '../middleware/validate';
import { listLeadsQuerySchema } from '../validators/lead.validators';
import { currentUser } from '../middleware/auth';
import {
  assertValidTransition,
  findDuplicates,
  generateLeadCode,
  getAccessibleLead,
  leadScopeWhere,
  withTransaction,
} from '../services/lead.service';
import { logActivity } from '../services/activity.service';
import { createNotification } from '../services/notification.service';
import { LeadStatus } from '../types';

const USER_ATTRS = ['id', 'firstName', 'lastName', 'email'];

export async function listLeads(req: Request, res: Response) {
  const user = currentUser(req);
  const query = getValidatedQuery<z.infer<typeof listLeadsQuerySchema>>(req);
  const { page, pageSize, offset } = parsePagination(query as Record<string, unknown>);

  const conditions: WhereOptions[] = [leadScopeWhere(user)];

  if (query.status) conditions.push({ status: query.status });
  if (query.priority) conditions.push({ priority: query.priority });
  if (query.leadSource) conditions.push({ leadSource: query.leadSource });
  if (query.country) conditions.push({ country: query.country });
  if (query.state) conditions.push({ state: query.state });
  if (query.city) conditions.push({ city: query.city });

  // Only admins may filter by another BDE; a BDE stays scoped to themselves.
  if (query.assignedBdeId !== undefined && user.role === 'ADMIN') {
    conditions.push(
      query.assignedBdeId === 'unassigned' ? { assignedBdeId: null } : { assignedBdeId: query.assignedBdeId },
    );
  }

  if (query.createdFrom || query.createdTo) {
    const range: Record<symbol, Date> = {};
    if (query.createdFrom) range[Op.gte] = query.createdFrom;
    if (query.createdTo) range[Op.lte] = query.createdTo;
    conditions.push({ createdAt: range });
  }

  if (query.search) {
    const term = `%${query.search}%`;
    conditions.push({
      [Op.or]: [
        { leadCode: { [Op.like]: term } },
        { companyName: { [Op.like]: term } },
        { contactName: { [Op.like]: term } },
        { email: { [Op.like]: term } },
        { phone: { [Op.like]: term } },
        { city: { [Op.like]: term } },
      ],
    });
  }

  const order: Order = [[query.sortBy || 'createdAt', query.sortDir || 'DESC']];

  const { rows, count } = await Lead.findAndCountAll({
    where: { [Op.and]: conditions },
    include: [
      { model: User, as: 'assignedBde', attributes: USER_ATTRS },
      { model: User, as: 'importer', attributes: USER_ATTRS },
    ],
    limit: pageSize,
    offset,
    order,
    distinct: true,
  });

  return sendPaginated(res, rows, buildPaginationMeta(page, pageSize, count));
}

export async function getLead(req: Request, res: Response) {
  const user = currentUser(req);
  const id = Number(req.params.id);
  if (!id || isNaN(id)) throw ApiError.notFound('Lead not found');

  const lead = await getAccessibleLead(id, user, { includeAssociations: true });

  const followUps = await FollowUp.findAll({
    where: { leadId: lead.id },
    include: [{ model: User, as: 'assignedTo', attributes: USER_ATTRS }],
    order: [['dueAt', 'ASC']],
  }).catch(() => []);

  const activities = await Activity.findAll({
    where: { leadId: lead.id },
    include: [{ model: User, as: 'user', attributes: USER_ATTRS }],
    order: [['createdAt', 'DESC']],
    limit: 200,
  }).catch(() => []);

  const customer = await Customer.findOne({ where: { sourceLeadId: lead.id } }).catch(() => null);

  return sendSuccess(res, { lead, followUps, activities, customer });
}

export async function checkLeadDuplicates(req: Request, res: Response) {
  const user = currentUser(req);
  const body = req.body as { email?: string; phone?: string; website?: string; companyName?: string; contactName?: string };
  const duplicates = await findDuplicates(body, { where: leadScopeWhere(user) });
  return sendSuccess(res, { duplicates });
}

export async function createLead(req: Request, res: Response) {
  const user = currentUser(req);
  const body = req.body as Record<string, unknown> & { allowDuplicate?: boolean; assignedBdeId?: number | null };

  const duplicates = await findDuplicates({
    email: body.email as string | null,
    phone: body.phone as string | null,
    website: body.website as string | null,
    companyName: body.companyName as string | null,
    contactName: body.contactName as string | null,
  });

  if (duplicates.length && !body.allowDuplicate) {
    throw ApiError.conflict('A matching lead already exists', [
      { message: duplicates.map((d) => `${d.lead.leadCode} (${d.reason})`).join('; ') },
    ]);
  }

  if (body.assignedBdeId) {
    const bde = await User.findOne({ where: { id: body.assignedBdeId, role: 'BDE', isActive: true } });
    if (!bde) throw ApiError.badRequest('Selected BDE is not a valid active user');
  }

  const lead = await withTransaction(async (transaction) => {
    const leadCode = await generateLeadCode(transaction);
    const created = await Lead.create(
      {
        leadCode,
        companyName: body.companyName as string,
        contactName: (body.contactName as string) ?? null,
        designation: (body.designation as string) ?? null,
        phone: (body.phone as string) ?? null,
        alternatePhone: (body.alternatePhone as string) ?? null,
        email: (body.email as string) ?? null,
        alternateEmail: (body.alternateEmail as string) ?? null,
        website: (body.website as string) ?? null,
        country: (body.country as string) ?? null,
        state: (body.state as string) ?? null,
        city: (body.city as string) ?? null,
        industry: (body.industry as string) ?? null,
        companySize: (body.companySize as string) ?? null,
        serviceRequired: (body.serviceRequired as string) ?? null,
        leadSource: (body.leadSource as string) ?? null,
        status: (body.status as LeadStatus) ?? 'NEW',
        priority: (body.priority as 'LOW' | 'MEDIUM' | 'HIGH') ?? 'MEDIUM',
        assignedBdeId: (body.assignedBdeId as number) ?? null,
        createdById: user.id,
        importedById: null,
        importJobId: null,
        tags: (body.tags as string) ?? null,
        notes: (body.notes as string) ?? null,
        remarks: (body.remarks as string) ?? null,
        nextFollowUpAt: (body.nextFollowUpAt as Date) ?? null,
      },
      { transaction },
    );

    await logActivity({
      leadId: created.id,
      userId: user.id,
      activityType: 'LEAD_CREATED',
      description: `Lead ${created.leadCode} created`,
      transaction,
    });

    if (created.assignedBdeId) {
      await logActivity({
        leadId: created.id,
        userId: user.id,
        activityType: 'LEAD_ASSIGNED',
        description: `Lead assigned on creation`,
        metadata: { assignedBdeId: created.assignedBdeId },
        transaction,
      });
      await createNotification({
        userId: created.assignedBdeId,
        type: 'LEAD_ASSIGNED',
        title: 'New lead assigned',
        message: `${created.companyName} (${created.leadCode}) has been assigned to you.`,
        entityType: 'lead',
        entityId: created.id,
        transaction,
      });
    }

    return created;
  });

  return sendCreated(res, lead, 'Lead created');
}

export async function updateLead(req: Request, res: Response) {
  const user = currentUser(req);
  const lead = await getAccessibleLead(Number(req.params.id), user);
  const body = req.body as Record<string, unknown>;

  // Status, assignment and conversion have dedicated endpoints — they are not
  // writable here, which also blocks mass-assignment attempts.
  const changed: string[] = [];
  for (const [key, value] of Object.entries(body)) {
    const current = (lead as unknown as Record<string, unknown>)[key];
    if (current !== value) changed.push(key);
    (lead as unknown as Record<string, unknown>)[key] = value;
  }
  await lead.save();

  await logActivity({
    leadId: lead.id,
    userId: user.id,
    activityType: 'LEAD_UPDATED',
    description: `Lead details updated${changed.length ? `: ${changed.join(', ')}` : ''}`,
    metadata: { fields: changed },
  });

  return sendSuccess(res, lead, 'Lead updated');
}

export async function updateLeadStatus(req: Request, res: Response) {
  const user = currentUser(req);
  const lead = await getAccessibleLead(Number(req.params.id), user);
  const { status, lostReason, note } = req.body as { status: LeadStatus; lostReason?: string | null; note?: string | null };

  assertValidTransition(lead.status, status);

  const previous = lead.status;
  lead.status = status;
  const now = new Date();

  if (status === 'CONTACTED' || status === 'FOLLOW_UP') lead.lastContactedAt = now;
  if (status === 'WON') {
    lead.wonAt = now;
    lead.lostAt = null;
    lead.lostReason = null;
  }
  if (status === 'LOST') {
    lead.lostAt = now;
    lead.lostReason = lostReason ?? null;
  }
  if (status === 'FOLLOW_UP' && previous === 'LOST') {
    lead.lostAt = null;
    lead.lostReason = null;
  }
  await lead.save();

  await logActivity({
    leadId: lead.id,
    userId: user.id,
    activityType: status === 'WON' ? 'LEAD_WON' : status === 'LOST' ? 'LEAD_LOST' : 'STATUS_CHANGED',
    description: `Status changed from ${previous} to ${status}${lostReason ? ` — ${lostReason}` : ''}`,
    metadata: { from: previous, to: status, lostReason: lostReason ?? null },
  });

  if (note) {
    await logActivity({
      leadId: lead.id,
      userId: user.id,
      activityType: 'NOTE_ADDED',
      description: note,
    });
  }

  if (lead.assignedBdeId && lead.assignedBdeId !== user.id) {
    await createNotification({
      userId: lead.assignedBdeId,
      type: 'LEAD_STATUS_CHANGED',
      title: 'Lead status updated',
      message: `${lead.companyName} (${lead.leadCode}) moved to ${status}.`,
      entityType: 'lead',
      entityId: lead.id,
    });
  }

  return sendSuccess(res, lead, 'Status updated');
}

export async function assignLead(req: Request, res: Response) {
  const user = currentUser(req);
  const lead = await Lead.findByPk(Number(req.params.id));
  if (!lead) throw ApiError.notFound('Lead not found');

  const { assignedBdeId } = req.body as { assignedBdeId: number | null };
  const importerOwnsLead = lead.importedById !== null && lead.importedById === lead.assignedBdeId;
  if (importerOwnsLead && assignedBdeId !== lead.importedById) {
    throw ApiError.forbidden('Imported leads remain private to the BDE who imported them');
  }
  if (assignedBdeId !== null) {
    const bde = await User.findOne({ where: { id: assignedBdeId, role: 'BDE', isActive: true } });
    if (!bde) throw ApiError.badRequest('Selected BDE is not a valid active user');
  }

  const previous = lead.assignedBdeId;
  if (previous === assignedBdeId) throw ApiError.badRequest('Lead is already assigned to this user');

  lead.assignedBdeId = assignedBdeId;
  await lead.save();

  // In MODEL A: update pending follow-ups so they remain aligned with the lead's new owner
  await FollowUp.update(
    { assignedToId: assignedBdeId },
    { where: { leadId: lead.id, status: 'PENDING' } },
  );


  await logActivity({
    leadId: lead.id,
    userId: user.id,
    activityType: previous ? 'LEAD_REASSIGNED' : 'LEAD_ASSIGNED',
    description: assignedBdeId ? `Lead assigned to user #${assignedBdeId}` : 'Lead unassigned',
    metadata: { from: previous, to: assignedBdeId },
  });

  if (assignedBdeId) {
    await createNotification({
      userId: assignedBdeId,
      type: 'LEAD_ASSIGNED',
      title: 'New lead assigned',
      message: `${lead.companyName} (${lead.leadCode}) has been assigned to you.`,
      entityType: 'lead',
      entityId: lead.id,
    });
  }

  return sendSuccess(res, lead, 'Lead assignment updated');
}

export async function addLeadNote(req: Request, res: Response) {
  const user = currentUser(req);
  const lead = await getAccessibleLead(Number(req.params.id), user);
  const { note } = req.body as { note: string };

  const activity = await logActivity({
    leadId: lead.id,
    userId: user.id,
    activityType: 'NOTE_ADDED',
    description: note,
  });

  return sendCreated(res, activity, 'Note added');
}

export async function deleteLead(req: Request, res: Response) {
  const user = currentUser(req);
  const lead = await getAccessibleLead(Number(req.params.id), user);

  const customer = await Customer.findOne({ where: { sourceLeadId: lead.id } });
  if (customer) throw ApiError.conflict('This lead has been converted to a customer and cannot be deleted');

  await logActivity({
    leadId: lead.id,
    userId: user.id,
    activityType: 'LEAD_DELETED',
    description: `Lead ${lead.leadCode} deleted`,
  });
  // Soft delete (paranoid) — activity history is preserved.
  await lead.destroy();

  return sendSuccess(res, { id: lead.id }, 'Lead deleted');
}

export async function listLeadActivities(req: Request, res: Response) {
  const user = currentUser(req);
  const lead = await getAccessibleLead(Number(req.params.id), user);
  const activities = await Activity.findAll({
    where: { leadId: lead.id },
    include: [{ model: User, as: 'user', attributes: USER_ATTRS }],
    order: [['createdAt', 'DESC']],
    limit: 200,
  });
  return sendSuccess(res, activities);
}

/** Distinct values powering the lead-list filter dropdowns. */
export async function leadFilterOptions(req: Request, res: Response) {
  const user = currentUser(req);
  const where = leadScopeWhere(user);
  const [sources, countries, states, cities] = await Promise.all([
    Lead.aggregate('leadSource', 'DISTINCT', { plain: false, where }),
    Lead.aggregate('country', 'DISTINCT', { plain: false, where }),
    Lead.aggregate('state', 'DISTINCT', { plain: false, where }),
    Lead.aggregate('city', 'DISTINCT', { plain: false, where }),
  ]);
  const pick = (rows: unknown, key: string) =>
    (rows as Record<string, string | null>[])
      .map((row) => row.DISTINCT ?? row[key])
      .filter((value): value is string => !!value)
      .sort();

  return sendSuccess(res, {
    sources: pick(sources, 'leadSource'),
    countries: pick(countries, 'country'),
    states: pick(states, 'state'),
    cities: pick(cities, 'city'),
  });
}
