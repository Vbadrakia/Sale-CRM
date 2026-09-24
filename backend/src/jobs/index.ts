import cron from 'node-cron';
import { runFollowUpReminderJob } from './followupReminders';

let running = false;

export function startScheduledJobs() {
  // Every 10 minutes. A simple in-process guard prevents overlapping runs.
  cron.schedule('*/10 * * * *', async () => {
    if (running) return;
    running = true;
    try {
      const result = await runFollowUpReminderJob();
      if (result.reminders || result.overdue) {
        console.log(`[jobs] follow-up notifications: ${result.reminders} reminders, ${result.overdue} overdue`);
      }
    } catch (error) {
      console.error('[jobs] follow-up reminder job failed', error);
    } finally {
      running = false;
    }
  });
  console.log('[jobs] scheduled follow-up reminder job (every 10 minutes)');
}
