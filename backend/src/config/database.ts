import { Sequelize } from 'sequelize';
import pg from 'pg';
import { env } from './env';

const isTestEnv = process.env.NODE_ENV === 'test';
const configuredDbUrl = isTestEnv
  ? (process.env.TEST_DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/crm_test')
  : (process.env.DATABASE_URL || env.db.connectionString || '');

if (isTestEnv && (configuredDbUrl.includes('supabase.com') || configuredDbUrl.includes('supabase.co'))) {
  throw new Error('FATAL SECURITY ERROR: Test environment cannot be pointed at a production/Supabase database! Use a local or separate test database.');
}

const rawDbUrl = configuredDbUrl
  .replace('://localhost', '://127.0.0.1')
  .replace('@localhost', '@127.0.0.1');
const dbHost = isTestEnv
  ? (process.env.TEST_DB_HOST || '127.0.0.1')
  : (env.db.host === 'localhost' ? '127.0.0.1' : env.db.host);

const isValidPgUrl = (url?: string): boolean =>
  Boolean(url && (url.startsWith('postgres://') || url.startsWith('postgresql://')));

const dbUrl = isTestEnv
  ? rawDbUrl
  : (isValidPgUrl(rawDbUrl)
      ? rawDbUrl
      : `postgres://${encodeURIComponent(env.db.user)}:${encodeURIComponent(env.db.password)}@${dbHost}:${env.db.port}/${env.db.name}`);

const isTestOrSslDisabled =
  process.env.NODE_ENV === 'test' ||
  process.env.DB_SSL === 'false' ||
  (rawDbUrl && (rawDbUrl.includes('localhost') || rawDbUrl.includes('127.0.0.1')));

const isWorkerRuntime =
  typeof (globalThis as unknown as { WebSocketPair?: unknown }).WebSocketPair !== 'undefined' ||
  rawDbUrl.includes('hyperdrive');

const validateWorkerConnection = (_client: unknown): boolean => {
  if (!_client) return false;
  const c = _client as {
    _ending?: boolean;
    _ended?: boolean;
    _errored?: boolean;
    connection?: {
      stream?: {
        destroyed?: boolean;
        writable?: boolean;
        readable?: boolean;
      };
    };
    stream?: {
      destroyed?: boolean;
      writable?: boolean;
      readable?: boolean;
    };
  };
  if (c._ending || c._ended || c._errored) return false;
  const stream = c.connection?.stream || c.stream;
  if (stream) {
    if (stream.destroyed || stream.writable === false || stream.readable === false) return false;
  }
  // In serverless / worker environments, TCP connections cannot be reused across
  // separate requests after an idle period. Any connection older than 1500ms since
  // last query must be disposed rather than reused across requests.
  if (isWorkerRuntime && typeof c._lastUsedAt === 'number') {
    if (Date.now() - c._lastUsedAt > 1500) {
      return false;
    }
  }
  return true;
};

export function normalizeCaCert(cert?: string): string | undefined {
  if (!cert || typeof cert !== 'string') return undefined;
  const trimmed = cert.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/\\n/g, '\n');
}

export function isTlsVerificationError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string })?.code || '';
  return (
    code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
    code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
    code === 'CERT_HAS_EXPIRED' ||
    /self-signed certificate/i.test(msg) ||
    /certificate chain/i.test(msg) ||
    /unable to verify the first certificate/i.test(msg)
  );
}

export const TLS_ACTIONABLE_ERROR =
  "DB TLS verification failed. Set DB_CA_CERT to your provider's root CA (Supabase: Dashboard -> Database -> SSL). Do NOT disable verification.";

export function getSslConfig(): false | { require: boolean; rejectUnauthorized: boolean; ca?: string } {
  if (isTestOrSslDisabled) return false;

  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false') {
    throw new Error('FATAL SECURITY ERROR: DB_SSL_REJECT_UNAUTHORIZED=false is prohibited in production. Provide DB_CA_CERT instead.');
  }

  const rejectUnauthorized = isProd ? true : process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';
  const caCert = normalizeCaCert(process.env.DB_CA_CERT || process.env.DB_SSL_CA);

  return {
    require: true,
    rejectUnauthorized,
    ...(caCert ? { ca: caCert } : {}),
  };
}

const retryConfig = {
  max: 3,
  match: [
    /SequelizeConnectionError/,
    /SequelizeConnectionRefusedError/,
    /SequelizeHostNotFoundError/,
    /SequelizeHostNotReachableError/,
    /SequelizeInvalidConnectionError/,
    /ConnectionAcquireTimeoutError/,
    /TimeoutError/,
    /Query read timeout/,
    /Connection terminated/,
    /ECONNRESET/,
    /ETIMEDOUT/,
    /socket hang up/,
    /Connection error/,
    /DATABASE_UNAVAILABLE/,
  ],
  backoffBase: 150,
  backoffExponent: 1.5,
};

export const sequelize = new Sequelize(dbUrl, {
  dialect: 'postgres',
  dialectModule: pg,
  logging: false,
  define: {
    underscored: true,
  },
  retry: retryConfig,
  pool: {
    max: isWorkerRuntime ? 10 : (process.env.NODE_ENV === 'test' ? 100 : env.db.poolMax),
    min: 0,
    idle: isWorkerRuntime ? 0 : env.db.poolIdle,
    acquire: isWorkerRuntime ? 15000 : env.db.poolAcquire,
    evict: 0,
    maxUses: isWorkerRuntime ? 1 : Infinity,
    validate: validateWorkerConnection,
  },
  dialectOptions: {
    connectTimeout: 20000,
    statement_timeout: 30000,
    keepalives: true,
    keepalives_idle: 10,
    ...(isTestOrSslDisabled
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

export async function withDbRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastErr = err;
      const errMsg = err instanceof Error ? err.message : String(err);
      if (attempt < maxRetries) {
        console.warn(`[withDbRetry] Attempt ${attempt}/${maxRetries} failed, retrying... Error:`, errMsg);
        await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
      }
    }
  }
  throw lastErr;
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
  const isHyperdriveHost = host.includes('hyperdrive') || (typeof connConfig.connectionString === 'string' && connConfig.connectionString.includes('hyperdrive'));
  const isLocal =
    !host ||
    host === '127.0.0.1' ||
    host === 'db' ||
    isHyperdriveHost ||
    process.env.NODE_ENV === 'test' ||
    process.env.DB_SSL === 'false';

  if (isLocal) {
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

sequelize.addHook('afterConnect', (connection: unknown) => {
  const client = connection as {
    _createdAt?: number;
    _lastUsedAt?: number;
    on?: (event: string, handler: (err: unknown) => void) => void;
  };
  client._createdAt = Date.now();
  client._lastUsedAt = Date.now();
  if (typeof client?.on === 'function') {
    client.on('error', (err: unknown) => {
      console.warn('[worker-db-pg] Connection error caught safely:', err instanceof Error ? err.message : err);
    });
  }
});

sequelize.addHook('beforeQuery', (_options: unknown, query: unknown) => {
  const q = query as { connection?: { _lastUsedAt?: number }; _startTime?: number };
  q._startTime = performance.now();
  if (q.connection) {
    q.connection._lastUsedAt = Date.now();
  }
});

sequelize.addHook('afterQuery', (_options: unknown, query: unknown) => {
  const q = query as { connection?: { _lastUsedAt?: number }; _startTime?: number; sql?: string };
  if (q.connection) {
    q.connection._lastUsedAt = Date.now();
  }
  if (q._startTime) {
    const dbDuration = (performance.now() - q._startTime).toFixed(2);
    if (parseFloat(dbDuration) > 50) {
      console.log(`[DB-QUERY-TIMING] ${dbDuration}ms - SQL: ${q.sql?.substring(0, 120)}...`);
    }
  }
});

export function updateDatabaseConfig(connectionString: string): void {
  if (!connectionString) {
    throw new Error('[worker-db] Cannot initialize database with empty connection string!');
  }
  connectionString = connectionString.trim().replace(/^["']|["']$/g, '');

  if (!isValidPgUrl(connectionString)) {
    console.warn('[worker-db] Connection string does not use postgres:// or postgresql:// scheme. Skipping invalid connection string.');
    return;
  }

  const parsed = new URL(connectionString);
  const isHyperdrive =
    parsed.hostname.includes('hyperdrive') ||
    connectionString.includes('hyperdrive') ||
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname === 'localhost';
  const safeHost = parsed.hostname;
  const safePort = parsed.port || '5432';
  const safeDb = parsed.pathname.replace(/^\//, '') || 'postgres';

  const isProd = process.env.NODE_ENV === 'production';
  // Allow 127.0.0.1 / localhost when Hyperdrive is used in Worker runtime
  if (isProd && isWorkerRuntime && !isHyperdrive && (safeHost === 'localhost' || safeHost === '127.0.0.1')) {
    throw new Error(`[worker-db] Production Worker cannot connect to localhost or 127.0.0.1 directly without Hyperdrive (host=${safeHost})`);
  }

  const dbConfig: Record<string, unknown> = {
    connectionString,
    url: connectionString,
    host: parsed.hostname,
    port: parseInt(safePort, 10),
    database: safeDb,
    username: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    retry: retryConfig,
    dialectOptions: {
      connectTimeout: 20000,
      statement_timeout: 30000,
      keepalives: true,
      keepalives_idle: 10,
      ...(isHyperdrive
        ? {}
        : (() => {
            const ssl = getSslConfig();
            return ssl ? { ssl } : {};
          })()),
    },

    // Pool configuration optimized for Hyperdrive and Supavisor:
    // - Port 5432 (Session mode / direct): Full session state and advisory locks supported.
    // - Port 6543 (Transaction pooler / Supavisor): Connections multiplexed per transaction.
    //   Named prepared statements and cross-transaction session variables are not supported.
    // Hyperdrive itself maintains connection multiplexing; maxUses: Infinity prevents
    // Sequelize from prematurely terminating cached Hyperdrive virtual connections.
    pool: {
      max: 10,
      min: 0,
      idle: 0,
      acquire: 15000,
      evict: 0,
      maxUses: 1,
      validate: validateWorkerConnection,
    },
  };

  Object.assign(sequelize.config, dbConfig);
  const seqAny = sequelize as unknown as { options?: Record<string, unknown>; connectionManager?: ConnectionManagerInternal & { initPools?: () => void } };
  if (seqAny.options) {
    Object.assign(seqAny.options, dbConfig);
    seqAny.options.dialectOptions = Object.assign({}, dbConfig.dialectOptions as object);
  }
  const manager = seqAny.connectionManager;
  if (manager) {
    if (manager.config) {
      Object.assign(manager.config, dbConfig);
      manager.config.dialectOptions = Object.assign({}, dbConfig.dialectOptions as object);
    }
    const poolObj = manager.pool as { destroyAllNow?: () => Promise<void> } | undefined;
    if (poolObj?.destroyAllNow) {
      poolObj.destroyAllNow().catch(() => undefined);
    }
    (manager as unknown as { pool: unknown }).pool = null;
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
    if (isTlsVerificationError(err)) {
      console.error(`[DB TLS ERROR] ${TLS_ACTIONABLE_ERROR}`);
    }
    results.error = err instanceof Error ? err.message : String(err);
  }
  return results;
}

export async function assertDatabaseConnection(): Promise<void> {
  try {
    await sequelize.authenticate();
  } catch (err: unknown) {
    if (isTlsVerificationError(err)) {
      console.error(`[DB TLS ERROR] ${TLS_ACTIONABLE_ERROR}`);
    }
    throw err;
  }
}
