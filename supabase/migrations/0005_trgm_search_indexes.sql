-- Migration: 0005_trgm_search_indexes.sql
-- Enable pg_trgm extension for fast ILIKE/trigram searches.
-- On Supabase, extensions reside in the 'extensions' schema.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') THEN
    CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
  ELSE
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
  END IF;
END $$;

-- GIN trigram indexes for listLeads search columns
-- Uses exception blocks to resolve either gin_trgm_ops (public/in search_path)
-- or extensions.gin_trgm_ops (Supabase extensions schema).
DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_leads_company_name_trgm ON leads USING gin (company_name gin_trgm_ops)';
  EXCEPTION WHEN undefined_object THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_leads_company_name_trgm ON leads USING gin (company_name extensions.gin_trgm_ops)';
  END;

  BEGIN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_leads_contact_name_trgm ON leads USING gin (contact_name gin_trgm_ops)';
  EXCEPTION WHEN undefined_object THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_leads_contact_name_trgm ON leads USING gin (contact_name extensions.gin_trgm_ops)';
  END;

  BEGIN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_leads_email_trgm ON leads USING gin (email gin_trgm_ops)';
  EXCEPTION WHEN undefined_object THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_leads_email_trgm ON leads USING gin (email extensions.gin_trgm_ops)';
  END;
END $$;
