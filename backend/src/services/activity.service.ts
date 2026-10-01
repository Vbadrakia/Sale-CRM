import { Transaction } from 'sequelize';
import { Activity } from '../models';
import { ActivityType } from '../types';

export async function logActivity(params: {
  leadId: number | null;
  userId: number | null;
  activityType: ActivityType;
  description: string;
  metadata?: Record<string, unknown> | null;
  transaction?: Transaction;
}): Promise<Activity> {
  return Activity.create(
    {
      leadId: params.leadId,
      userId: params.userId,
      activityType: params.activityType,
      description: params.description.slice(0, 500),
      metadata: params.metadata ?? null,
    },
    { transaction: params.transaction },
  );
}
