import { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';

/**
 * Validates and REPLACES req.body with the parsed result, which also strips
 * unknown keys — protecting against mass assignment.
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return next(result.error);
    req.body = result.data as unknown as Request['body'];
    next();
  };
}

export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) return next(result.error);
    (req as Request & { validatedQuery?: T }).validatedQuery = result.data;
    next();
  };
}

export function getValidatedQuery<T>(req: Request): T {
  return (req as Request & { validatedQuery: T }).validatedQuery;
}
