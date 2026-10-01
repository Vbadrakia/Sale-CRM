import { Request, Response, NextFunction } from 'express';

export function requestTimingMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = performance.now();

  const originalWriteHead = res.writeHead.bind(res);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (res as any).writeHead = function (...args: [statusCode: number, ...rest: unknown[]]) {
    if (!res.headersSent) {
      const duration = (performance.now() - start).toFixed(2);
      res.setHeader('X-Response-Time-ms', duration);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (originalWriteHead as any)(...args);
  };

  res.on('finish', () => {
    const duration = (performance.now() - start).toFixed(2);
    console.log(`[API-TIMING] ${req.method} ${req.originalUrl || req.url} ${res.statusCode} - ${duration}ms (reqId=${req.id || 'N/A'})`);
  });
  next();
}
