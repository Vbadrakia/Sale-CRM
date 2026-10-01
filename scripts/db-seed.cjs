"use strict";

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', 'backend', '.env') });
require('dotenv').config();

if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_PRODUCTION_SEED) {
  console.error('[db-seed] ERROR: Refusing to seed demo data into a production database.');
  console.error('[db-seed] Demo credentials and mock leads must never be injected into production.');
  process.exit(1);
}

function getDatabaseConfig() {
  const rawUrl = process.env.DATABASE_URL || '';
  if (rawUrl) {
    const isLocal = rawUrl.includes('localhost') || rawUrl.includes('127.0.0.1') || process.env.DB_SSL === 'false';
    const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';
    const ca = process.env.DB_CA_CERT || process.env.DB_SSL_CA;
    return {
      connectionString: rawUrl.replace('://localhost', '://127.0.0.1').replace('@localhost', '@127.0.0.1'),
      ssl: isLocal ? false : { rejectUnauthorized, ...(ca ? { ca } : {}) },
    };
  }

  const host = process.env.DB_HOST === 'localhost' ? '127.0.0.1' : (process.env.DB_HOST || '127.0.0.1');
  const isLocal = host === '127.0.0.1' || host === 'localhost' || process.env.DB_SSL === 'false';
  const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';
  const ca = process.env.DB_CA_CERT || process.env.DB_SSL_CA;

  return {
    host,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'crm',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: isLocal ? false : { rejectUnauthorized, ...(ca ? { ca } : {}) },
  };
}

async function seed() {
  const seedFile = path.join(__dirname, '..', 'supabase', 'seed.sql');
  if (!fs.existsSync(seedFile)) {
    console.error(`[db-seed] Seed file not found at: ${seedFile}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(seedFile, 'utf8');
  const config = getDatabaseConfig();
  console.log('[db-seed] Seeding development database from supabase/seed.sql...');
  const client = new Client(config);

  try {
    await client.connect();
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('[db-seed] Development database seeded successfully.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('[db-seed] Seeding failed:', err.message);
    process.exit(1);
  } finally {
    await client.end().catch(() => undefined);
  }
}

if (require.main === module) {
  seed().catch((err) => {
    console.error('[db-seed] Unhandled error:', err.message);
    process.exit(1);
  });
}

module.exports = { seed };
