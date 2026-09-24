import { Router } from 'express';
import * as controller from '../controllers/lead.controller';
import * as customerController from '../controllers/customer.controller';
import * as importController from '../controllers/import.controller';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, requireAdmin } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validate';
import { spreadsheetUpload } from '../middleware/upload';
import {
  addNoteSchema,
  assignLeadSchema,
  convertLeadSchema,
  createLeadSchema,
  listLeadsQuerySchema,
  updateLeadSchema,
  updateLeadStatusSchema,
} from '../validators/lead.validators';

const router = Router();

router.use(authenticate);

/* imports — admin or BDE. Paths are declared before /:id so they do not collide. */
router.post('/import/preview', spreadsheetUpload, asyncHandler(importController.previewImport));
router.post('/import/confirm', spreadsheetUpload, asyncHandler(importController.confirmImport));
router.get('/import/jobs', asyncHandler(importController.listImportJobs));
router.get('/import/:id', asyncHandler(importController.getImportJob));
router.get('/import/:id/errors', asyncHandler(importController.downloadImportErrors));

router.get('/filters/options', asyncHandler(controller.leadFilterOptions));
router.post('/check-duplicates', asyncHandler(controller.checkLeadDuplicates));

router.get('/', validateQuery(listLeadsQuerySchema), asyncHandler(controller.listLeads));
router.post('/', requireAdmin, validateBody(createLeadSchema), asyncHandler(controller.createLead));

router.get('/:id', asyncHandler(controller.getLead));
router.patch('/:id', validateBody(updateLeadSchema), asyncHandler(controller.updateLead));
router.delete('/:id', requireAdmin, asyncHandler(controller.deleteLead));

router.patch('/:id/status', validateBody(updateLeadStatusSchema), asyncHandler(controller.updateLeadStatus));
router.patch('/:id/assign', requireAdmin, validateBody(assignLeadSchema), asyncHandler(controller.assignLead));
router.post('/:id/notes', validateBody(addNoteSchema), asyncHandler(controller.addLeadNote));
router.get('/:id/activities', asyncHandler(controller.listLeadActivities));
router.post('/:id/convert', validateBody(convertLeadSchema), asyncHandler(customerController.convertLead));

export default router;
