import cron from 'node-cron';
import { runFollowUpReminderJob } from './followupReminders';
import { runImportRetentionJob } from './importRetention';

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
      await runImportRetentionJob();
    } catch (error) {
      console.error('[jobs] scheduled job failed', error);
    } finally {
      running = false;
    }
  });
  console.log('[jobs] scheduled background jobs (every 10 minutes)');
}

