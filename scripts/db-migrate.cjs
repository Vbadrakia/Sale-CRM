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
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';

try {
  run(npmCommand, ['run', 'db:check']);
  run(npxCommand, ['sequelize-cli', 'db:migrate']);
} catch (error) {
  process.exitCode = error.status || 1;
}
