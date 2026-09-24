import { Router } from 'express';
import * as controller from '../controllers/followup.controller';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validate';
import {
  cancelFollowUpSchema,
  completeFollowUpSchema,
  createFollowUpSchema,
  listFollowUpsQuerySchema,
  updateFollowUpSchema,
} from '../validators/followup.validators';

const router = Router();

router.use(authenticate);

router.get('/', validateQuery(listFollowUpsQuerySchema), asyncHandler(controller.listFollowUps));
router.post('/', validateBody(createFollowUpSchema), asyncHandler(controller.createFollowUp));
router.get('/:id', asyncHandler(controller.getFollowUp));
router.patch('/:id', validateBody(updateFollowUpSchema), asyncHandler(controller.updateFollowUp));
router.patch('/:id/complete', validateBody(completeFollowUpSchema), asyncHandler(controller.completeFollowUp));
router.patch('/:id/cancel', validateBody(cancelFollowUpSchema), asyncHandler(controller.cancelFollowUp));

export default router;
