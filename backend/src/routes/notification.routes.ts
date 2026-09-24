import { Router } from 'express';
import * as controller from '../controllers/notification.controller';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', asyncHandler(controller.listNotifications));
router.get('/unread-count', asyncHandler(controller.unreadCount));
router.patch('/read-all', asyncHandler(controller.markAllRead));
router.patch('/:id/read', asyncHandler(controller.markRead));

export default router;
