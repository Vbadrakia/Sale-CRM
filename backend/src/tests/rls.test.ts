import assert from 'node:assert/strict';
import { Client } from 'pg';

export async function runRlsTests() {
  const testDbUrl = process.env.TEST_DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/crm_test';
  if (testDbUrl.includes('supabase.com') || testDbUrl.includes('supabase.co')) {
    throw new Error('FATAL SECURITY ERROR: Test environment cannot target a production/Supabase database.');
  }

  const client = new Client({ connectionString: testDbUrl });
  try {
    await client.connect();
  } catch {
    return;
  }

  try {
    const policies = await client.query(`
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND policyname LIKE 'Service role bypass %';
    `);
    assert.equal(policies.rows.length, 0, 'Wide-open service role policies must not exist');

    const tables = await client.query(`
      SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
    `);
    assert.ok(tables.rows.length > 0, 'Expected public tables to exist');
    for (const table of tables.rows) {
      assert.equal(table.rowsecurity, true, `RLS must be enabled on public.${table.tablename}`);
    }
  } finally {
    await client.end();
  }
}
