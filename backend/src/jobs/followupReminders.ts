import { Op } from 'sequelize';
import { FollowUp, Lead } from '../models';
import { createNotification } from '../services/notification.service';
import { env } from '../config/env';

/**
 * Creates reminder notifications for follow-ups that are approaching, and
 * overdue notifications for those past due. Notifications carry a dedupeKey so
 * repeated runs never produce duplicates.
 */
export async function runFollowUpReminderJob(): Promise<{ reminders: number; overdue: number }> {
  const now = new Date();
  const horizon = new Date(now.getTime() + env.jobs.reminderLeadMinutes * 60_000);

  let reminders = 0;
  let overdue = 0;

  const upcoming = await FollowUp.findAll({
    where: {
      status: 'PENDING',
      reminderSentAt: null,
      dueAt: { [Op.gt]: now, [Op.lte]: horizon },
      assignedToId: { [Op.ne]: null },
    },
    include: [{ model: Lead, as: 'lead', attributes: ['id', 'leadCode', 'companyName'] }],
    limit: 500,
  });

  for (const followUp of upcoming) {
    if (!followUp.assignedToId) continue;
    const lead = (followUp as FollowUp & { lead?: Lead }).lead;
    const created = await createNotification({
      userId: followUp.assignedToId,
      type: 'FOLLOWUP_REMINDER',
      title: 'Follow-up due soon',
      message: `${followUp.title}${lead ? ` — ${lead.companyName} (${lead.leadCode})` : ''} is due at ${followUp.dueAt.toISOString().slice(11, 16)} UTC.`,
      entityType: 'followup',
      entityId: followUp.id,
      dedupeKey: `followup:${followUp.id}:reminder`,
    });
    followUp.reminderSentAt = new Date();
    await followUp.save();
    if (created) reminders += 1;
  }

  const late = await FollowUp.findAll({
    where: {
      status: 'PENDING',
      overdueNotifiedAt: null,
      dueAt: { [Op.lt]: now },
      assignedToId: { [Op.ne]: null },
    },
    include: [{ model: Lead, as: 'lead', attributes: ['id', 'leadCode', 'companyName'] }],
    limit: 500,
  });

  for (const followUp of late) {
    if (!followUp.assignedToId) continue;
    const lead = (followUp as FollowUp & { lead?: Lead }).lead;
    const created = await createNotification({
      userId: followUp.assignedToId,
      type: 'FOLLOWUP_OVERDUE',
      title: 'Follow-up overdue',
      message: `${followUp.title}${lead ? ` — ${lead.companyName} (${lead.leadCode})` : ''} was due on ${followUp.dueDate}.`,
      entityType: 'followup',
      entityId: followUp.id,
      dedupeKey: `followup:${followUp.id}:overdue`,
    });
    followUp.overdueNotifiedAt = new Date();
    await followUp.save();
    if (created) overdue += 1;
  }

  return { reminders, overdue };
}
