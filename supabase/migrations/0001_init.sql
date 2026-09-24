-- Supabase (PostgreSQL) Migration: 0001_init.sql
-- Initial CRM Schema with PostgreSQL Enums, Identity Columns, Indexes, Triggers, and RLS
-- Fully idempotent (can be re-run safely without errors if types, tables, or indexes already exist)

-- 1. Create Enums safely
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('ADMIN', 'BDE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE lead_status AS ENUM ('NEW', 'CONTACTED', 'FOLLOW_UP', 'QUALIFIED', 'WON', 'LOST');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE lead_priority AS ENUM ('LOW', 'MEDIUM', 'HIGH');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE followup_status AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE import_job_status AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create Sequences
CREATE SEQUENCE IF NOT EXISTS lead_code_seq;
CREATE SEQUENCE IF NOT EXISTS customer_code_seq;

-- 3. Trigger function for updating updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Create Tables

-- USERS TABLE
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

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- IMPORT JOBS TABLE
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

DROP TRIGGER IF EXISTS update_import_jobs_updated_at ON import_jobs;
CREATE TRIGGER update_import_jobs_updated_at BEFORE UPDATE ON import_jobs
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- LEADS TABLE
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

DROP TRIGGER IF EXISTS update_leads_updated_at ON leads;
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- CUSTOMERS TABLE
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

DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- FOLLOWUPS TABLE
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

DROP TRIGGER IF EXISTS update_followups_updated_at ON followups;
CREATE TRIGGER update_followups_updated_at BEFORE UPDATE ON followups
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ACTIVITIES TABLE
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

DROP TRIGGER IF EXISTS update_activities_updated_at ON activities;
CREATE TRIGGER update_activities_updated_at BEFORE UPDATE ON activities
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- NOTIFICATIONS TABLE
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

DROP TRIGGER IF EXISTS update_notifications_updated_at ON notifications;
CREATE TRIGGER update_notifications_updated_at BEFORE UPDATE ON notifications
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- OTP TOKENS TABLE
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

DROP TRIGGER IF EXISTS update_otp_tokens_updated_at ON otp_tokens;
CREATE TRIGGER update_otp_tokens_updated_at BEFORE UPDATE ON otp_tokens
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- PASSWORD RESET TOKENS TABLE
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

DROP TRIGGER IF EXISTS update_password_reset_tokens_updated_at ON password_reset_tokens;
CREATE TRIGGER update_password_reset_tokens_updated_at BEFORE UPDATE ON password_reset_tokens
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- IMPORT ERRORS TABLE
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

DROP TRIGGER IF EXISTS update_import_errors_updated_at ON import_errors;
CREATE TRIGGER update_import_errors_updated_at BEFORE UPDATE ON import_errors
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. Enable Row Level Security (RLS) & Policies

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_errors ENABLE ROW LEVEL SECURITY;

-- Note: The CRM backend utilizes the Supabase Service Role Key (or direct database connection string via Supavisor pooler)
-- which bypasses RLS automatically. Standard authenticated RLS policies are provided below for reference or direct SDK usage.

DROP POLICY IF EXISTS "Service role bypass users" ON users;
CREATE POLICY "Service role bypass users" ON users FOR ALL USING (true);

DROP POLICY IF EXISTS "Service role bypass import_jobs" ON import_jobs;
CREATE POLICY "Service role bypass import_jobs" ON import_jobs FOR ALL USING (true);

DROP POLICY IF EXISTS "Service role bypass leads" ON leads;
CREATE POLICY "Service role bypass leads" ON leads FOR ALL USING (true);

DROP POLICY IF EXISTS "Service role bypass customers" ON customers;
CREATE POLICY "Service role bypass customers" ON customers FOR ALL USING (true);

DROP POLICY IF EXISTS "Service role bypass followups" ON followups;
CREATE POLICY "Service role bypass followups" ON followups FOR ALL USING (true);

DROP POLICY IF EXISTS "Service role bypass activities" ON activities;
CREATE POLICY "Service role bypass activities" ON activities FOR ALL USING (true);

DROP POLICY IF EXISTS "Service role bypass notifications" ON notifications;
CREATE POLICY "Service role bypass notifications" ON notifications FOR ALL USING (true);

DROP POLICY IF EXISTS "Service role bypass otp_tokens" ON otp_tokens;
CREATE POLICY "Service role bypass otp_tokens" ON otp_tokens FOR ALL USING (true);

DROP POLICY IF EXISTS "Service role bypass password_reset_tokens" ON password_reset_tokens;
CREATE POLICY "Service role bypass password_reset_tokens" ON password_reset_tokens FOR ALL USING (true);

DROP POLICY IF EXISTS "Service role bypass import_errors" ON import_errors;
CREATE POLICY "Service role bypass import_errors" ON import_errors FOR ALL USING (true);
