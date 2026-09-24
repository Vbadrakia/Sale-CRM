"use strict";

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CRM_ROOT = path.join(__dirname, '..');
const BACKEND_DIR = path.join(CRM_ROOT, 'backend');
const FRONTEND_DIR = path.join(CRM_ROOT, 'frontend');

function log(message) {
  console.log(`[setup] ${message}`);
}

function error(message) {
  console.error(`[setup] ERROR: ${message}`);
}

function runCommand(command, cwd = CRM_ROOT) {
  try {
    return execSync(command, { stdio: 'pipe', cwd, encoding: 'utf8' });
  } catch (err) {
    error(`Command failed: ${command}\n${err.stdout || ''}\n${err.stderr || ''}`);
    process.exit(1);
  }
}

function checkNodeVersion() {
  log('Checking Node.js version...');
  const version = process.version;
  const majorVersion = parseInt(version.slice(1).split('.')[0]);
  if (majorVersion < 20) {
    error(`Node.js ${majorVersion} is not supported. Node.js 20+ is required.`);
    process.exit(1);
  }
  log(`Node.js ${version} - OK`);
}

function checkNpmVersion() {
  log('Checking npm version...');
  const version = execSync('npm --version', { encoding: 'utf8' }).trim();
  const majorVersion = parseInt(version.split('.')[0]);
  if (majorVersion < 9) {
    error(`npm ${version} is not supported. npm 9+ is recommended.`);
    process.exit(1);
  }
  log(`npm ${version} - OK`);
}

function checkDependencies() {
  log('Checking backend dependencies...');
  const packageJsonPath = path.join(BACKEND_DIR, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  const requiredDeps = ['pg', 'sequelize', 'dotenv'];
  const devDeps = ['tsx', 'typescript'];
  
  for (const dep of requiredDeps) {
    if (!packageJson.dependencies[dep]) {
      error(`Missing required dependency: ${dep}`);
      process.exit(1);
    }
    log(`${dep}: ${packageJson.dependencies[dep]} - OK`);
  }
  
  for (const dep of devDeps) {
    if (!packageJson.devDependencies[dep]) {
      error(`Missing required dev dependency: ${dep}`);
      process.exit(1);
    }
    log(`${dep}: ${packageJson.devDependencies[dep]} - OK`);
  }
}

function checkPostgreSQL() {
  log('Checking PostgreSQL connection...');
  try {
    const result = execSync('pg_isready --version', { encoding: 'utf8' });
    log(`PostgreSQL client ${result.trim()} - OK`);
  } catch (err) {
    log('pg_isready is not in PATH (skipping CLI check; Sequelize/pg will verify DB connection).');
  }
}

function checkEnvFile() {
  log('Checking environment files...');
  const backendEnvPath = path.join(BACKEND_DIR, '.env');
  const backendEnvExamplePath = path.join(BACKEND_DIR, '.env.example');
  const frontendEnvPath = path.join(FRONTEND_DIR, '.env');
  const frontendEnvExamplePath = path.join(FRONTEND_DIR, '.env.example');
  
  if (!fs.existsSync(backendEnvPath)) {
    if (fs.existsSync(backendEnvExamplePath)) {
      log('Creating backend .env from .env.example...');
      fs.copyFileSync(backendEnvExamplePath, backendEnvPath);
    } else {
      error('Backend .env file not found.');
      process.exit(1);
    }
  }
  log('Backend .env file - OK');
  
  if (!fs.existsSync(frontendEnvPath)) {
    if (fs.existsSync(frontendEnvExamplePath)) {
      log('Creating frontend .env from .env.example...');
      fs.copyFileSync(frontendEnvExamplePath, frontendEnvPath);
    } else {
      error('Frontend .env file not found.');
      process.exit(1);
    }
  }
  log('Frontend .env file - OK');

}

function loadEnvVars() {
  log('Loading environment variables...');
  require('dotenv').config({ path: path.join(BACKEND_DIR, '.env') });
  require('dotenv').config({ path: path.join(FRONTEND_DIR, '.env') });
  
  const requiredVars = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'JWT_SECRET'];
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    error(`Missing required environment variables: ${missingVars.join(', ')}`);
    error('Please check your .env files and ensure all required variables are set.');
    process.exit(1);
  }
  
  log('Environment variables loaded successfully.');
}

function createDatabase() {
  log('Database initialization check...');
  log('Sequelize and migrations will manage table creation on PostgreSQL target.');
}

function runMigrations() {
  log('Running database migrations...');
  try {
    runCommand('npm run db:migrate', BACKEND_DIR);
    log('Database migrations completed successfully.');
  } catch (err) {
    error('Database migrations failed.');
    error('Check the error messages above for details.');
    process.exit(1);
  }
}

function runSeeders() {
  log('Running database seeders...');
  try {
    runCommand('npm run db:seed', BACKEND_DIR);
    log('Database seeders completed successfully.');
  } catch (err) {
    error('Database seeders failed.');
    error('Check the error messages above for details.');
    process.exit(1);
  }
}

function printCredentials() {
  log('Setup completed successfully!');
  log('\n=== Local Development Demo Credentials (NON-PRODUCTION ONLY) ===');
  log('Email: admin@crm.local');
  log('Password: Password123');
  log('BDE Accounts: ravi@crm.local, neha@crm.local, sam@crm.local (Password123)');
  log('\nNOTE: Production environments must NEVER use default or demo credentials.');
  log('\n=== URLs ===');
  log('Frontend: http://localhost:5173');
  log('Backend: http://localhost:5000');
  log('\n=== Next Steps ===');
  log('1. Start the backend: npm run dev -w backend');
  log('2. Start the frontend: npm run dev -w frontend');
  log('3. Access the CRM application in your browser');
}

function main() {
  console.log('=== CRM Setup Script ===');
  console.log('This script will set up your CRM project for local development.');
  console.log('');
  
  checkNodeVersion();
  checkNpmVersion();
  checkDependencies();
  checkPostgreSQL();
  checkEnvFile();
  loadEnvVars();
  createDatabase();
  runMigrations();
  runSeeders();
  printCredentials();
}

if (require.main === module) {
  main();
}

module.exports = { main };