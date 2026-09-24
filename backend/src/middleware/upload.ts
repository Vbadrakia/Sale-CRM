import path from 'path';
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

/** In-memory storage: nothing is written to disk, so path traversal is impossible. */
export const spreadsheetUpload = multer({
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

export function sanitizeFileName(name: string): string {
  return path.basename(name).replace(/[^\w.\-() ]+/g, '_').slice(0, 200);
}
