import { QueryTypes, Transaction } from 'sequelize';
import { sequelize } from '../config/database';

export interface MigrationResult {
  version: string;
  status: 'already_applied' | 'applied_successfully' | 'failed';
  error?: string;
  appliedAt?: string;
}

export interface VerificationReport {
  schemaMigrations: { version: string; applied_at: string }[];
  rateLimitsTableExists: boolean;
  importJobStatusEnum: string[];
  tokenVersionColumnExists: boolean;
  retentionIndexExists: boolean;
  isFullyMigrated: boolean;
}

export interface DatabaseBackup {
  timestamp: string;
  database: string;
  counts: Record<string, number>;
  data: Record<string, unknown[]>;
}

// 1. Snapshot / Backup function
export async function takeDatabaseBackup(): Promise<DatabaseBackup> {
  const tables = ['users', 'leads', 'customers', 'followups', 'import_jobs', 'import_errors', 'notifications', 'otp_tokens', 'password_reset_tokens'];
  const counts: Record<string, number> = {};
  const data: Record<string, unknown[]> = {};

  for (const table of tables) {
    try {
      const [countRows] = await sequelize.query<{ count: string }>(`SELECT COUNT(*) as count FROM "${table}";`, {
        type: QueryTypes.SELECT,
      });
      counts[table] = countRows ? Number((countRows as unknown as { count: string }).count) : 0;

      // Extract records for verification
      const rows = await sequelize.query(`SELECT * FROM "${table}" LIMIT 1000;`, {
        type: QueryTypes.SELECT,
      });
      data[table] = rows;
    } catch {
      counts[table] = 0;
      data[table] = [];
    }
  }

  return {
    timestamp: new Date().toISOString(),
    database: String(sequelize.config.database || 'postgres'),
    counts,
    data,
  };
}

// 2. Migration definitions
const MIGRATION_0001 = `
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('ADMIN', 'BDE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE lead_status AS ENUM ('NEW', 'CONTACTED', 'FOLLOW_UP', 'QUALIFIED', 'WON', 'LOST');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE lead_priority AS ENUM ('LOW', 'MEDIUM', 'HIGH');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE followup_status AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE import_job_status AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE SEQUENCE IF NOT EXISTS lead_code_seq;
CREATE SEQUENCE IF NOT EXISTS customer_code_seq;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    first_name VARCHAR(80) NOT NULL,
    last_name VARCHAR(80) NOT NULL,
    email VARCHAR(190) NOT NULL UNIQUE,
    phone VARCHAR(30),
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'BDE',
    is_active BOOLEAN NOT NULL DEFAULT true,
    email_verified BOOLEAN NOT NULL DEFAULT false,
    token_version INTEGER NOT NULL DEFAULT 1,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

CREATE TABLE IF NOT EXISTS import_jobs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    created_by_id BIGINT REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
    file_name VARCHAR(255) NOT NULL,
    status import_job_status NOT NULL DEFAULT 'PENDING',
    total_rows INT NOT NULL DEFAULT 0,
    valid_rows INT NOT NULL DEFAULT 0,
    invalid_rows INT NOT NULL DEFAULT 0,
    duplicate_rows INT NOT NULL DEFAULT 0,
    imported_rows INT NOT NULL DEFAULT 0,
    skipped_rows INT NOT NULL DEFAULT 0,
    duplicate_strategy VARCHAR(20) NOT NULL DEFAULT 'SKIP',
    error_message VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_import_jobs_created_by ON import_jobs(created_by_id);
CREATE INDEX IF NOT EXISTS idx_import_jobs_created_at ON import_jobs(created_at);

CREATE TABLE IF NOT EXISTS leads (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    lead_code VARCHAR(24) NOT NULL UNIQUE,
    company_name VARCHAR(190) NOT NULL,
    contact_name VARCHAR(140),
    designation VARCHAR(140),
    phone VARCHAR(30),
    alternate_phone VARCHAR(30),
    email VARCHAR(190),
    alternate_email VARCHAR(190),
    website VARCHAR(190),
    country VARCHAR(90),
    state VARCHAR(90),
    city VARCHAR(90),
    industry VARCHAR(120),
    company_size VARCHAR(60),
    service_required VARCHAR(190),
    lead_source VARCHAR(90),
    status lead_status NOT NULL DEFAULT 'NEW',
    priority lead_priority NOT NULL DEFAULT 'MEDIUM',
    assigned_bde_id BIGINT REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
    created_by_id BIGINT REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
    imported_by_id BIGINT REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
    import_job_id BIGINT REFERENCES import_jobs(id) ON UPDATE CASCADE ON DELETE SET NULL,
    last_contacted_at TIMESTAMPTZ,
    next_follow_up_at TIMESTAMPTZ,
    converted_at TIMESTAMPTZ,
    won_at TIMESTAMPTZ,
    lost_at TIMESTAMPTZ,
    lost_reason VARCHAR(500),
    tags VARCHAR(500),
    notes TEXT,
    remarks TEXT,
    email_key VARCHAR(190),
    phone_key VARCHAR(30),
    website_key VARCHAR(190),
    company_key VARCHAR(190),
    contact_key VARCHAR(140),
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_leads_email_key ON leads(email_key);
CREATE INDEX IF NOT EXISTS idx_leads_phone_key ON leads(phone_key);
CREATE INDEX IF NOT EXISTS idx_leads_website_key ON leads(website_key);
CREATE INDEX IF NOT EXISTS idx_leads_company_contact_key ON leads(company_key, contact_key);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_priority ON leads(priority);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_bde_id ON leads(assigned_bde_id);
CREATE INDEX IF NOT EXISTS idx_leads_lead_source ON leads(lead_source);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);
CREATE INDEX IF NOT EXISTS idx_leads_next_follow_up_at ON leads(next_follow_up_at);
CREATE INDEX IF NOT EXISTS idx_leads_imported_by_id ON leads(imported_by_id);
CREATE INDEX IF NOT EXISTS idx_leads_import_job_id ON leads(import_job_id);

CREATE TABLE IF NOT EXISTS customers (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_code VARCHAR(24) NOT NULL UNIQUE,
    source_lead_id BIGINT UNIQUE REFERENCES leads(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    company_name VARCHAR(190) NOT NULL,
    contact_name VARCHAR(140),
    designation VARCHAR(140),
    phone VARCHAR(30),
    email VARCHAR(190),
    website VARCHAR(190),
    country VARCHAR(90),
    state VARCHAR(90),
    city VARCHAR(90),
    service VARCHAR(190),
    assigned_bde_id BIGINT REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_customers_assigned_bde_id ON customers(assigned_bde_id);
CREATE INDEX IF NOT EXISTS idx_customers_company_name ON customers(company_name);
CREATE INDEX IF NOT EXISTS idx_customers_created_at ON customers(created_at);

CREATE TABLE IF NOT EXISTS followups (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    lead_id BIGINT NOT NULL REFERENCES leads(id) ON UPDATE CASCADE ON DELETE CASCADE,
    created_by_id BIGINT REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
    assigned_to_id BIGINT REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
    title VARCHAR(190) NOT NULL,
    description TEXT,
    due_date DATE NOT NULL,
    due_time VARCHAR(8),
    due_at TIMESTAMPTZ NOT NULL,
    status followup_status NOT NULL DEFAULT 'PENDING',
    outcome TEXT,
    completed_at TIMESTAMPTZ,
    reminder_sent_at TIMESTAMPTZ,
    overdue_notified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_followups_lead_id ON followups(lead_id);
CREATE INDEX IF NOT EXISTS idx_followups_assigned_to_id ON followups(assigned_to_id);
CREATE INDEX IF NOT EXISTS idx_followups_status ON followups(status);
CREATE INDEX IF NOT EXISTS idx_followups_due_at ON followups(due_at);

CREATE TABLE IF NOT EXISTS activities (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    lead_id BIGINT REFERENCES leads(id) ON UPDATE CASCADE ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
    activity_type VARCHAR(40) NOT NULL,
    description VARCHAR(500) NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_activities_lead_id ON activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_activities_user_id ON activities(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at);

CREATE TABLE IF NOT EXISTS notifications (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
    type VARCHAR(40) NOT NULL,
    title VARCHAR(190) NOT NULL,
    message VARCHAR(500) NOT NULL,
    entity_type VARCHAR(40),
    entity_id BIGINT,
    dedupe_key VARCHAR(190) UNIQUE,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_is_read ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

CREATE TABLE IF NOT EXISTS otp_tokens (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
    purpose VARCHAR(30) NOT NULL DEFAULT 'ACCOUNT_VERIFICATION',
    code_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_otp_tokens_user_purpose ON otp_tokens(user_id, purpose);
CREATE INDEX IF NOT EXISTS idx_otp_tokens_expires_at ON otp_tokens(expires_at);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
    token_hash VARCHAR(190) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);

CREATE TABLE IF NOT EXISTS import_errors (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    import_job_id BIGINT NOT NULL REFERENCES import_jobs(id) ON UPDATE CASCADE ON DELETE CASCADE,
    row_number INT NOT NULL,
    reason VARCHAR(500) NOT NULL,
    row_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_import_errors_import_job_id ON import_errors(import_job_id);
`;

const MIGRATION_0002 = `
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128);
CREATE INDEX IF NOT EXISTS idx_import_jobs_idempotency_key ON import_jobs(idempotency_key);

CREATE SEQUENCE IF NOT EXISTS lead_code_seq;
CREATE SEQUENCE IF NOT EXISTS customer_code_seq;

SELECT setval('lead_code_seq', COALESCE((SELECT MAX(CAST(SUBSTRING(lead_code FROM 9) AS INTEGER)) FROM leads WHERE lead_code LIKE 'LD-%'), 0) + 1, false);
SELECT setval('customer_code_seq', COALESCE((SELECT MAX(CAST(SUBSTRING(customer_code FROM 9) AS INTEGER)) FROM customers WHERE customer_code LIKE 'CU-%'), 0) + 1, false);
`;

const MIGRATION_0003 = `ALTER TYPE import_job_status ADD VALUE IF NOT EXISTS 'COMPLETED_WITH_ERRORS';
ALTER TYPE import_job_status ADD VALUE IF NOT EXISTS 'CANCELLED';`;

const MIGRATION_0004 = `
CREATE TABLE IF NOT EXISTS rate_limits (
    key VARCHAR(255) PRIMARY KEY,
    points INT NOT NULL DEFAULT 1,
    expire_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_expire_at ON rate_limits(expire_at);
CREATE INDEX IF NOT EXISTS idx_import_errors_created_at ON import_errors(created_at);
CREATE INDEX IF NOT EXISTS idx_import_jobs_status_created_at ON import_jobs(status, created_at);
`;

export const MIGRATIONS_LIST: { version: string; sql: string }[] = [
  { version: '0001_init.sql', sql: MIGRATION_0001 },
  { version: '0002_token_version_idempotency.sql', sql: MIGRATION_0002 },
  { version: '0003_import_job_status_enum.sql', sql: MIGRATION_0003 },
  { version: '0004_rate_limits_and_retention.sql', sql: MIGRATION_0004 },
];

// 3. Execution function
export async function executeDatabaseMigrations(): Promise<{
  backup: DatabaseBackup;
  results: MigrationResult[];
  verification: VerificationReport;
}> {
  // Step 1: Pre-migration backup
  const backup = await takeDatabaseBackup();

  // Step 2: Ensure schema_migrations exists
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Step 3: Read already applied versions
  const appliedRows = await sequelize.query<{ version: string }>(
    `SELECT version FROM schema_migrations ORDER BY version ASC;`,
    { type: QueryTypes.SELECT }
  );
  const appliedSet = new Set(appliedRows.map((r) => r.version));

  // Step 4: Apply each migration idempotently
  const results: MigrationResult[] = [];

  for (const mig of MIGRATIONS_LIST) {
    if (appliedSet.has(mig.version)) {
      results.push({ version: mig.version, status: 'already_applied' });
      continue;
    }

    try {
      if (mig.version === '0001_init.sql') {
        const [usersTable] = await sequelize.query(
          `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users';`,
          { type: QueryTypes.SELECT }
        );
        if (!usersTable) {
          await sequelize.query(mig.sql);
        }
      } else if (mig.version === '0002_token_version_idempotency.sql') {
        const [tokenCol] = await sequelize.query(
          `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'token_version';`,
          { type: QueryTypes.SELECT }
        );
        if (!tokenCol) {
          await sequelize.query(mig.sql);
        }
      } else if (mig.version === '0003_import_job_status_enum.sql') {
        // In PostgreSQL, ALTER TYPE ... ADD VALUE cannot run inside transaction blocks.
        // Execute each ALTER TYPE as a standalone query.
        await sequelize.query(`ALTER TYPE import_job_status ADD VALUE IF NOT EXISTS 'COMPLETED_WITH_ERRORS';`);
        await sequelize.query(`ALTER TYPE import_job_status ADD VALUE IF NOT EXISTS 'CANCELLED';`);
      } else if (mig.version === '0004_rate_limits_and_retention.sql') {
        const [rateLimitTable] = await sequelize.query(
          `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'rate_limits';`,
          { type: QueryTypes.SELECT }
        );
        if (!rateLimitTable) {
          await sequelize.query(mig.sql);
        }
      } else {
        await sequelize.query(mig.sql);
      }

      await sequelize.query(
        `INSERT INTO schema_migrations (version, applied_at) VALUES (:version, CURRENT_TIMESTAMP) ON CONFLICT (version) DO NOTHING;`,
        { replacements: { version: mig.version } }
      );
      results.push({ version: mig.version, status: 'applied_successfully', appliedAt: new Date().toISOString() });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      results.push({ version: mig.version, status: 'failed', error: errMsg });
      throw new Error(`Migration ${mig.version} failed: ${errMsg}`, { cause: err });
    }
  }

  // Step 5: Verification
  const verification = await verifyDatabaseMigrations();

  return { backup, results, verification };
}

// 4. Verification function
export async function verifyDatabaseMigrations(): Promise<VerificationReport> {
  // 1. schema_migrations
  let schemaMigrations: { version: string; applied_at: string }[];
  try {
    schemaMigrations = await sequelize.query<{ version: string; applied_at: string }>(
      `SELECT version, applied_at FROM schema_migrations ORDER BY version ASC;`,
      { type: QueryTypes.SELECT }
    );
  } catch {
    schemaMigrations = [];
  }

  // 2. rate_limits table
  let rateLimitsTableExists: boolean;
  try {
    const [t] = await sequelize.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'rate_limits';`,
      { type: QueryTypes.SELECT }
    );
    rateLimitsTableExists = Boolean(t);
  } catch {
    rateLimitsTableExists = false;
  }

  // 3. import_job_status enum
  let importJobStatusEnum: string[];
  try {
    const [enumRow] = await sequelize.query<{ vals: string[] }>(
      `SELECT enum_range(NULL::import_job_status) as vals;`,
      { type: QueryTypes.SELECT }
    );
    importJobStatusEnum = enumRow && enumRow.vals ? enumRow.vals : [];
  } catch {
    importJobStatusEnum = [];
  }

  // 4. token_version column on users
  let tokenVersionColumnExists: boolean;
  try {
    const [colRow] = await sequelize.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'token_version';`,
      { type: QueryTypes.SELECT }
    );
    tokenVersionColumnExists = Boolean(colRow);
  } catch {
    tokenVersionColumnExists = false;
  }

  // 5. retention index on import_errors
  let retentionIndexExists: boolean;
  try {
    const [idxRow] = await sequelize.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'import_errors' AND indexname = 'idx_import_errors_created_at';`,
      { type: QueryTypes.SELECT }
    );
    retentionIndexExists = Boolean(idxRow);
  } catch {
    retentionIndexExists = false;
  }

  const expectedMigrations = ['0001_init.sql', '0002_token_version_idempotency.sql', '0003_import_job_status_enum.sql', '0004_rate_limits_and_retention.sql'];
  const appliedVersions = new Set(schemaMigrations.map((m) => m.version));
  const allMigrationsApplied = expectedMigrations.every((v) => appliedVersions.has(v));
  const hasCompletedWithErrors = importJobStatusEnum.includes('COMPLETED_WITH_ERRORS');
  const hasCancelled = importJobStatusEnum.includes('CANCELLED');

  const isFullyMigrated = allMigrationsApplied && rateLimitsTableExists && hasCompletedWithErrors && hasCancelled && tokenVersionColumnExists && retentionIndexExists;

  return {
    schemaMigrations,
    rateLimitsTableExists,
    importJobStatusEnum,
    tokenVersionColumnExists,
    retentionIndexExists,
    isFullyMigrated,
  };
}
