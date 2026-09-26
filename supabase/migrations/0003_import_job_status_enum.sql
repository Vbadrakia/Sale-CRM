-- Migration: 0003_import_job_status_enum.sql
-- Adds COMPLETED_WITH_ERRORS and CANCELLED to import_job_status enum

ALTER TYPE import_job_status ADD VALUE IF NOT EXISTS 'COMPLETED_WITH_ERRORS';
ALTER TYPE import_job_status ADD VALUE IF NOT EXISTS 'CANCELLED';
