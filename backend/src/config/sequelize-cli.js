// Used by sequelize-cli for migrations. Runtime config lives in src/config/env.ts.
require('dotenv').config();

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const isTestOrLocal =
  process.env.NODE_ENV === 'test' ||
  process.env.DB_SSL === 'false' ||
  (process.env.DATABASE_URL && (process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1'))) ||
  process.env.DB_HOST === 'localhost' ||
  process.env.DB_HOST === '127.0.0.1';

const dialectOptions = isTestOrLocal
  ? {}
  : { ssl: { require: true, rejectUnauthorized: false } };

if (process.env.DATABASE_URL) {
  const base = {
    url: process.env.DATABASE_URL,
    dialect: 'postgres',
    logging: false,
    define: { underscored: true },
    dialectOptions,
  };

  module.exports = {
    development: base,
    test: base,
    production: base,
  };
} else {
  const requiredDbVars = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
  const missingDbVars = requiredDbVars.filter((name) => process.env[name] === undefined);
  if (missingDbVars.length > 0) {
    throw new Error(`[config] Missing required environment variables:\n${missingDbVars.map((name) => `- ${name}`).join('\n')}`);
  }

  const base = {
    username: required('DB_USER'),
    password: process.env.DB_PASSWORD,
    database: required('DB_NAME'),
    host: required('DB_HOST'),
    port: Number(required('DB_PORT')),
    dialect: 'postgres',
    logging: false,
    define: { underscored: true },
    dialectOptions,
  };

  module.exports = {
    development: base,
    test: { ...base, database: (process.env.DB_NAME || 'crm') + '_test' },
    production: base,
  };
}
