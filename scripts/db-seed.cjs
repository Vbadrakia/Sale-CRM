"use strict";

const { execFileSync } = require('child_process');

function run(command, args) {
  if (process.platform === 'win32') {
    execFileSync(process.env.ComSpec, ['/d', '/s', '/c', [command, ...args].join(' ')], { stdio: 'inherit' });
    return;
  }
  execFileSync(command, args, { stdio: 'inherit' });
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const tsxCommand = process.platform === 'win32' ? 'tsx.cmd' : 'tsx';

try {
  run(npmCommand, ['run', 'db:check']);
  run(tsxCommand, ['src/seeders/seed.ts']);
} catch (error) {
  process.exitCode = error.status || 1;
}
