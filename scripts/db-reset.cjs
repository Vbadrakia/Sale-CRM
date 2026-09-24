"use strict";

const { execFileSync } = require('child_process');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', 'backend', '.env') });
require('dotenv').config();

if (process.env.NODE_ENV === 'production') {
  console.error('[db-reset] Refusing to reset a production database.');
  process.exit(1);
}

console.warn('[db-reset] WARNING: this resets development database tables and reapplies migrations and seeds.');

function run(args) {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  if (process.platform === 'win32') {
    execFileSync(process.env.ComSpec, ['/d', '/s', '/c', [npmCommand, ...args].join(' ')], { stdio: 'inherit' });
    return;
  }
  execFileSync(npmCommand, args, { stdio: 'inherit' });
}

run(['run', 'db:migrate', '-w', 'backend']);
run(['run', 'db:seed', '-w', 'backend']);
console.log('[db-reset] Development database reset completed successfully.');