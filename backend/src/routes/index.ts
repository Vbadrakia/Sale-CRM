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

const apiRouter = Router();

// Router-level middleware running on ALL /api/* endpoints
apiRouter.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health & utility endpoints
apiRouter.get('/health', asyncHandler(health));
apiRouter.get('/ping', (_req, res) => { res.json({ success: true, message: 'pong', time: Date.now() }); });
apiRouter.post('/ping', (req, res) => { res.json({ success: true, message: 'pong', echo: req.body }); });

// Module route handlers
apiRouter.use('/auth', authRoutes);
apiRouter.use('/users', userRoutes);
apiRouter.use('/leads', leadRoutes);
apiRouter.use('/followups', followUpRoutes);
apiRouter.use('/customers', customerRoutes);
apiRouter.use('/notifications', notificationRoutes);
apiRouter.use('/dashboard', dashboardRoutes);

export default apiRouter;
