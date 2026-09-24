import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import routes from './routes';
import { env } from './config/env';
import { ApiError } from './utils/ApiError';
import { errorHandler, notFoundHandler } from './middleware/error';
import { apiLimiter } from './middleware/rateLimit';
import { requestIdMiddleware } from './middleware/requestId';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(requestIdMiddleware);

  const isWorker = typeof (globalThis as unknown as { WebSocketPair?: unknown }).WebSocketPair !== 'undefined';
  if (!isWorker) {
    app.use(compression());
  }
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      xContentTypeOptions: true,
      frameguard: { action: 'deny' },
      hidePoweredBy: true,
    }),
  );
  app.use(
    cors({
      origin: (origin, callback) => {
        if (
          !origin ||
          env.corsOrigins.includes(origin) ||
          env.corsOrigins.includes('*') ||
          origin === env.frontendUrl ||
          origin.includes('.workers.dev')
        ) {
          return callback(null, true);
        }
        callback(ApiError.forbidden(`CORS policy does not allow access from origin ${origin}`, 'CORS_NOT_ALLOWED'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-ID'],
      exposedHeaders: ['X-Request-ID'],
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  if (!env.isProduction) app.use(morgan('dev'));

  app.use('/api', apiLimiter, routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
