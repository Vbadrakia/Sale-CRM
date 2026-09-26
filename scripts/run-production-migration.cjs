"use strict";

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WORKER_URL = 'https://sale-crm.vedantbadrakia07.workers.dev';

async function main() {
  console.log('====================================================');
  console.log('  SALE-CRM LIVE DATABASE BACKUP & MIGRATION RUNNER  ');
  console.log('====================================================');

  // Step 0: Generate fresh 256-bit cryptographic secret for this deployment
  const secret = crypto.randomBytes(32).toString('hex');
  console.log('[Step 0] Updating Cloudflare Worker JWT_SECRET secret binding...');
  execSync('npx wrangler secret put JWT_SECRET', {
    input: secret,
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: path.join(__dirname, '..'),
  });
  console.log('[Step 0] JWT_SECRET Cloudflare secret binding updated successfully.');
  console.log('[Step 0] Redeploying Worker to propagate secret binding to all edge isolates...');
  execSync('npx wrangler deploy --minify', {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: path.join(__dirname, '..'),
  });
  console.log('[Step 0] Worker redeployed successfully.');

  // Step 1: Pre-migration database backup
  console.log('\n[Step 1] Taking pre-migration database snapshot backup from live database...');
  const backupRes = await fetch(`${WORKER_URL}/api/system/db-backup`, {
    headers: { 'X-Migration-Key': secret },
  });

  if (!backupRes.ok) {
    const errText = await backupRes.text();
    throw new Error(`Failed to take database backup (HTTP ${backupRes.status}): ${errText}`);
  }

  const backupData = await backupRes.json();
  const backupDir = path.join(__dirname, 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const backupFile = path.join(backupDir, `supabase_backup_${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(backupData.data, null, 2), 'utf8');
  console.log(`[Step 1] Database snapshot backup created successfully! Saved to: ${path.basename(backupFile)}`);
  console.log('[Step 1] Table row counts at backup time:');
  for (const [table, count] of Object.entries(backupData.data.counts || {})) {
    console.log(`  - ${table}: ${count} rows`);
  }

  // Step 2: Apply the 4 migrations
  console.log('\n[Step 2] Executing the 4 database migrations against Supabase PostgreSQL...');
  const migRes = await fetch(`${WORKER_URL}/api/system/migrate`, {
    method: 'POST',
    headers: { 'X-Migration-Key': secret },
  });

  if (!migRes.ok) {
    const errText = await migRes.text();
    throw new Error(`Migration execution failed (HTTP ${migRes.status}): ${errText}`);
  }

  const migData = await migRes.json();
  console.log('[Step 2] Migration execution completed:');
  for (const res of migData.data.results || []) {
    console.log(`  - ${res.version}: ${res.status}`);
  }

  // Step 3: Migration verification
  console.log('\n[Step 3] Verifying database schema after migration...');
  const verifyRes = await fetch(`${WORKER_URL}/api/system/migration-status`, {
    headers: { 'X-Migration-Key': secret },
  });

  if (!verifyRes.ok) {
    const errText = await verifyRes.text();
    throw new Error(`Migration verification failed (HTTP ${verifyRes.status}): ${errText}`);
  }

  const verifyData = await verifyRes.json();
  const report = verifyData.data;

  console.log('[Step 3] Verification Report:');
  console.log(`  - schema_migrations count: ${report.schemaMigrations.length}`);
  for (const m of report.schemaMigrations) {
    console.log(`    * ${m.version} (applied: ${m.applied_at})`);
  }
  console.log(`  - rate_limits table exists: ${report.rateLimitsTableExists}`);
  console.log(`  - import_job_status enum values: ${report.importJobStatusEnum.join(', ')}`);
  console.log(`  - token_version column exists: ${report.tokenVersionColumnExists}`);
  console.log(`  - retention index exists: ${report.retentionIndexExists}`);
  console.log(`  - isFullyMigrated: ${report.isFullyMigrated}`);

  if (!report.isFullyMigrated) {
    throw new Error('Database is NOT fully migrated! One or more checks failed.');
  }

  // Step 4: Provision initial CRM users for smoke testing
  console.log('\n[Step 4] Ensuring initial CRM demo/smoke-test users exist...');
  const seedRes = await fetch(`${WORKER_URL}/api/system/seed-users`, {
    method: 'POST',
    headers: { 'X-Migration-Key': secret },
  });

  if (!seedRes.ok) {
    const errText = await seedRes.text();
    console.warn('[Step 4] Warning: user seeding failed:', errText);
  } else {
    const seedData = await seedRes.json();
    console.log('[Step 4] Users verified/provisioned:', seedData.data.createdUsers.join(', '));
  }

  console.log('\n====================================================');
  console.log('  DATABASE BACKUP & MIGRATIONS COMPLETED & VERIFIED ');
  console.log('====================================================');
}

main().catch((err) => {
  console.error('\n[FATAL ERROR] Migration runner failed:', err.message);
  process.exit(1);
});
