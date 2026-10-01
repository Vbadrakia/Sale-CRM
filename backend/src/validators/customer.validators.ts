import { z } from 'zod';

export const createCustomerSchema = z.object({
  sourceLeadId: z.coerce.number().int().positive(),
  service: z.string().trim().max(190).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const updateCustomerSchema = z.object({
  contactName: z.string().trim().max(140).optional().nullable(),
  designation: z.string().trim().max(140).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  email: z.string().trim().toLowerCase().email().max(190).optional().nullable(),
  website: z.string().trim().max(190).optional().nullable(),
  country: z.string().trim().max(90).optional().nullable(),
  state: z.string().trim().max(90).optional().nullable(),
  city: z.string().trim().max(90).optional().nullable(),
  service: z.string().trim().max(190).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  assignedBdeId: z.coerce.number().int().positive().optional().nullable(),
});

export const listCustomersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().optional(),
  search: z.string().trim().max(190).optional(),
  assignedBdeId: z.coerce.number().int().positive().optional(),
});
