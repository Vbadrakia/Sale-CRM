-- Supabase PostgreSQL Seed Data (seed.sql)
-- Default demo accounts & initial leads data for Meri CRM

-- Password hash for 'Password123' generated with bcrypt
-- Hash: $2a$12$R.vX/30yEwK9WzQ1zZ0H/e7W1lY1n3rJ1Y1n3rJ1Y1n3rJ1Y1n3rJ (standard bcrypt)

INSERT INTO users (first_name, last_name, email, phone, password_hash, role, is_active, email_verified)
VALUES 
('Ava', 'Admin', 'admin@crm.local', '+911234567890', '$2a$12$zVzdah49fe3VoWNOkKuZV.fnuZbT3XZ5.bshAdsfJNH29wS4XUY/y', 'ADMIN', true, true),
('Ravi', 'Kumar', 'ravi@crm.local', '+919876543210', '$2a$12$zVzdah49fe3VoWNOkKuZV.fnuZbT3XZ5.bshAdsfJNH29wS4XUY/y', 'BDE', true, true),
('Neha', 'Patel', 'neha@crm.local', '+919876543211', '$2a$12$zVzdah49fe3VoWNOkKuZV.fnuZbT3XZ5.bshAdsfJNH29wS4XUY/y', 'BDE', true, true),
('Sam', 'Okafor', 'sam@crm.local', '+919876543212', '$2a$12$zVzdah49fe3VoWNOkKuZV.fnuZbT3XZ5.bshAdsfJNH29wS4XUY/y', 'BDE', true, true)
ON CONFLICT (email) DO NOTHING;

-- Sample Leads
INSERT INTO leads (lead_code, company_name, contact_name, designation, phone, email, website, country, state, city, industry, company_size, service_required, lead_source, status, priority, assigned_bde_id, created_by_id)
VALUES
('LD-2026-00001', 'Northwind Logistics', 'Priya Sharma', 'Operations Head', '+919876000001', 'contact1@northwind.example', 'https://www.northwind.example', 'India', 'Maharashtra', 'Mumbai', 'Logistics', '11-50', 'Web Development', 'Website', 'NEW', 'HIGH', 2, 1),
('LD-2026-00002', 'Bluepeak Software', 'Arjun Mehta', 'CTO', '+919876000002', 'contact2@bluepeak.example', 'https://www.bluepeak.example', 'India', 'Karnataka', 'Bengaluru', 'Software', '51-200', 'Cloud Migration', 'LinkedIn', 'CONTACTED', 'MEDIUM', 3, 1),
('LD-2026-00003', 'Crescent Textiles', 'Fatima Khan', 'Procurement Manager', '+919876000003', 'contact3@crescent.example', 'https://www.crescent.example', 'India', 'Gujarat', 'Surat', 'Manufacturing', '200+', 'SEO Retainer', 'Referral', 'QUALIFIED', 'HIGH', 4, 1),
('LD-2026-00004', 'Harbor Foods', 'Daniel Cruz', 'Founder', '+919876000004', 'contact4@harbor.example', 'https://www.harbor.example', 'United States', 'California', 'San Diego', 'Food & Beverage', '1-10', 'Mobile App', 'Cold Call', 'WON', 'MEDIUM', 2, 1)
ON CONFLICT (lead_code) DO NOTHING;

-- Sample Customer from won lead
INSERT INTO customers (customer_code, source_lead_id, company_name, contact_name, designation, phone, email, website, country, state, city, service, assigned_bde_id, notes)
VALUES
('CU-2026-00001', 4, 'Harbor Foods', 'Daniel Cruz', 'Founder', '+919876000004', 'contact4@harbor.example', 'https://www.harbor.example', 'United States', 'California', 'San Diego', 'Mobile App', 2, 'Converted during seeding.')
ON CONFLICT (customer_code) DO NOTHING;
