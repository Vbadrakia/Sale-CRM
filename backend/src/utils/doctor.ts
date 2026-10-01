import 'dotenv/config';
import { env } from '../config/env';
import { runDbCheck } from './db-check';

const REQUIRED = ['pg', 'sequelize', 'tsx', 'dotenv'];

for (const name of REQUIRED) {
  try {
    require.resolve(name);
    console.log(`[doctor] ${name}: OK`);
  } catch {
    console.error(`[doctor] ${name}: MISSING`);
    process.exitCode = 1;
  }
}

if (process.exitCode) {
  console.error('Backend dependency preflight failed. Run npm install from the CRM root.');
  process.exit(1);
} else {
  console.log('Backend dependency preflight passed.');
}

// Check environment variables
console.log('[doctor] Checking environment variables...');
try {
  console.log('[doctor] Environment variables loaded successfully.');
  console.log(`[doctor] Node.js environment: ${env.nodeEnv}`);
  console.log(`[doctor] Backend port: ${env.port}`);
  console.log(`[doctor] Database host: ${env.db.host}`);
  console.log(`[doctor] Database port: ${env.db.port}`);
  console.log(`[doctor] Database name: ${env.db.name}`);
} catch (error) {
  console.error(`[doctor] Environment check failed: ${(error as Error).message}`);
  process.exitCode = 1;
}

async function main(): Promise<void> {
  console.log('[doctor] Checking database connectivity...');
  try {
    await runDbCheck();
    console.log('[doctor] Database connectivity check passed.');
  } catch (error) {
    console.error(`[doctor] Database connectivity check failed: ${(error as Error).message}`);
    process.exitCode = 1;
  }

  if (process.exitCode) {
    console.error('Backend preflight failed. Please fix the issues above.');
    process.exit(1);
  }

  console.log('Backend preflight passed successfully!');
}

void main();
