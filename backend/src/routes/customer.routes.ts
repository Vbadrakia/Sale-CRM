import { Router } from 'express';
import * as controller from '../controllers/customer.controller';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validate';
import {
  createCustomerSchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
} from '../validators/customer.validators';

const router = Router();

router.use(authenticate);

router.get('/', validateQuery(listCustomersQuerySchema), asyncHandler(controller.listCustomers));
router.post('/', validateBody(createCustomerSchema), asyncHandler(controller.convertLead));
router.get('/:id', asyncHandler(controller.getCustomer));
router.patch('/:id', validateBody(updateCustomerSchema), asyncHandler(controller.updateCustomer));

export default router;
