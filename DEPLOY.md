# Production Deployment & Verification Checklist

Follow this operational checklist before, during, and after deploying Sale-CRM to Cloudflare Workers and PostgreSQL (Supabase / Hyperdrive).

---

## 1. Pre-Deployment Database Migrations
> [!IMPORTANT]
> Always execute schema migrations against a **direct database connection** (port `5432`), never via the connection pooler (port `6543`), to support full DDL transactions and advisory locks.

1. Test migrations against a **recent staging copy / snapshot** of the production database first.
2. Confirm the aliasing behavior:
   - For databases with legacy records (`0002_lockdown_rls.sql`, `0002_token_version_idempotency.sql`): verify that `0002a_*` and `0002b_*` are recognized as already applied, do NOT re-run, and insert ZERO duplicate tracking rows into `schema_migrations`.
   - For fresh databases: confirm all migrations apply sequentially and record their canonical names.
3. Run migration command using the direct port:
   ```bash
   DATABASE_URL="postgres://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres" node scripts/db-migrate.cjs
   ```
4. Confirm trigram index creation succeeds using the `extensions` schema:
   ```sql
   SELECT indexname FROM pg_indexes WHERE tablename = 'leads' AND indexname LIKE '%trgm%';
   ```

---

## 2. Secrets & Environment Configuration
Configure all production secrets in Cloudflare Workers using `wrangler secret put`.

```bash
# 1. JWT Secret (Generate cryptographically secure 32+ char key; invalidates older sessions)
wrangler secret put JWT_SECRET

# 2. System Diagnostic Key (Used for authenticated health check /api/system/health and /api/system/migrate)
wrangler secret put SYSTEM_KEY

# 3. Database Root CA Certificate (Required if connecting directly without Hyperdrive)
# Paste contents of Supabase Root CA (Supabase Dashboard -> Database -> SSL)
wrangler secret put DB_CA_CERT

# 4. Production Domain & CORS Allowlist
# Comma-separated allowlist of exact origins
wrangler secret put CORS_ORIGINS
# Example: https://crm.yourdomain.com

# 5. Frontend URL (Used for reset/welcome email links; never trusts Host headers)
wrangler secret put FRONTEND_URL
# Example: https://crm.yourdomain.com

# 6. SMTP Email Credentials
wrangler secret put SMTP_HOST
wrangler secret put SMTP_PORT
wrangler secret put SMTP_USER
wrangler secret put SMTP_PASSWORD
wrangler secret put SMTP_FROM
```

---

## 3. Worker Deployment
Deploy the Cloudflare Worker with bundled Express API and frontend static assets:

```bash
# 1. Build frontend and backend distribution artifacts
npm run build

# 2. Deploy to Cloudflare Workers
wrangler deploy
```

Immediately verify public health:
```bash
curl -i https://<your-worker-subdomain>.workers.dev/api/health
```
**Expected Response:**
- HTTP status: `200 OK`
- JSON payload: `{"success":true,"message":"Healthy","data":{"status":"ok"}}`
- **Sanity check:** Verify NO internal fields (`jwt`, `database`, `env`, `version`, `host`) are leaked in unauthenticated responses.

---

## 4. Production Smoke Tests

### A. Dashboard Overview
- Open browser Network tab and navigate to Dashboard.
- Verify exactly **ONE** call to `/api/dashboard/overview`.
- Query `rate_limits` table in database to confirm **ZERO** write queries were executed by general API routes (handled entirely in-memory).

### B. Immediate Cache Invalidation
- Create a new lead via UI.
- Verify Dashboard counts and Lead table update immediately without waiting for the 30-second TTL.

### C. Rate Limiting & Fail-Secure Fallback
- Make repeated failed login requests (>10 requests in 15 min for the same account).
- Expect HTTP status `429 Too Many Requests` with `Retry-After` header.
- In simulated DB disconnect/timeout: verify login limiter fails securely to in-memory fallback and continues returning `429`, never `500`.

### D. File Import & Zip-Bomb Protection
- Upload an `.xlsx` with an abnormal compression ratio (> 100:1) or excessive dimensions (> 10,000 rows).
- Expect instant HTTP status `400 Bad Request` prior to workbook materialization or memory inflation.

### E. TLS & Connection Safety
- If providing a modified or invalid `DB_CA_CERT`, Worker fails fast with:
  `DB TLS verification failed. Set DB_CA_CERT to your provider's root CA...`
- It must NEVER fallback to `rejectUnauthorized: false` in production.

### F. Secret Validation on Boot
- If `JWT_SECRET` is omitted or shorter than 32 characters in production, Worker boot throws a fatal initialization error and refuses to serve.

---

## 5. Account & Seed Audit
Audit default and demo accounts on the production database:

```bash
DATABASE_URL="postgres://..." node scripts/check-prod-accounts.cjs
```
- Manually remove or disable `admin@crm.local` and any dummy seed users created during staging tests.
- Ensure the production administrator account uses a verified, unique email with a strong password.

---

## 6. Cookie Auth Strategy
Keep `ENABLE_COOKIE_AUTH` and `VITE_USE_COOKIE_AUTH` set to `false` until frontend and backend API share the exact same top-level domain and site.
When enabled:
- Verify session cookie is set with `HttpOnly; Secure; SameSite=Lax; Path=/api`.
- Verify state-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`) require header `X-Requested-With: crm`.

---

## 7. Rate Limits Retention Verification
Check Cloudflare Worker invocation logs for scheduled cron execution:
- Scheduled cron `*/15 * * * *` executes `runRateLimitRetentionJob()`.
- Confirm logs report: `[retention] Purged N expired rate limit records (older than 1 hour).`
- Confirm `rate_limits` table row count remains bounded and flat over continuous operation.
