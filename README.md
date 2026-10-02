# Sale-CRM Production & Deployment Guide

## Database TLS Verification & Certificates

Sale-CRM enforces strict TLS verification (`rejectUnauthorized: true`) on all PostgreSQL connections by default.

### Supabase & Custom CA Configuration
Supabase direct and pooler endpoints require their root CA certificate to verify TLS connections without certificate verification failures ("self-signed certificate in certificate chain").

- **`DB_CA_CERT`**: Supply your provider's root CA certificate as a PEM string (Supabase: **Project Settings -> Database -> SSL Certificate**). Supports newlines escaped as `\n` for single-line environment variables and Cloudflare Worker secret bindings.
- **`DB_SSL_CA`**: Supported alias for `DB_CA_CERT`.
- **`DB_SSL_REJECT_UNAUTHORIZED`**: **DEVELOPMENT ONLY** (`true` / `false`).
  - In production (`NODE_ENV=production`), setting `DB_SSL_REJECT_UNAUTHORIZED=false` is strictly prohibited and immediately halts the application with a startup error.
  - Never disable TLS verification in production. Always supply `DB_CA_CERT`.

If TLS verification fails at startup, health check, or migration, the system logs:
```
[DB TLS ERROR] DB TLS verification failed. Set DB_CA_CERT to your provider's root CA (Supabase: Dashboard -> Database -> SSL). Do NOT disable verification.
```

---

## Deploying to Cloudflare Workers

`wrangler.toml` contains only non-sensitive configuration and bindings. Secrets and sensitive environment variables must be managed via `wrangler secret put`.

### Deploy Checklist & Secret Bindings

1. **JWT Secret (Cryptographically secure, >= 32 characters)**:
   ```bash
   # Generate a 256-bit random hex secret
   openssl rand -hex 32
   npx wrangler secret put JWT_SECRET
   ```

2. **System Secret Key (For internal /system migration endpoints, >= 32 characters)**:
   ```bash
   openssl rand -hex 32
   npx wrangler secret put SYSTEM_KEY
   ```

3. **Database Connection (Hyperdrive or Direct)**:
   - For Hyperdrive: bind in `wrangler.toml` under `[[hyperdrive]]`.
   - For Direct connection string:
     ```bash
     npx wrangler secret put DATABASE_URL
     ```
   - If connecting directly to Supabase without Hyperdrive:
     ```bash
     npx wrangler secret put DB_CA_CERT
     ```

4. **CORS & Frontend URLs**:
   ```bash
   npx wrangler secret put CORS_ORIGINS
   npx wrangler secret put FRONTEND_URL
   ```

5. **SMTP Configuration (If transactional emails enabled)**:
   ```bash
   npx wrangler secret put SMTP_HOST
   npx wrangler secret put SMTP_USER
   npx wrangler secret put SMTP_PASSWORD
   ```

6. **Deploy**:
   ```bash
   npm run deploy
   ```

---

## Seed Data Safety & Demo Account Audit

Development seed data (`supabase/seed.sql`) contains initial demo credentials (`admin@crm.local`, `sam@crm.local`) and sample leads.

- `scripts/db-seed.cjs` strictly refuses to run if `NODE_ENV=production` or if the target database host is not local/staging, requiring an explicit `ALLOW_SEED=true` override.
- Never run seed scripts against live production environments.

### Auditing & Removing Demo Accounts in Production

To check whether demo accounts or mock seed records exist in your database:

```bash
# Check for demo accounts (Read-only check)
node scripts/check-prod-accounts.cjs

# Remove demo accounts and sample seed records
node scripts/check-prod-accounts.cjs --delete
```

#### SQL Snippet for Manual Verification / Deletion:

```sql
-- 1. Check for demo accounts
SELECT id, email, role, is_active, created_at 
FROM users 
WHERE email IN ('admin@crm.local', 'sam@crm.local') OR email LIKE '%@crm.local';

-- 2. Delete demo accounts and associated mock data
BEGIN;
DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE email IN ('admin@crm.local', 'sam@crm.local') OR email LIKE '%@crm.local');
DELETE FROM activities WHERE user_id IN (SELECT id FROM users WHERE email IN ('admin@crm.local', 'sam@crm.local') OR email LIKE '%@crm.local');
DELETE FROM followups WHERE assigned_to_id IN (SELECT id FROM users WHERE email IN ('admin@crm.local', 'sam@crm.local') OR email LIKE '%@crm.local');
DELETE FROM leads WHERE lead_code LIKE 'LD-2026-%' OR assigned_bde_id IN (SELECT id FROM users WHERE email IN ('admin@crm.local', 'sam@crm.local') OR email LIKE '%@crm.local');
DELETE FROM customers WHERE customer_code LIKE 'CU-2026-%' OR assigned_bde_id IN (SELECT id FROM users WHERE email IN ('admin@crm.local', 'sam@crm.local') OR email LIKE '%@crm.local');
DELETE FROM users WHERE email IN ('admin@crm.local', 'sam@crm.local') OR email LIKE '%@crm.local';
COMMIT;
```
