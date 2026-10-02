-- Supabase PostgreSQL Development Seed Data (seed.sql)
-- STRICTLY FOR LOCAL DEVELOPMENT AND TESTING ONLY.
-- DO NOT APPLY TO PRODUCTION DATABASES. Production accounts must be provisioned individually.
--
-- Demo accounts use bcrypt cost 12 hash for 'Password123'
-- IMPORTANT: Verify that demo accounts (admin@crm.local, sam@crm.local) are NEVER deployed to production.

-- Guard: Refuse execution if connected to production without ALLOW_SEED
DO $$
BEGIN
  IF (current_database() ILIKE '%prod%' OR current_setting('crm.production', true) = 'true')
     AND current_setting('crm.allow_seed', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'CRITICAL SECURITY ERROR: Seeding demo data into a production database is prohibited! Set crm.allow_seed = true to override.';
  END IF;
END $$;

INSERT INTO users (first_name, last_name, email, phone, password_hash, role, is_active, email_verified)
VALUES 
('Ava', 'Admin', 'admin@crm.local', '+911234567890', '$2a$12$0PWo7H.mtdsAcXKwcpX7HOMv9WBgtgDrnLY278eAmDnj.Gr50ESJK', 'ADMIN', true, true),
('Sam', 'Okafor', 'sam@crm.local', '+919876543212', '$2a$12$0PWo7H.mtdsAcXKwcpX7HOMv9WBgtgDrnLY278eAmDnj.Gr50ESJK', 'BDE', true, true)
ON CONFLICT (email) DO NOTHING;

-- Sample Leads
INSERT INTO leads (lead_code, company_name, contact_name, designation, phone, email, website, country, state, city, industry, company_size, service_required, lead_source, status, priority, assigned_bde_id, created_by_id)
VALUES
('LD-2026-00001', 'Northwind Logistics', 'Priya Sharma', 'Operations Head', '+919876000001', 'contact1@northwind.example', 'https://www.northwind.example', 'India', 'Maharashtra', 'Mumbai', 'Logistics', '11-50', 'Web Development', 'Website', 'NEW', 'HIGH', 2, 1),
('LD-2026-00002', 'Bluepeak Software', 'Arjun Mehta', 'CTO', '+919876000002', 'contact2@bluepeak.example', 'https://www.bluepeak.example', 'India', 'Karnataka', 'Bengaluru', 'Software', '51-200', 'Cloud Migration', 'LinkedIn', 'CONTACTED', 'MEDIUM', 2, 1),
('LD-2026-00003', 'Crescent Textiles', 'Fatima Khan', 'Procurement Manager', '+919876000003', 'contact3@crescent.example', 'https://www.crescent.example', 'India', 'Gujarat', 'Surat', 'Manufacturing', '200+', 'SEO Retainer', 'Referral', 'QUALIFIED', 'HIGH', 2, 1),
('LD-2026-00004', 'Harbor Foods', 'Daniel Cruz', 'Founder', '+919876000004', 'contact4@harbor.example', 'https://www.harbor.example', 'United States', 'California', 'San Diego', 'Food & Beverage', '1-10', 'Mobile App', 'Cold Call', 'WON', 'MEDIUM', 2, 1)
ON CONFLICT (lead_code) DO NOTHING;

-- Sample Customer from won lead
INSERT INTO customers (customer_code, source_lead_id, company_name, contact_name, designation, phone, email, website, country, state, city, service, assigned_bde_id, notes)
VALUES
('CU-2026-00001', 4, 'Harbor Foods', 'Daniel Cruz', 'Founder', '+919876000004', 'contact4@harbor.example', 'https://www.harbor.example', 'United States', 'California', 'San Diego', 'Mobile App', 2, 'Converted during seeding.')
ON CONFLICT (customer_code) DO NOTHING;
