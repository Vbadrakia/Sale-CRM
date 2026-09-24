const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const shellCommand = process.platform === 'win32' ? process.env.ComSpec : null;
const children = [];

function start(name, args, color) {
  const command = [npm, ...args].join(' ');
  const child = spawn(shellCommand ?? npm, shellCommand ? ['/d', '/s', '/c', command] : args, { cwd: root, stdio: ['inherit', 'pipe', 'pipe'], shell: false, env: process.env });
  const prefix = `[${name}]`;
  child.stdout.on('data', (chunk) => process.stdout.write(`${color}${prefix}\x1b[0m ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`${color}${prefix}\x1b[0m ${chunk}`));
  child.on('exit', (code, signal) => {
    if (!shuttingDown) {
      console.error(`${prefix} exited (${code ?? signal ?? 'unknown'}).`);
      shutdown(code ?? 1);
    }
  });
  children.push(child);
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 250);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

start('frontend', ['run', 'dev', '-w', 'frontend'], '\x1b[36m');
start('backend', ['run', 'dev', '-w', 'backend'], '\x1b[35m');
