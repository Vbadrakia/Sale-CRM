import { Transaction, UniqueConstraintError } from 'sequelize';
import { Notification } from '../models';
import { NotificationType } from '../types';

export async function createNotification(params: {
  userId: number;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string | null;
  entityId?: number | null;
  /** Supplying a dedupeKey makes creation idempotent across repeated job runs. */
  dedupeKey?: string | null;
  transaction?: Transaction;
}): Promise<Notification | null> {
  try {
    return await Notification.create(
      {
        userId: params.userId,
        type: params.type,
        title: params.title.slice(0, 190),
        message: params.message.slice(0, 500),
        entityType: params.entityType ?? null,
        entityId: params.entityId ?? null,
        dedupeKey: params.dedupeKey ?? null,
      },
      { transaction: params.transaction },
    );
  } catch (error) {
    if (error instanceof UniqueConstraintError) return null; // already notified
    throw error;
  }
}
