import path from 'path';
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';

const ALLOWED_EXTENSIONS = ['.csv', '.xls', '.xlsx'];
const ALLOWED_MIME_TYPES = [
  'text/csv',
  'application/csv',
  'text/plain',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
];

const multerSingle = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.upload.maxFileSizeMb * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return cb(ApiError.badRequest('Only .csv, .xls and .xlsx files are allowed'));
    }
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(ApiError.badRequest(`Unsupported file type: ${file.mimetype}`));
    }
    cb(null, true);
  },
}).single('file');

/**
 * Handles multipart file upload with in-memory storage and verifies magic byte signatures.
 */
export function spreadsheetUpload(req: Request, res: Response, next: NextFunction): void {
  multerSingle(req, res, (err: unknown) => {
    if (err) return next(err);
    if (!req.file || !req.file.buffer) return next();

    const buffer = req.file.buffer;
    const ext = path.extname(req.file.originalname || '').toLowerCase();

    // Verify magic bytes
    if (ext === '.xlsx') {
      const isZip = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
      if (!isZip) {
        return next(ApiError.badRequest('Invalid .xlsx file format: corrupt or invalid file signature'));
      }
    } else if (ext === '.xls') {
      const isOle = buffer.length >= 8 && buffer[0] === 0xd0 && buffer[1] === 0xcf;
      const isZip = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
      if (!isOle && !isZip) {
        return next(ApiError.badRequest('Invalid .xls file format: corrupt or invalid file signature'));
      }
    } else if (ext === '.csv') {
      const checkLength = Math.min(buffer.length, 1024);
      for (let i = 0; i < checkLength; i++) {
        if (buffer[i] === 0) {
          return next(ApiError.badRequest('Invalid .csv file format: binary null bytes detected'));
        }
      }
    }
    next();
  });
}

export function sanitizeFileName(name: string): string {
  return path.basename(name).replace(/[^\w.\-() ]+/g, '_').slice(0, 200);
}
