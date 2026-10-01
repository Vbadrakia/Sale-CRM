import crypto from 'crypto';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();
if (typeof process !== 'undefined' && process.cwd) {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
  dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });
}

// SHA-256 hashes of known compromised/insecure secrets
const COMPROMISED_SECRET_HASHES = new Set([
  '9be52467d0cf98a287a25039e1bfd8ea1b0f592fc62c2f42a7c4f4a3bc6f01ba', // SHA-256 of previously compromised key
  'a932586cb198607b0b4599d79b0f9c6ee81e372a1cd3ef742f57d685834f8ef0', // SHA-256 of first exposed chat JWT secret
  '723348dbc82f5db7645ed5a735f8093acce5613664136bc84054f710a10efe39', // SHA-256 of second exposed chat JWT secret
  'e64c39f0e1180ee8c460b14421b44b62dbb730ee0f0e8f3a388b14da17637db7', // SHA-256 of dev-only-insecure-secret-change-me-min-32-chars-long
]);

function isCompromisedSecret(secret: string): boolean {
  if (!secret || secret.length < 32) return true;
  const hash = crypto.createHash('sha256').update(secret).digest('hex');
  return COMPROMISED_SECRET_HASHES.has(hash);
}

const isWorkerEnvironment =
  typeof (globalThis as unknown as { WebSocketPair?: unknown }).WebSocketPair !== 'undefined';

let currentJwtSecret: string = process.env.JWT_SECRET || '';

const DEV_FALLBACK_SECRET = 'dev-only-insecure-secret-change-me-min-32-chars-long';

function validateAndGetJwtSecret(): string {
  const mode = process.env.NODE_ENV;
  if (!currentJwtSecret) {
    if (mode === 'development' || mode === 'test') {
      console.warn('[SECURITY WARNING] Using dev fallback JWT_SECRET in non-production mode. Set JWT_SECRET before deploying.');
      return DEV_FALLBACK_SECRET;
    }
    if (isWorkerEnvironment) {
      throw new Error('FATAL SECURITY ERROR: JWT_SECRET secret binding has not been initialized in Worker runtime!');
    }
    throw new Error('FATAL SECURITY ERROR: JWT_SECRET environment variable is missing!');
  }

  if (mode !== 'development' && mode !== 'test' && isCompromisedSecret(currentJwtSecret)) {
    throw new Error('FATAL SECURITY ERROR: Configured JWT_SECRET is compromised or insecure for production use!');
  }

  return currentJwtSecret;
}

const isProduction = (process.env.NODE_ENV || 'development') === 'production';
const defaultDevCors = 'http://localhost:5173,http://localhost:5000,http://127.0.0.1:5173,http://127.0.0.1:5000';
const rawCors = process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || process.env.FRONTEND_URL || (isProduction ? '' : defaultDevCors);

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction,
  port: Number(process.env.PORT || 5000),

  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },

  db: {
    connectionString: process.env.DATABASE_URL || '',
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
    name: process.env.DB_NAME || 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    poolMax: Number(process.env.DB_POOL_MAX || 20),
    poolMin: Number(process.env.DB_POOL_MIN || 5),
    poolIdle: Number(process.env.DB_POOL_IDLE || 10000),
    poolAcquire: Number(process.env.DB_POOL_ACQUIRE || 60000),
  },

  jwt: {
    get secret(): string {
      return validateAndGetJwtSecret();
    },
    set secret(val: string) {
      currentJwtSecret = val;
    },
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.SMTP_FROM || 'CRM <no-reply@example.com>',
  },

  otp: {
    expiresMinutes: Number(process.env.OTP_EXPIRES_MINUTES || 10),
    maxAttempts: Number(process.env.OTP_MAX_ATTEMPTS || 5),
    resendCooldownSeconds: Number(process.env.OTP_RESEND_COOLDOWN_SECONDS || 60),
  },

  passwordReset: {
    expiresMinutes: Number(process.env.PASSWORD_RESET_EXPIRES_MINUTES || 30),
  },

  upload: {
    maxFileSizeMb: Number(process.env.UPLOAD_MAX_FILE_SIZE_MB || 10),
  },

  frontendUrl: process.env.FRONTEND_URL || (isProduction ? '' : 'http://localhost:5173'),
  backendUrl: process.env.BACKEND_URL || (isProduction ? '' : 'http://localhost:5000'),
  corsOrigins: rawCors
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  jobs: {
    enabled: String(process.env.ENABLE_JOBS || 'true') === 'true',
    reminderLeadMinutes: Number(process.env.FOLLOWUP_REMINDER_LEAD_MINUTES || 60),
  },
};

export function updateRuntimeEnv(envBindings: Record<string, unknown>): void {
  if (!envBindings) return;
  if (typeof envBindings.NODE_ENV === 'string' && envBindings.NODE_ENV) {
    env.nodeEnv = envBindings.NODE_ENV;
    env.isProduction = envBindings.NODE_ENV === 'production';
  }
  if (typeof envBindings.DATABASE_URL === 'string' && envBindings.DATABASE_URL) {
    process.env.DATABASE_URL = envBindings.DATABASE_URL;
    env.db.connectionString = envBindings.DATABASE_URL;
  }
  if (typeof envBindings.JWT_SECRET === 'string' && envBindings.JWT_SECRET) {
    env.jwt.secret = envBindings.JWT_SECRET;
  }
  if (typeof envBindings.FRONTEND_URL === 'string' && envBindings.FRONTEND_URL) {
    env.frontendUrl = envBindings.FRONTEND_URL;
  }
  if (typeof envBindings.CORS_ORIGINS === 'string' && envBindings.CORS_ORIGINS) {
    env.corsOrigins = envBindings.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  }
  if (env.isProduction) {
    void env.jwt.secret;
  }
}

if (isProduction && !isWorkerEnvironment && !currentJwtSecret) {
  validateAndGetJwtSecret();
}


