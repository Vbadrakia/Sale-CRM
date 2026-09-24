import { Op, Transaction, WhereOptions, QueryTypes } from 'sequelize';
import { Lead, User, sequelize } from '../models';
import { ApiError } from '../utils/ApiError';
import { LeadStatus } from '../types';
import {
  normalizeCompareText,
  normalizeEmail,
  normalizeWebsite,
  phoneCompareKey,
} from '../utils/normalize';

/** Allowed forward transitions in the pipeline. */
export const ALLOWED_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  NEW: ['CONTACTED', 'FOLLOW_UP', 'QUALIFIED', 'LOST'],
  CONTACTED: ['FOLLOW_UP', 'QUALIFIED', 'LOST'],
  FOLLOW_UP: ['CONTACTED', 'QUALIFIED', 'LOST'],
  QUALIFIED: ['WON', 'LOST', 'FOLLOW_UP'],
  WON: [],
  LOST: ['FOLLOW_UP'], // reopening a lost lead is the only way out
};

export function assertValidTransition(from: LeadStatus, to: LeadStatus): void {
  if (from === to) throw ApiError.badRequest(`Lead is already in status ${to}`);
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw ApiError.badRequest(`Invalid status transition: ${from} → ${to}`);
  }
}

export async function generateLeadCode(transaction?: Transaction): Promise<string> {
  const year = new Date().getUTCFullYear();
  const prefix = `LD-${year}-`;
  try {
    const results = await sequelize.query<{ nextval: string | number }>(
      `SELECT nextval('lead_code_seq') AS nextval`,
      { type: QueryTypes.SELECT, transaction },
    );
    if (results && results[0] && results[0].nextval) {
      return `${prefix}${String(results[0].nextval).padStart(5, '0')}`;
    }
  } catch {
    // Fallback for MySQL or environments where lead_code_seq sequence does not exist
  }

  const maxId = (await Lead.max('id', { transaction, paranoid: false })) as number | null;
  const val = (maxId || 0) + 1;
  return `${prefix}${String(val).padStart(5, '0')}`;
}

export interface DuplicateMatch {
  reason: string;
  lead: {
    id: number;
    leadCode: string;
    companyName: string;
    contactName: string | null;
    email: string | null;
    phone: string | null;
    status: LeadStatus;
    assignedBdeId: number | null;
  };
}

/** Finds existing leads that look like the incoming record, and explains why. */
export async function findDuplicates(
  input: {
    email?: string | null;
    phone?: string | null;
    website?: string | null;
    companyName?: string | null;
    contactName?: string | null;
  },
  options: { excludeId?: number; transaction?: Transaction; where?: WhereOptions } = {},
): Promise<DuplicateMatch[]> {
  const emailKey = normalizeEmail(input.email);
  const phoneKey = phoneCompareKey(input.phone);
  const websiteKey = normalizeWebsite(input.website);
  const companyKey = normalizeCompareText(input.companyName);
  const contactKey = normalizeCompareText(input.contactName);

  const clauses: WhereOptions[] = [];
  if (emailKey) clauses.push({ emailKey });
  if (phoneKey) clauses.push({ phoneKey });
  if (websiteKey) clauses.push({ websiteKey });
  if (companyKey && contactKey) clauses.push({ companyKey, contactKey });
  if (!clauses.length) return [];

  const baseWhere: WhereOptions = options.excludeId
    ? { [Op.and]: [{ [Op.or]: clauses }, { id: { [Op.ne]: options.excludeId } }] }
    : { [Op.or]: clauses };
  const where: WhereOptions = options.where ? { [Op.and]: [baseWhere, options.where] } : baseWhere;

  const leads = await Lead.findAll({ where, limit: 10, transaction: options.transaction });

  return leads.map((lead) => {
    const reasons: string[] = [];
    if (emailKey && lead.emailKey === emailKey) reasons.push('same email address');
    if (phoneKey && lead.phoneKey === phoneKey) reasons.push('same phone number');
    if (websiteKey && lead.websiteKey === websiteKey) reasons.push('same website domain');
    if (companyKey && contactKey && lead.companyKey === companyKey && lead.contactKey === contactKey) {
      reasons.push('same company and contact name');
    }
    return {
      reason: reasons.join(', ') || 'similar record',
      lead: {
        id: lead.id,
        leadCode: lead.leadCode,
        companyName: lead.companyName,
        contactName: lead.contactName,
        email: lead.email,
        phone: lead.phone,
        status: lead.status,
        assignedBdeId: lead.assignedBdeId,
      },
    };
  });
}

/**
 * Loads a lead and enforces record-level access.
 * A BDE may only ever load leads assigned to them — enforced here, server-side.
 */
export async function getAccessibleLead(
  leadId: number,
  user: User,
  options: { transaction?: Transaction; includeAssociations?: boolean } = {},
): Promise<Lead> {
  const lead = await Lead.findByPk(leadId, {
    transaction: options.transaction,
    include: options.includeAssociations
      ? [
          { model: User, as: 'assignedBde', attributes: ['id', 'firstName', 'lastName', 'email'] },
          { model: User, as: 'creator', attributes: ['id', 'firstName', 'lastName', 'email'] },
          { model: User, as: 'importer', attributes: ['id', 'firstName', 'lastName', 'email'] },
        ]
      : undefined,
  });
  if (!lead) throw ApiError.notFound('Lead not found');
  if (user.role !== 'ADMIN' && lead.assignedBdeId !== user.id) {
    // Do not reveal existence of another BDE's lead.
    throw ApiError.notFound('Lead not found');
  }
  return lead;
}

/** Scope clause applied to every lead-style listing query. */
export function leadScopeWhere(user: User): WhereOptions {
  return user.role === 'ADMIN' ? {} : { assignedBdeId: user.id };
}

export async function withTransaction<T>(fn: (t: Transaction) => Promise<T>): Promise<T> {
  return sequelize.transaction(fn);
}

export interface ExistingLeadMatchInfo {
  id: number;
  leadCode: string;
}

export interface ExistingLeadsLookupMap {
  byEmail: Map<string, ExistingLeadMatchInfo>;
  byPhone: Map<string, ExistingLeadMatchInfo>;
  byWebsite: Map<string, ExistingLeadMatchInfo>;
  byCompanyContact: Map<string, ExistingLeadMatchInfo>;
}

export async function buildExistingLeadsLookupMap(
  inputs: Array<{ email?: string | null; phone?: string | null; website?: string | null; companyName?: string | null; contactName?: string | null }>,
  whereScope: WhereOptions = {},
): Promise<ExistingLeadsLookupMap> {
  const emails = new Set<string>();
  const phones = new Set<string>();
  const websites = new Set<string>();

  for (const input of inputs) {
    const e = normalizeEmail(input.email);
    const p = phoneCompareKey(input.phone);
    const w = normalizeWebsite(input.website);
    if (e) emails.add(e);
    if (p) phones.add(p);
    if (w) websites.add(w);
  }

  const clauses: WhereOptions[] = [];
  if (emails.size) clauses.push({ emailKey: Array.from(emails) });
  if (phones.size) clauses.push({ phoneKey: Array.from(phones) });
  if (websites.size) clauses.push({ websiteKey: Array.from(websites) });

  const byEmail = new Map<string, ExistingLeadMatchInfo>();
  const byPhone = new Map<string, ExistingLeadMatchInfo>();
  const byWebsite = new Map<string, ExistingLeadMatchInfo>();
  const byCompanyContact = new Map<string, ExistingLeadMatchInfo>();

  if (!clauses.length) return { byEmail, byPhone, byWebsite, byCompanyContact };

  const where: WhereOptions = {
    [Op.and]: [{ [Op.or]: clauses }, whereScope],
  };

  const leads = await Lead.findAll({
    where,
    attributes: ['id', 'leadCode', 'emailKey', 'phoneKey', 'websiteKey', 'companyKey', 'contactKey'],
  });

  for (const lead of leads) {
    const info: ExistingLeadMatchInfo = { id: lead.id, leadCode: lead.leadCode };
    if (lead.emailKey && !byEmail.has(lead.emailKey)) byEmail.set(lead.emailKey, info);
    if (lead.phoneKey && !byPhone.has(lead.phoneKey)) byPhone.set(lead.phoneKey, info);
    if (lead.websiteKey && !byWebsite.has(lead.websiteKey)) byWebsite.set(lead.websiteKey, info);
    if (lead.companyKey && lead.contactKey) {
      const key = `${lead.companyKey}:${lead.contactKey}`;
      if (!byCompanyContact.has(key)) byCompanyContact.set(key, info);
    }
  }

  return { byEmail, byPhone, byWebsite, byCompanyContact };
}
