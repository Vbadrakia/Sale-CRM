import { sequelize, withDbRetry } from '../config/database';

/**
 * Purges expired rate limits rows older than 1 hour.
 * Keeps the rate_limits table compact and prevents disk / index bloat.
 */
export async function runRateLimitRetentionJob(): Promise<{ deletedRows: number }> {
  try {
    const [, metadata] = await withDbRetry(() =>
      sequelize.query(
        "DELETE FROM rate_limits WHERE expire_at < NOW() - INTERVAL '1 hour'",
      ),
    );
    const deletedRows = typeof metadata === 'number'
      ? metadata
      : (metadata as { rowCount?: number })?.rowCount ?? 0;

    if (deletedRows > 0) {
      console.log(`[retention] Purged ${deletedRows} expired rate limit records (older than 1 hour).`);
    }

    return { deletedRows };
  } catch (error) {
    console.error('[retention] Failed to purge expired rate limit records:', error);
    return { deletedRows: 0 };
  }
}
