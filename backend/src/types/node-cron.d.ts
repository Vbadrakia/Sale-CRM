declare module 'node-cron' {
  export interface ScheduledTask {
    start(): void;
    stop(): void;
  }
  export function schedule(
    expression: string,
    task: () => void | Promise<void>,
    options?: { scheduled?: boolean; timezone?: string },
  ): ScheduledTask;
  export function validate(expression: string): boolean;
  const cron: { schedule: typeof schedule; validate: typeof validate };
  export default cron;
}
