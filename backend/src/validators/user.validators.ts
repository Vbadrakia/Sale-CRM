import { z } from 'zod';
import { emailSchema, passwordSchema } from './auth.validators';

export const createUserSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(80),
  lastName: z.string().trim().min(1, 'Last name is required').max(80),
  email: emailSchema,
  phone: z.string().trim().max(30).optional().nullable(),
  role: z.enum(['ADMIN', 'BDE']).default('BDE'),
  password: passwordSchema.optional(),
});

export const updateUserSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  phone: z.string().trim().max(30).optional().nullable(),
  role: z.enum(['ADMIN', 'BDE']).optional(),
});

export const updateUserStatusSchema = z.object({ isActive: z.boolean() });

export const resetUserPasswordSchema = z.object({ password: passwordSchema.optional() });

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().optional(),
  search: z.string().trim().max(190).optional(),
  role: z.enum(['ADMIN', 'BDE']).optional(),
  isActive: z.enum(['true', 'false']).optional(),
});
