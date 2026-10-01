-- Migration: 0002_token_version_idempotency.sql
-- Adds token_version to users table for JWT session revocation
-- Adds idempotency_key to import_jobs table for import confirmation idempotency

ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128);
CREATE INDEX IF NOT EXISTS idx_import_jobs_idempotency_key ON import_jobs(idempotency_key);

-- Sequences for atomic code generation
CREATE SEQUENCE IF NOT EXISTS lead_code_seq;
CREATE SEQUENCE IF NOT EXISTS customer_code_seq;

SELECT setval('lead_code_seq', COALESCE((SELECT MAX(CAST(SUBSTRING(lead_code FROM 9) AS INTEGER)) FROM leads WHERE lead_code LIKE 'LD-%'), 0) + 1, false);
SELECT setval('customer_code_seq', COALESCE((SELECT MAX(CAST(SUBSTRING(customer_code FROM 9) AS INTEGER)) FROM customers WHERE customer_code LIKE 'CU-%'), 0) + 1, false);


