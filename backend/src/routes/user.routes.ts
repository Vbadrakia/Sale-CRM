import { Router } from 'express';
import * as controller from '../controllers/user.controller';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, requireAdmin } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validate';
import {
  createUserSchema,
  listUsersQuerySchema,
  resetUserPasswordSchema,
  updateUserSchema,
  updateUserStatusSchema,
} from '../validators/user.validators';

const router = Router();

router.use(authenticate);

// Any signed-in user may read the BDE list for assignment dropdowns.
router.get('/assignable', asyncHandler(controller.listAssignableBdes));

router.use(requireAdmin);
router.get('/', validateQuery(listUsersQuerySchema), asyncHandler(controller.listUsers));
router.post('/', validateBody(createUserSchema), asyncHandler(controller.createUser));
router.get('/:id', asyncHandler(controller.getUser));
router.patch('/:id', validateBody(updateUserSchema), asyncHandler(controller.updateUser));
router.patch('/:id/status', validateBody(updateUserStatusSchema), asyncHandler(controller.updateUserStatus));
router.post('/:id/reset-password', validateBody(resetUserPasswordSchema), asyncHandler(controller.resetUserPassword));

export default router;
