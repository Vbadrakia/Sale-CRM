import { z } from 'zod';

const optionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v === '' ? null : (v ?? null)));

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(190)
  .email('Enter a valid email address')
  .optional()
  .nullable()
  .or(z.literal('').transform(() => null));

export const LEAD_STATUSES = ['NEW', 'CONTACTED', 'FOLLOW_UP', 'QUALIFIED', 'WON', 'LOST'] as const;
export const LEAD_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;

export const leadBaseSchema = z.object({
  companyName: z.string().trim().min(1, 'Company name is required').max(190),
  contactName: optionalString(140),
  designation: optionalString(140),
  phone: optionalString(30),
  alternatePhone: optionalString(30),
  email: optionalEmail,
  alternateEmail: optionalEmail,
  website: optionalString(190),
  country: optionalString(90),
  state: optionalString(90),
  city: optionalString(90),
  industry: optionalString(120),
  companySize: optionalString(60),
  serviceRequired: optionalString(190),
  leadSource: optionalString(90),
  priority: z.enum(LEAD_PRIORITIES).optional(),
  tags: optionalString(500),
  remarks: optionalString(5000),
  notes: optionalString(5000),
  nextFollowUpAt: z.coerce.date().optional().nullable(),
});

export const createLeadSchema = leadBaseSchema.extend({
  assignedBdeId: z.coerce.number().int().positive().optional().nullable(),
  status: z.enum(LEAD_STATUSES).optional(),
  /** Set true after the admin has reviewed reported duplicates. */
  allowDuplicate: z.boolean().optional(),
});

export const updateLeadSchema = leadBaseSchema.partial();

export const updateLeadStatusSchema = z
  .object({
    status: z.enum(LEAD_STATUSES),
    lostReason: z.string().trim().max(500).optional().nullable(),
    note: z.string().trim().max(1000).optional().nullable(),
  })
  .refine((data) => data.status !== 'LOST' || !!data.lostReason, {
    message: 'A reason is required when marking a lead as lost',
    path: ['lostReason'],
  });

export const assignLeadSchema = z.object({
  assignedBdeId: z.coerce.number().int().positive().nullable(),
});

export const addNoteSchema = z.object({
  note: z.string().trim().min(1, 'Note cannot be empty').max(2000),
});

export const convertLeadSchema = z.object({
  service: z.string().trim().max(190).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const listLeadsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().optional(),
  search: z.string().trim().max(190).optional(),
  status: z.enum(LEAD_STATUSES).optional(),
  priority: z.enum(LEAD_PRIORITIES).optional(),
  assignedBdeId: z.union([z.coerce.number().int().positive(), z.literal('unassigned')]).optional(),
  leadSource: z.string().trim().max(90).optional(),
  country: z.string().trim().max(90).optional(),
  state: z.string().trim().max(90).optional(),
  city: z.string().trim().max(90).optional(),
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
  sortBy: z
    .enum(['createdAt', 'updatedAt', 'companyName', 'status', 'priority', 'nextFollowUpAt', 'leadCode'])
    .optional(),
  sortDir: z.enum(['ASC', 'DESC']).optional(),
});

export type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;
