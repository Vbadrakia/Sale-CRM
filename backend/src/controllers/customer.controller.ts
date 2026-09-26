import { Op, Transaction, WhereOptions, QueryTypes } from 'sequelize';
import { Request, Response } from 'express';
import { z } from 'zod';
import { Customer, Lead, User } from '../models';
import { sequelize } from '../config/database';
import { ApiError } from '../utils/ApiError';
import { sendCreated, sendPaginated, sendSuccess } from '../utils/apiResponse';
import { buildPaginationMeta, parsePagination } from '../utils/pagination';
import { getValidatedQuery } from '../middleware/validate';
import { listCustomersQuerySchema } from '../validators/customer.validators';
import { currentUser } from '../middleware/auth';
import { getAccessibleLead, withTransaction } from '../services/lead.service';
import { logActivity } from '../services/activity.service';
import { createNotification } from '../services/notification.service';

const USER_ATTRS = ['id', 'firstName', 'lastName', 'email'];

async function generateCustomerCode(transaction?: Transaction): Promise<string> {
  const year = new Date().getUTCFullYear();
  const prefix = `CU-${year}-`;
  try {
    const results = await sequelize.query<{ nextval: string | number }>(
      `SELECT nextval('customer_code_seq') AS nextval`,
      { type: QueryTypes.SELECT, transaction },
    );
    if (results && results[0] && results[0].nextval) {
      return `${prefix}${String(results[0].nextval).padStart(5, '0')}`;
    }
  } catch {
    // Fallback for MySQL or environments where customer_code_seq sequence does not exist
  }

  const maxId = (await Customer.max('id', { transaction })) as number | null;
  const val = (maxId || 0) + 1;
  return `${prefix}${String(val).padStart(5, '0')}`;
}

export async function listCustomers(req: Request, res: Response) {
  const user = currentUser(req);
  const query = getValidatedQuery<z.infer<typeof listCustomersQuerySchema>>(req);
  const { page, pageSize, offset } = parsePagination(query as Record<string, unknown>);

  const conditions: WhereOptions[] = [user.role === 'ADMIN' ? {} : { assignedBdeId: user.id }];
  if (query.assignedBdeId && user.role === 'ADMIN') conditions.push({ assignedBdeId: query.assignedBdeId });
  if (query.search) {
    const term = `%${query.search}%`;
    conditions.push({
      [Op.or]: [
        { customerCode: { [Op.like]: term } },
        { companyName: { [Op.like]: term } },
        { contactName: { [Op.like]: term } },
        { email: { [Op.like]: term } },
        { phone: { [Op.like]: term } },
      ],
    });
  }

  const { rows, count } = await Customer.findAndCountAll({
    where: { [Op.and]: conditions },
    include: [{ model: User, as: 'assignedBde', attributes: USER_ATTRS }],
    limit: pageSize,
    offset,
    order: [['createdAt', 'DESC']],
    distinct: true,
  });

  return sendPaginated(res, rows, buildPaginationMeta(page, pageSize, count));
}

export async function getCustomer(req: Request, res: Response) {
  const user = currentUser(req);
  const customer = await Customer.findByPk(Number(req.params.id), {
    include: [
      { model: User, as: 'assignedBde', attributes: USER_ATTRS },
      { model: Lead, as: 'sourceLead' },
    ],
  });
  if (!customer) throw ApiError.notFound('Customer not found');
  if (user.role !== 'ADMIN' && customer.assignedBdeId !== user.id) throw ApiError.notFound('Customer not found');
  return sendSuccess(res, customer);
}

/** Converts a qualified lead into a customer. Idempotency is enforced by a unique source_lead_id. */
export async function convertLead(req: Request, res: Response) {
  const user = currentUser(req);
  const leadId = Number(req.params.id ?? (req.body as { sourceLeadId?: number }).sourceLeadId);
  if (!Number.isInteger(leadId) || leadId <= 0) throw ApiError.badRequest('A valid lead is required');

  const lead = await getAccessibleLead(leadId, user);
  if (lead.status !== 'QUALIFIED' && lead.status !== 'WON') {
    throw ApiError.badRequest('Only qualified or won leads can be converted to customers');
  }

  const existing = await Customer.findOne({ where: { sourceLeadId: lead.id } });
  if (existing) throw ApiError.conflict('This lead has already been converted to a customer');

  const body = req.body as { service?: string | null; notes?: string | null };

  const customer = await withTransaction(async (transaction) => {
    const created = await Customer.create(
      {
        customerCode: await generateCustomerCode(transaction),
        sourceLeadId: lead.id,
        companyName: lead.companyName,
        contactName: lead.contactName,
        designation: lead.designation,
        phone: lead.phone,
        email: lead.email,
        website: lead.website,
        country: lead.country,
        state: lead.state,
        city: lead.city,
        service: body.service ?? lead.serviceRequired ?? null,
        assignedBdeId: lead.assignedBdeId,
        notes: body.notes ?? null,
      },
      { transaction },
    );

    // The original lead is preserved, only stamped with the conversion time.
    lead.convertedAt = new Date();
    await lead.save({ transaction });

    await logActivity({
      leadId: lead.id,
      userId: user.id,
      activityType: 'LEAD_CONVERTED',
      description: `Lead converted to customer ${created.customerCode}`,
      metadata: { customerId: created.id },
      transaction,
    });

    if (lead.assignedBdeId && lead.assignedBdeId !== user.id) {
      await createNotification({
        userId: lead.assignedBdeId,
        type: 'LEAD_CONVERTED',
        title: 'Lead converted',
        message: `${lead.companyName} is now a customer (${created.customerCode}).`,
        entityType: 'customer',
        entityId: created.id,
        transaction,
      });
    }

    return created;
  });

  return sendCreated(res, customer, 'Lead converted to customer');
}

export async function updateCustomer(req: Request, res: Response) {
  const user = currentUser(req);
  const customer = await Customer.findByPk(Number(req.params.id));
  if (!customer) throw ApiError.notFound('Customer not found');
  if (user.role !== 'ADMIN' && customer.assignedBdeId !== user.id) throw ApiError.notFound('Customer not found');

  const body = req.body as Record<string, unknown>;
  const allowedFields = [
    'companyName',
    'contactName',
    'designation',
    'phone',
    'email',
    'website',
    'country',
    'state',
    'city',
    'service',
    'notes',
  ] as const;

  if (body.assignedBdeId !== undefined) {
    if (user.role !== 'ADMIN') {
      throw ApiError.forbidden('Only an admin can reassign customers');
    }
    const targetBde = await User.findOne({ where: { id: Number(body.assignedBdeId), role: 'BDE', isActive: true } });
    if (!targetBde) throw ApiError.badRequest('Selected user is not a valid active BDE');
    customer.assignedBdeId = targetBde.id;
  }

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      (customer as unknown as Record<string, unknown>)[field] = body[field];
    }
  }

  await customer.save();

  return sendSuccess(res, customer, 'Customer updated');
}
