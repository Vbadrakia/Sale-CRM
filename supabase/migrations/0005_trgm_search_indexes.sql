-- Migration: 0005_trgm_search_indexes.sql
-- Enable pg_trgm extension for fast ILIKE/trigram searches
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram indexes for listLeads search columns
CREATE INDEX IF NOT EXISTS idx_leads_company_name_trgm ON leads USING gin (company_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_contact_name_trgm ON leads USING gin (contact_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_email_trgm ON leads USING gin (email gin_trgm_ops);
