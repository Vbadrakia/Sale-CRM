import { NextFunction, Request, Response } from 'express';
import { BaseError, UniqueConstraintError, ValidationError } from 'sequelize';
import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError';
import { env } from '../config/env';

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    code: 'RESOURCE_NOT_FOUND',
    message: `Route not found: ${req.method} ${req.path}`,
    errors: [],
    requestId: req.id,
  });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  let statusCode = 500;
  let code = 'SERVER_ERROR';
  let message = 'Something went wrong';
  let errors: { field?: string; message: string }[] = [];

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    code = err.code || 'SERVER_ERROR';
    message = err.message;
    errors = err.errors;
  } else if (err instanceof ZodError) {
    statusCode = 422;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    errors = err.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message }));
  } else if (err instanceof UniqueConstraintError) {
    statusCode = 409;
    code = 'CONFLICT';
    message = 'A record with these details already exists';
    errors = err.errors.map((e) => ({ field: e.path ?? undefined, message: e.message }));
  } else if (err instanceof ValidationError) {
    statusCode = 422;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    errors = err.errors.map((e) => ({ field: e.path ?? undefined, message: e.message }));
  } else if (err instanceof BaseError) {
    statusCode = 500;
    code = 'DATABASE_ERROR';
    message = 'Database error';
  } else if (err instanceof Error && 'type' in err && (err as { type?: string }).type === 'entity.too.large') {
    statusCode = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request payload is too large';
  } else if (err instanceof Error && 'type' in err && (err as { type?: string }).type === 'entity.parse.failed') {
    statusCode = 400;
    code = 'BAD_REQUEST';
    message = 'Request body must contain valid JSON';
  }

  if (statusCode >= 500) {
    console.error(`[SERVER_ERROR] [reqId=${req.id || 'none'}] status=${statusCode} code=${code}`, err);
  }

  // In production, never leak internal error details, SQL, paths, or stacks
  if (env.isProduction) {
    if (statusCode >= 500) {
      if (code === 'DATABASE_ERROR' || code === 'DATABASE_UNAVAILABLE') {
        message = 'Database service temporarily unavailable';
      } else {
        message = 'Internal server error';
      }
    } else if (/([A-Za-z]:\\|\/home\/|\/app\/|SELECT |INSERT |UPDATE |DELETE |FROM |password|secret)/i.test(message)) {
      message = 'Invalid request';
    }
  }

  const body: Record<string, unknown> = {
    success: false,
    code,
    message,
    errors,
    requestId: req.id,
  };

  if (!env.isProduction && err instanceof Error) {
    body.stack = err.stack;
  }

  res.status(statusCode).json(body);
}
