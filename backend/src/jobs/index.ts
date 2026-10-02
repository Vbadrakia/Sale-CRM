import cron from 'node-cron';
import { runFollowUpReminderJob } from './followupReminders';
import { runImportRetentionJob } from './importRetention';
import { runRateLimitRetentionJob } from './rateLimitRetention';

let running = false;
let retentionRunning = false;

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

  // Expired rate limits cleanup every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    if (retentionRunning) return;
    retentionRunning = true;
    try {
      await runRateLimitRetentionJob();
    } catch (error) {
      console.error('[jobs] rate limit retention job failed', error);
    } finally {
      retentionRunning = false;
    }
  });

  console.log('[jobs] scheduled background jobs (reminders: 10m, rate-limit retention: 15m)');
}

