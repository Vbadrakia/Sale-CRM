import { Response } from 'express';
import { PaginationMeta } from '../types';

export function sendSuccess<T>(res: Response, data: T, message = 'OK', statusCode = 200) {
  return res.status(statusCode).json({ success: true, data, message });
}

export function sendCreated<T>(res: Response, data: T, message = 'Created') {
  return sendSuccess(res, data, message, 201);
}

export function sendPaginated<T>(
  res: Response,
  data: T[],
  pagination: PaginationMeta,
  message = 'OK',
) {
  return res.status(200).json({ success: true, data, pagination, message });
}
