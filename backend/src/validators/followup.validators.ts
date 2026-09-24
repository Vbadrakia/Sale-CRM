import { z } from 'zod';

const timeSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/, 'Use HH:mm time format')
  .optional()
  .nullable();

export const createFollowUpSchema = z.object({
  leadId: z.coerce.number().int().positive(),
  title: z.string().trim().min(1, 'Title is required').max(190),
  description: z.string().trim().max(2000).optional().nullable(),
  dueDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD date format'),
  dueTime: timeSchema,
  assignedToId: z.coerce.number().int().positive().optional().nullable(),
});

export const updateFollowUpSchema = z.object({
  title: z.string().trim().min(1).max(190).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  dueDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD date format')
    .optional(),
  dueTime: timeSchema,
  assignedToId: z.coerce.number().int().positive().optional().nullable(),
});

export const completeFollowUpSchema = z.object({
  outcome: z.string().trim().max(2000).optional().nullable(),
});

export const cancelFollowUpSchema = z.object({
  reason: z.string().trim().max(500).optional().nullable(),
});

export const listFollowUpsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().optional(),
  status: z.enum(['PENDING', 'COMPLETED', 'CANCELLED']).optional(),
  view: z.enum(['today', 'upcoming', 'overdue', 'completed', 'all']).optional(),
  leadId: z.coerce.number().int().positive().optional(),
  assignedToId: z.coerce.number().int().positive().optional(),
  search: z.string().trim().max(190).optional(),
});
