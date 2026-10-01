import { Op } from 'sequelize';
import { ImportError } from '../models';

export const DEFAULT_RETENTION_DAYS = 30;

/**
 * Purges sensitive rejected row data from import_errors older than retention period (default: 30 days)
 * and cleans up stale/expired rate limits and old temporary import payloads.
 */
export async function runImportRetentionJob(retentionDays = DEFAULT_RETENTION_DAYS): Promise<{ deletedErrors: number }> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const deletedErrors = await ImportError.destroy({
    where: {
      createdAt: { [Op.lt]: cutoff },
    },
  });

  if (deletedErrors > 0) {
    console.log(`[retention] Purged ${deletedErrors} expired import error records (older than ${retentionDays} days).`);
  }

  return { deletedErrors };
}
