-- Migration: 0003_import_job_status_enum.sql
-- Adds COMPLETED_WITH_ERRORS and CANCELLED to import_job_status enum

DO $$
BEGIN
    ALTER TYPE import_job_status ADD VALUE IF NOT EXISTS 'COMPLETED_WITH_ERRORS';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$
BEGIN
    ALTER TYPE import_job_status ADD VALUE IF NOT EXISTS 'CANCELLED';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
