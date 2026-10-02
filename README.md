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
     - **Port 5432 (Session Mode / Direct)**: Direct connection to PostgreSQL. Supports full session state, advisory locks, and persistent prepared statements.
     - **Port 6543 (Transaction Pooler Mode / Supavisor)**: Connections are pooled per transaction. Named prepared statements across transactions and session-level locks are not supported in transaction mode. The backend queries are parameterized without server-side prepared statement caching for full compatibility.
     - Hyperdrive handles connection multiplexing at Cloudflare edge; the Sequelize pool uses `maxUses: Infinity` to prevent premature socket recycling.
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

---

## Production Migration Safety & Port Guidelines

- **Port 5432 (Direct Connection)**: Always run migrations (`npm run db:migrate`) against direct port 5432. Session-level locks, advisory locks (`pg_advisory_lock`), and multi-statement DDL transactions require a direct PostgreSQL session.
- **Port 6543 (Transaction Pooler Mode / Supavisor)**: Do NOT point migration runners to port 6543. Transaction poolers multiplex connections per transaction, causing multi-statement DDL or session state to fail.
- **Testing Migration Aliases**: When upgrading an existing database, test against a copy of your production database first. Check `SELECT version FROM schema_migrations;` before and after migration to confirm legacy entries (`0002_lockdown_rls.sql` or `0002_token_version_idempotency.sql`) are mapped without re-running or creating duplicate rows.

---

## Lead List Query Optimization & EXPLAIN Notes

The lead listing endpoint (`GET /api/leads`) is optimized for large scale datasets:
- **`distinct: false`**: `findAndCountAll` uses `distinct: false` because associations (`assignedBde`, `importer`) are `belongsTo` (N:1) relationships. This avoids PostgreSQL executing an expensive `COUNT(DISTINCT "Lead"."id")` subquery with in-memory hash aggregation, yielding a clean `COUNT(*)` scan.
- **Trigram GIN Indexes**: Migration `0005_trgm_search_indexes.sql` establishes GIN trigram indexes (`gin_trgm_ops`) on `company_name`, `contact_name`, `email`, `phone`, `city`, and `lead_code`.
- **Query Plan (`EXPLAIN ANALYZE`)**: For text searches (`?search=term`), PostgreSQL switches from a sequential scan (`Seq Scan on leads`) to a `Bitmap Index Scan` on the corresponding `idx_leads_*_trgm` index, avoiding full-table scans even with leading wildcard `%term%` filters.
