import { sequelize } from '../config/database';
import { env } from '../config/env';

export async function checkDatabaseConnection(): Promise<{ success: boolean; message: string }> {
  try {
    await sequelize.authenticate();
    return {
      success: true,
      message: `[db-check] Connected successfully to PostgreSQL database.`
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `[db-check] ERROR: Database connection failed:\n${errorMessage}\nCheck your DATABASE_URL or SUPABASE_URL in .env`
    };
  }
}

export async function runDbCheck(): Promise<void> {
  console.log('[db-check] Database connectivity check...');
  if (env.supabase.url) {
    console.log(`[db-check] Supabase URL: ${env.supabase.url}`);
  }
  
  const connectionResult = await checkDatabaseConnection();
  console.log(connectionResult.message);
  
  if (!connectionResult.success) {
    process.exit(1);
  }
  
  console.log('[db-check] All database checks passed!');
}

if (require.main === module) {
  runDbCheck()
    .then(async () => {
      await sequelize.close();
      process.exit(0);
    })
    .catch(async (error) => {
      console.error(`[db-check] ERROR: ${error instanceof Error ? error.message : String(error)}`);
      await sequelize.close().catch(() => {});
      process.exit(1);
    });
}