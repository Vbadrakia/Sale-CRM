import { Sequelize } from 'sequelize';
import pg from 'pg';
import { env } from './env';

const rawDbUrl = (process.env.DATABASE_URL || env.db.connectionString || '')
  .replace('://localhost', '://127.0.0.1')
  .replace('@localhost', '@127.0.0.1');
const dbHost = env.db.host === 'localhost' ? '127.0.0.1' : env.db.host;

const isValidPgUrl = (url?: string): boolean =>
  Boolean(url && (url.startsWith('postgres://') || url.startsWith('postgresql://')));

const dbUrl =
  isValidPgUrl(rawDbUrl)
    ? rawDbUrl
    : `postgres://${encodeURIComponent(env.db.user)}:${encodeURIComponent(env.db.password)}@${dbHost}:${env.db.port}/${env.db.name}`;

const isTestOrSslDisabled =
  process.env.NODE_ENV === 'test' ||
  process.env.DB_SSL === 'false' ||
  (rawDbUrl && (rawDbUrl.includes('localhost') || rawDbUrl.includes('127.0.0.1')));

const isWorkerRuntime =
  typeof (globalThis as unknown as { WebSocketPair?: unknown }).WebSocketPair !== 'undefined' ||
  rawDbUrl.includes('hyperdrive');

const validateWorkerConnection = (client: unknown): boolean => {
  if (!client) return false;
  const c = client as { _ending?: boolean; ended?: boolean; _closed?: boolean; stream?: { destroyed?: boolean; closed?: boolean; writable?: boolean } };
  if (c._ending || c.ended || c._closed) return false;
  if (c.stream) {
    if (c.stream.destroyed || c.stream.closed || c.stream.writable === false) return false;
  }
  return true;
};

function getSslConfig(): false | { require: boolean; rejectUnauthorized: boolean; ca?: string } {
  if (isTestOrSslDisabled) return false;

  const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';
  const caCert = process.env.DB_CA_CERT || process.env.DB_SSL_CA;

  return {
    require: true,
    rejectUnauthorized,
    ...(caCert ? { ca: caCert } : {}),
  };
}

export const sequelize = new Sequelize(dbUrl, {
  dialect: 'postgres',
  dialectModule: pg,
  logging: false,
  define: {
    underscored: true,
  },
  pool: {
    max: isWorkerRuntime ? 10 : (process.env.NODE_ENV === 'test' ? 100 : env.db.poolMax),
    min: isWorkerRuntime ? 0 : env.db.poolMin,
    idle: isWorkerRuntime ? 1000 : env.db.poolIdle,
    acquire: isWorkerRuntime ? 15000 : env.db.poolAcquire,
    evict: 50,
    maxUses: isWorkerRuntime ? 100 : Infinity,
    validate: validateWorkerConnection,
  },
  dialectOptions: {
    connectTimeout: 5000,
    ...(isTestOrSslDisabled || isWorkerRuntime
      ? {}
      : (() => {
          const ssl = getSslConfig();
          return ssl ? { ssl } : {};
        })()),
  },
});


interface ConnectionManagerPool {
  destroyAllNow?: () => Promise<void>;
}

interface ConnectionManagerInternal {
  pool?: ConnectionManagerPool;
  config?: Record<string, unknown>;
}

interface SequelizeHookConfig {
  host?: string;
  connectionString?: string;
  ssl?: unknown;
  dialectOptions?: {
    ssl?: unknown;
  };
}

export async function cleanupDatabasePool(): Promise<void> {
  try {
    const manager = (sequelize as unknown as { connectionManager?: ConnectionManagerInternal }).connectionManager;
    if (manager?.pool?.destroyAllNow) {
      await manager.pool.destroyAllNow();
    }
  } catch (err: unknown) {
    // Suppress pool destruction error on serverless exit
    void err;
  }
}

sequelize.addHook('beforeConnect', (config: unknown) => {
  const connConfig = config as SequelizeHookConfig;
  if (typeof connConfig.connectionString === 'string') {
    connConfig.connectionString = connConfig.connectionString
      .replace('://localhost', '://127.0.0.1')
      .replace('@localhost', '@127.0.0.1');
  }
  if (connConfig.host === 'localhost') {
    connConfig.host = '127.0.0.1';
  }
  const host = connConfig.host || '';
  const isLocal =
    !host ||
    host === '127.0.0.1' ||
    host === 'db' ||
    process.env.NODE_ENV === 'test' ||
    process.env.DB_SSL === 'false';

  if (host.includes('hyperdrive') || isLocal) {
    if (connConfig.dialectOptions) {
      delete connConfig.dialectOptions.ssl;
    }
    delete connConfig.ssl;
  } else {
    if (!connConfig.dialectOptions) connConfig.dialectOptions = {};
    const ssl = getSslConfig();
    if (ssl) {
      connConfig.dialectOptions.ssl = ssl;
    } else {
      delete connConfig.dialectOptions.ssl;
    }
  }
});

export function updateDatabaseConfig(connectionString: string): void {
  if (!connectionString) {
    throw new Error('[worker-db] Cannot initialize database with empty connection string!');
  }

  if (!isValidPgUrl(connectionString)) {
    console.warn('[worker-db] Connection string does not use postgres:// or postgresql:// scheme. Skipping invalid connection string.');
    return;
  }

  const parsed = new URL(connectionString);
  const isHyperdrive = parsed.hostname.includes('hyperdrive');
  const safeHost = parsed.hostname;
  const safePort = parsed.port || '5432';
  const safeDb = parsed.pathname.replace(/^\//, '') || 'postgres';

  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && isWorkerRuntime && (safeHost === 'localhost' || safeHost === '127.0.0.1')) {
    throw new Error(`[worker-db] Production Worker cannot connect to localhost or 127.0.0.1 (host=${safeHost})`);
  }

  if (
    (sequelize.config as unknown as { connectionString?: string }).connectionString === connectionString ||
    sequelize.config.host === parsed.hostname
  ) {
    return;
  }

  const dbConfig: Record<string, unknown> = {
    connectionString,
    url: connectionString,
    host: parsed.hostname,
    port: parseInt(safePort, 10),
    database: safeDb,
    username: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    dialectOptions: {
      connectTimeout: 5000,
      ...(isHyperdrive ? {} : (getSslConfig() ? { ssl: getSslConfig() } : {})),
    },

    pool: {
      max: 10,
      min: 0,
      idle: 1000,
      acquire: 15000,
      evict: 50,
      maxUses: 100,
      validate: validateWorkerConnection,
    },
  };

  Object.assign(sequelize.config, dbConfig);
  const manager = (sequelize as unknown as { connectionManager?: ConnectionManagerInternal & { initPools?: () => void } }).connectionManager;
  if (manager) {
    if (manager.config) {
      Object.assign(manager.config, dbConfig);
    }
    const poolObj = manager.pool as { destroyAllNow?: () => Promise<void> } | undefined;
    if (poolObj?.destroyAllNow) {
      poolObj.destroyAllNow().catch(() => undefined);
    }
    if (typeof manager.initPools === 'function') {
      manager.initPools();
    }
  }
  console.log(`[worker-db] binding=HYPERDRIVE present=${Boolean(connectionString)} connectionString present=true host=${safeHost} port=${safePort} dbSource=${isHyperdrive ? 'hyperdrive' : 'direct'} database=${safeDb}`);
}

export async function diagnoseDatabaseConnection(connectionString: string): Promise<{
  pgClient: boolean;
  sequelizeAuth: boolean;
  userFind: boolean;
  error?: string;
}> {
  const results = { pgClient: false, sequelizeAuth: false, userFind: false, error: undefined as string | undefined };
  try {
    // 1. Direct pg test
    const client = new pg.Client({ connectionString });
    await client.connect();
    const res = await client.query('SELECT 1 as alive');
    results.pgClient = res.rows.length > 0 && res.rows[0].alive === 1;
    await client.end();

    // 2. Sequelize authenticate
    await sequelize.authenticate();
    results.sequelizeAuth = true;

    // 3. User findOne
    const User = sequelize.models.User;
    if (User) {
      await User.findOne();
      results.userFind = true;
    }
  } catch (err: unknown) {
    results.error = err instanceof Error ? err.message : String(err);
  }
  return results;
}

export async function assertDatabaseConnection(): Promise<void> {
  await sequelize.authenticate();
}

