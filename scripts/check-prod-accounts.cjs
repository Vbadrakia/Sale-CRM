#!/usr/bin/env node
"use strict";

const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', 'backend', '.env') });
require('dotenv').config();

function normalizeCaCert(cert) {
  if (!cert || typeof cert !== 'string') return undefined;
  const trimmed = cert.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/\\n/g, '\n');
}

function getDatabaseConfig() {
  const isProd = process.env.NODE_ENV === 'production';
  const rawUrl = process.env.DATABASE_URL || '';
  if (rawUrl) {
    const isLocal = rawUrl.includes('localhost') || rawUrl.includes('127.0.0.1') || process.env.DB_SSL === 'false';
    const rejectUnauthorized = isProd ? true : process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';
    const ca = normalizeCaCert(process.env.DB_CA_CERT || process.env.DB_SSL_CA);
    return {
      connectionString: rawUrl.replace('://localhost', '://127.0.0.1').replace('@localhost', '@127.0.0.1'),
      ssl: isLocal ? false : { rejectUnauthorized, ...(ca ? { ca } : {}) },
    };
  }

  const host = process.env.DB_HOST === 'localhost' ? '127.0.0.1' : (process.env.DB_HOST || '127.0.0.1');
  const isLocal = host === '127.0.0.1' || host === 'localhost' || process.env.DB_SSL === 'false';
  const rejectUnauthorized = isProd ? true : process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';
  const ca = normalizeCaCert(process.env.DB_CA_CERT || process.env.DB_SSL_CA);

  return {
    host,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'crm',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: isLocal ? false : { rejectUnauthorized, ...(ca ? { ca } : {}) },
  };
}

const DEMO_EMAILS = [
  'admin@crm.local',
  'sam@crm.local',
];

async function main() {
  const shouldDelete = process.argv.includes('--delete') || process.env.DELETE === 'true';
  const config = getDatabaseConfig();
  const client = new Client(config);

  console.log('====================================================');
  console.log('  SALE-CRM PRODUCTION DEMO ACCOUNTS AUDIT & CLEANUP  ');
  console.log('====================================================');

  await client.connect();

  try {
    // 1. Search for demo accounts
    const { rows: demoUsers } = await client.query(
      `SELECT id, first_name, last_name, email, role, is_active, created_at 
       FROM users 
       WHERE email = ANY($1) OR email LIKE '%@crm.local'
       ORDER BY id ASC`,
      [DEMO_EMAILS]
    );

    if (demoUsers.length === 0) {
      console.log('\n[PASS] No demo accounts (admin@crm.local, sam@crm.local, *@crm.local) found in database.');
      return;
    }

    console.log(`\n[WARNING] Found ${demoUsers.length} demo/seed account(s) in this database:`);
    for (const u of demoUsers) {
      console.log(`  - [ID ${u.id}] ${u.email} (${u.first_name} ${u.last_name}, Role: ${u.role}, Active: ${u.is_active}, Created: ${u.created_at})`);
    }

    if (!shouldDelete) {
      console.log('\n--> To remove these accounts and their associated sample records, run:');
      console.log('    node scripts/check-prod-accounts.cjs --delete\n');
      return;
    }

    // 2. Perform deletion
    console.log('\n[ACTION] Deleting demo accounts and dependent mock records...');
    const userIds = demoUsers.map((u) => u.id);

    await client.query('BEGIN');

    // Clean dependent records
    await client.query('DELETE FROM notifications WHERE user_id = ANY($1)', [userIds]);
    await client.query('DELETE FROM activities WHERE user_id = ANY($1)', [userIds]);
    await client.query('DELETE FROM followups WHERE assigned_to_id = ANY($1)', [userIds]);
    await client.query('DELETE FROM leads WHERE assigned_bde_id = ANY($1) OR created_by_id = ANY($1) OR lead_code LIKE \'LD-2026-%\'', [userIds]);
    await client.query('DELETE FROM customers WHERE assigned_bde_id = ANY($1) OR customer_code LIKE \'CU-2026-%\'', [userIds]);
    await client.query('DELETE FROM password_reset_tokens WHERE user_id = ANY($1)', [userIds]);
    await client.query('DELETE FROM otp_tokens WHERE user_id = ANY($1)', [userIds]);

    const { rowCount: deletedUsers } = await client.query(
      'DELETE FROM users WHERE id = ANY($1)',
      [userIds]
    );

    await client.query('COMMIT');
    console.log(`[SUCCESS] Deleted ${deletedUsers} demo account(s) and associated mock records.`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('[ERROR] Audit/cleanup failed:', err.message);
    process.exit(1);
  } finally {
    await client.end().catch(() => undefined);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Process error:', err);
    process.exit(1);
  });
}

module.exports = { main };
