import { createApp } from './app';
import { env } from './config/env';
import { assertDatabaseConnection } from './config/database';
import './models';
import { startScheduledJobs } from './jobs';

async function bootstrap() {
  try {
    await assertDatabaseConnection();
    console.log(`[db] connected to ${env.db.host}:${env.db.port}/${env.db.name}`);
  } catch (error) {
    console.error('[db] connection failed', error);
    process.exit(1);
  }

  const app = createApp();
  app.listen(env.port, () => {
    console.log(`[api] listening on port ${env.port} (${env.nodeEnv})`);
  });

  if (env.jobs.enabled) startScheduledJobs();
}

void bootstrap();
