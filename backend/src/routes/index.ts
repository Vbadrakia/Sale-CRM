import { Router } from 'express';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import leadRoutes from './lead.routes';
import followUpRoutes from './followup.routes';
import customerRoutes from './customer.routes';
import notificationRoutes from './notification.routes';
import dashboardRoutes from './dashboard.routes';
import { asyncHandler } from '../utils/asyncHandler';
import { health } from '../controllers/dashboard.controller';
import { authenticate, requireAdmin } from '../middleware/auth';
import {
  getMigrationStatus,
  runMigrations,
} from '../controllers/system.controller';

const apiRouter = Router();

// Health & utility endpoints
apiRouter.get('/health', asyncHandler(health));
apiRouter.get('/ping', (_req, res) => { res.json({ success: true, message: 'pong', time: Date.now() }); });

// System migration endpoints (secured via admin session or timing-safe X-System-Key)
const systemRouter = Router();
systemRouter.use((req, res, next) => {
  const systemKey = req.headers['x-system-key'];
  if (systemKey) {
    return next();
  }
  return authenticate(req, res, () => {
    requireAdmin(req, res, next);
  });
});
systemRouter.get('/migration-status', asyncHandler(getMigrationStatus));
systemRouter.post('/migrate', asyncHandler(runMigrations));
apiRouter.use('/system', systemRouter);

// Module route handlers
apiRouter.use('/auth', authRoutes);
apiRouter.use('/users', userRoutes);
apiRouter.use('/leads', leadRoutes);
apiRouter.use('/followups', followUpRoutes);
apiRouter.use('/customers', customerRoutes);
apiRouter.use('/notifications', notificationRoutes);
apiRouter.use('/dashboard', dashboardRoutes);

export default apiRouter;
