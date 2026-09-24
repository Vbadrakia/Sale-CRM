import { Router } from 'express';
import * as controller from '../controllers/dashboard.controller';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/summary', asyncHandler(controller.summary));
router.get('/leads-by-status', asyncHandler(controller.leadsByStatus));
router.get('/leads-by-source', asyncHandler(controller.leadsBySource));
router.get('/leads-by-bde', asyncHandler(controller.leadsByBde));
router.get('/monthly-trend', asyncHandler(controller.monthlyTrend));
router.get('/conversion', asyncHandler(controller.conversionFunnel));
router.get('/followups', asyncHandler(controller.followUpTrend));

export default router;
