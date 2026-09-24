-- Migration: 0004_rate_limits_and_retention.sql
-- 1. Distributed rate limiting table
CREATE TABLE IF NOT EXISTS rate_limits (
    key VARCHAR(255) PRIMARY KEY,
    points INT NOT NULL DEFAULT 1,
    expire_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_expire_at ON rate_limits(expire_at);

-- 2. Index for import error data retention cleanup
CREATE INDEX IF NOT EXISTS idx_import_errors_created_at ON import_errors(created_at);
CREATE INDEX IF NOT EXISTS idx_import_jobs_status_created_at ON import_jobs(status, created_at);
