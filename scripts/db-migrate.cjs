"use strict";

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', 'backend', '.env') });
require('dotenv').config();

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

async function migrate() {
  const config = getDatabaseConfig();
  console.log('[db-migrate] Starting authoritative schema migration (source: supabase/migrations)...');
  const client = new Client(config);

  try {
    await client.connect();
  } catch (connErr) {
    console.error(`[db-migrate] Connection failed: ${connErr.message}`);
    process.exit(1);
  }

  try {
    // 1. Ensure schema_migrations tracker table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Fetch applied migrations
    const { rows } = await client.query('SELECT version FROM schema_migrations ORDER BY version ASC');
    const appliedVersions = new Set(rows.map((r) => r.version));

    // 3. Scan migration files
    const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      throw new Error(`Migrations directory not found at: ${migrationsDir}`);
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    let appliedCount = 0;

    for (const file of files) {
      if (appliedVersions.has(file)) {
        continue;
      }

      console.log(`[db-migrate] Applying ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      const isTransactional = !(sql.includes('ALTER TYPE') && sql.includes('ADD VALUE'));
      if (isTransactional) {
        await client.query('BEGIN');
      }
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        if (isTransactional) {
          await client.query('COMMIT');
        }
        console.log(`[db-migrate] Applied ${file} successfully.`);
        appliedCount++;
      } catch (migrationErr) {
        if (isTransactional) {
          await client.query('ROLLBACK');
        }
        console.error(`[db-migrate] Migration failed in ${file}:`, migrationErr.message);
        throw migrationErr;
      }
    }

    if (appliedCount === 0) {
      console.log(`[db-migrate] Schema up to date. (${files.length} migrations recorded).`);
    } else {
      console.log(`[db-migrate] Successfully applied ${appliedCount} migration(s).`);
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}

if (require.main === module) {
  migrate().catch((err) => {
    console.error('[db-migrate] Migration process exited with error:', err.message);
    process.exit(1);
  });
}

module.exports = { migrate };
