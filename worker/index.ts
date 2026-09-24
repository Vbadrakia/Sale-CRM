import { createServer } from 'node:http';
import { httpServerHandler } from 'cloudflare:node';
import { createApp } from '../backend/src/app';
import { runFollowUpReminderJob } from '../backend/src/jobs/followupReminders';
import { assertDatabaseConnection, updateDatabaseConfig } from '../backend/src/config/database';
import { updateRuntimeEnv } from '../backend/src/config/env';
import '../backend/src/models';

export interface Env {
  HYPERDRIVE?: {
    connectionString: string;
  };
  DATABASE_URL?: string;
  JWT_SECRET?: string;
  CORS_ORIGINS?: string;
  FRONTEND_URL?: string;
  ASSETS?: {
    fetch: (req: Request) => Promise<Response>;
  };
  [key: string]: unknown;
}

let httpHandlerInstance: unknown = null;
let isWorkerConfigInitialized = false;

function getCorsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin') || '';
  const allowedOrigins = (env.CORS_ORIGINS as string || '').split(',').map(o => o.trim()).filter(Boolean);
  const frontendUrl = (env.FRONTEND_URL as string) || '';

  const isAllowed =
    !origin ||
    allowedOrigins.includes(origin) ||
    origin === frontendUrl ||
    origin.includes('.workers.dev');

  return {
    'Access-Control-Allow-Origin': isAllowed ? (origin || '*') : allowedOrigins[0] || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Request-ID',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Expose-Headers': 'X-Request-ID',
  };
}

async function initializeWorkerConfig(env: Env): Promise<void> {
  if (!env) return;

  // 1. Synchronize environment bindings (JWT_SECRET, NODE_ENV, etc.)
  updateRuntimeEnv(env as Record<string, unknown>);

  if (isWorkerConfigInitialized) return;

  // 2. Select database connection string
  const connStr = env.HYPERDRIVE?.connectionString || env.DATABASE_URL;
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd && !connStr) {
    throw new Error('FATAL: HYPERDRIVE connection string missing in production Cloudflare Worker environment!');
  }

  if (connStr) {
    updateDatabaseConfig(connStr);
  }

  // 3. Mark config as initialized — DB config is now applied.
  //    Don't block requests on DB health check; let Express handle
  //    per-request DB errors with proper CORS and error formatting.
  isWorkerConfigInitialized = true;

  // Best-effort connectivity verification (non-blocking)
  try {
    await assertDatabaseConnection();
    console.log('[worker-db] Database connection verified');
  } catch (err) {
    // Log but don't throw — Express will handle DB errors per-request
    console.warn('[worker-db] Initial database connection check failed (will retry on queries):', err instanceof Error ? err.message : err);
  }
}

async function getWorkerHttpHandler(env: Env) {
  await initializeWorkerConfig(env);
  if (!httpHandlerInstance) {
    const app = createApp();
    const server = createServer(app);
    server.listen(8080);
    httpHandlerInstance = httpServerHandler({ port: 8080 });
  }
  return httpHandlerInstance as { fetch: (req: Request, env: Env, ctx: ExecutionContext) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
    const url = new URL(request.url);
    const corsHeaders = getCorsHeaders(request, env);

    // Handle CORS preflight at the worker level so it always succeeds
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      await initializeWorkerConfig(env);

      // 1. Route API requests to Express handler initialized with env bindings
      if (url.pathname.startsWith('/api')) {
        const handler = await getWorkerHttpHandler(env);
        try {
          return await handler.fetch(request, env, ctx);
        } catch (handlerErr: unknown) {
          console.error('[Worker Express Handler Error]:', handlerErr);
          const errMsg = handlerErr instanceof Error ? `${handlerErr.message}\n${handlerErr.stack || ''}` : String(handlerErr);
          return new Response(
            JSON.stringify({
              success: false,
              code: 'SERVER_ERROR',
              message: 'Worker Express handler error',
              details: errMsg,
              requestId,
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json', 'x-request-id': requestId, ...corsHeaders },
            },
          );
        }
      }

      // 2. Route static assets and SPA routes to Cloudflare Static Assets
      if (env.ASSETS) {
        return await env.ASSETS.fetch(request);
      }

      return new Response('Not Found', { status: 404 });
    } catch (err: unknown) {
      console.error('[Worker Error]:', err);
      const isProd = process.env.NODE_ENV === 'production';
      const errMsg = err instanceof Error ? err.message : String(err);
      const isDbErr = errMsg.toLowerCase().includes('database') || errMsg.toLowerCase().includes('connection') || errMsg.toLowerCase().includes('hyperdrive');

      return new Response(
        JSON.stringify({
          success: false,
          code: isDbErr ? 'DATABASE_ERROR' : 'SERVER_ERROR',
          message: isDbErr ? 'Database connection unavailable. Please try again.' : 'Internal server error',
          ...(isProd ? {} : { details: errMsg }),
          requestId,
        }),
        {
          status: isDbErr ? 503 : 500,
          headers: { 'Content-Type': 'application/json', 'x-request-id': requestId, ...corsHeaders },
        },
      );
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    await initializeWorkerConfig(event ? env : env);

    try {
      const result = await runFollowUpReminderJob();
      console.log(`[cron] follow-up reminders: ${result.reminders}, overdue: ${result.overdue}`);
    } catch (err) {
      console.error('[cron] follow-up reminders job failed:', err);
    }
  },
};
