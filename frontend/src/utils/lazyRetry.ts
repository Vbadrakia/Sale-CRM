import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * Wraps dynamic imports with an automatic retry attempt before giving up.
 * Helps prevent transient chunk-fetch failures from breaking the app.
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  importer: () => Promise<{ default: T }>,
  retries = 2,
  intervalMs = 1000,
): LazyExoticComponent<T> {
  return lazy(() =>
    new Promise<{ default: T }>((resolve, reject) => {
      function attempt(remaining: number) {
        importer()
          .then(resolve)
          .catch((err: unknown) => {
            if (remaining <= 0) {
              reject(err);
              return;
            }
            setTimeout(() => {
              attempt(remaining - 1);
            }, intervalMs);
          });
      }
      attempt(retries);
    }),
  );
}
