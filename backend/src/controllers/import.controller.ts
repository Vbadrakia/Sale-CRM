import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { ImportError, ImportJob, Lead, User } from '../models';
import { ApiError } from '../utils/ApiError';
import { sendCreated, sendPaginated, sendSuccess } from '../utils/apiResponse';
import { buildPaginationMeta, parsePagination } from '../utils/pagination';
import { currentUser } from '../middleware/auth';
import { sanitizeFileName } from '../middleware/upload';
import { normalizeCompareText, normalizeEmail, normalizeWebsite, phoneCompareKey } from '../utils/normalize';
import {
  IMPORTABLE_FIELDS,
  NormalizedRow,
  markInFileDuplicates,
  normalizeRows,
  parseSpreadsheet,
  suggestMapping,
  toCsv,
} from '../services/import.service';
import { buildExistingLeadsLookupMap, generateLeadCode, leadScopeWhere, withTransaction } from '../services/lead.service';
import { logActivity } from '../services/activity.service';
import { createNotification } from '../services/notification.service';
import { LeadPriority, LeadStatus } from '../types';

/**
 * Step 1 — parse the uploaded file, auto-detect columns and return a preview.
 * Nothing is written to the leads table here.
 */
export async function previewImport(req: Request, res: Response) {
  if (!req.file) throw ApiError.badRequest('Please choose a .csv, .xls or .xlsx file to upload');

  const fileName = sanitizeFileName(req.file.originalname);
  const { headers, rows } = parseSpreadsheet(req.file.buffer, fileName);

  const mappingInput = req.body?.mapping ? safeParseMapping(req.body.mapping) : null;
  const mapping = mappingInput ?? suggestMapping(headers);

  const normalized = normalizeRows(rows, mapping as Record<string, string>);
  const inFileDuplicates = markInFileDuplicates(normalized);

  const user = currentUser(req);
  const lookupMap = await buildExistingLeadsLookupMap(
    normalized.map((r) => r.data),
    leadScopeWhere(user),
  );

  const all = normalized.map((row) => decorateRowFast(row, inFileDuplicates, lookupMap));

  return sendSuccess(res, {
    fileName,
    headers,
    mapping,
    importableFields: IMPORTABLE_FIELDS,
    summary: {
      totalRows: all.length,
      validRows: all.filter((r) => r.state === 'VALID').length,
      invalidRows: all.filter((r) => r.state === 'INVALID').length,
      duplicateRows: all.filter((r) => r.state === 'DUPLICATE').length,
    },
    rows: all.slice(0, 200),
  });
}

function safeParseMapping(value: unknown): Record<string, string> | null {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object') return null;
    const result: Record<string, string> = {};
    for (const [key, field] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof field === 'string' && (IMPORTABLE_FIELDS as readonly string[]).includes(field)) {
        result[key] = field;
      } else {
        result[key] = '';
      }
    }
    return result;
  } catch {
    return null;
  }
}

function decorateRowFast(
  row: NormalizedRow,
  inFileDuplicates: Map<number, string>,
  lookupMap: {
    byEmail: Map<string, { id: number; leadCode: string }>;
    byPhone: Map<string, { id: number; leadCode: string }>;
    byWebsite: Map<string, { id: number; leadCode: string }>;
    byCompanyContact: Map<string, { id: number; leadCode: string }>;
  },
) {
  if (row.errors.length) {
    return { ...row, state: 'INVALID' as const, reason: row.errors.join('; '), existing: null };
  }
  const inFile = inFileDuplicates.get(row.rowNumber);
  if (inFile) return { ...row, state: 'DUPLICATE' as const, reason: inFile, existing: null };

  const emailKey = row.data.email ? normalizeEmail(row.data.email) : null;
  const phoneKey = row.data.phone ? phoneCompareKey(row.data.phone) : null;
  const websiteKey = row.data.website ? normalizeWebsite(row.data.website) : null;
  const companyKey = row.data.companyName ? normalizeCompareText(row.data.companyName) : null;
  const contactKey = row.data.contactName ? normalizeCompareText(row.data.contactName) : null;

  let match: { id: number; leadCode: string } | undefined;
  let reasonStr = '';

  if (emailKey && lookupMap.byEmail.has(emailKey)) {
    match = lookupMap.byEmail.get(emailKey)!;
    reasonStr = 'same email address';
  } else if (phoneKey && lookupMap.byPhone.has(phoneKey)) {
    match = lookupMap.byPhone.get(phoneKey)!;
    reasonStr = 'same phone number';
  } else if (websiteKey && lookupMap.byWebsite.has(websiteKey)) {
    match = lookupMap.byWebsite.get(websiteKey)!;
    reasonStr = 'same website domain';
  } else if (companyKey && contactKey && lookupMap.byCompanyContact.has(`${companyKey}:${contactKey}`)) {
    match = lookupMap.byCompanyContact.get(`${companyKey}:${contactKey}`)!;
    reasonStr = 'same company and contact name';
  }

  if (match) {
    return {
      ...row,
      state: 'DUPLICATE' as const,
      reason: `Matches existing lead ${match.leadCode} (${reasonStr})`,
      existing: match,
    };
  }
  return { ...row, state: 'VALID' as const, reason: null, existing: null };
}

/**
 * Step 2 — re-parse the same file and write only the rows that pass validation.
 * Duplicate behaviour is deterministic: SKIP (default) or IMPORT.
 */
export async function confirmImport(req: Request, res: Response) {
  const user = currentUser(req);
  if (!req.file) throw ApiError.badRequest('Please re-upload the file to confirm the import');

  const fileName = sanitizeFileName(req.file.originalname);
  const mapping = safeParseMapping(req.body?.mapping) ?? null;
  const duplicateStrategy = req.body?.duplicateStrategy === 'IMPORT' ? 'IMPORT' : 'SKIP';
  const assignedBdeIdRaw = req.body?.assignedBdeId;
  const requestedAssignedBdeId = assignedBdeIdRaw ? Number(assignedBdeIdRaw) : null;
  const assignedBdeId = user.role === 'BDE' ? user.id : requestedAssignedBdeId;
  const idempotencyKey = (req.headers['idempotency-key'] as string | undefined) || req.body?.idempotencyKey || null;

  // Idempotency check: if key provided, check for existing execution
  if (idempotencyKey) {
    const existingJob = await ImportJob.findOne({ where: { idempotencyKey, createdById: user.id } });
    if (existingJob) {
      if (existingJob.status === 'COMPLETED' || existingJob.status === 'COMPLETED_WITH_ERRORS') {
        return sendCreated(res, existingJob, `Import finished (idempotent result): ${existingJob.importedRows} leads created`);
      }
      if (existingJob.status === 'PROCESSING') {
        const ageMs = Date.now() - new Date(existingJob.createdAt).getTime();
        if (ageMs < 15 * 60 * 1000) {
          throw ApiError.conflict('An import job with this key is currently being processed');
        }
      }
    }
  }

  // Crash recovery: mark stuck jobs as FAILED
  await ImportJob.update(
    { status: 'FAILED', errorMessage: 'Import processing timed out or server restarted' },
    {
      where: {
        status: 'PROCESSING',
        createdAt: { [Op.lt]: new Date(Date.now() - 15 * 60 * 1000) },
      },
    },
  ).catch(() => undefined);

  if (user.role !== 'BDE' && assignedBdeId) {
    const bde = await User.findOne({ where: { id: assignedBdeId, role: 'BDE', isActive: true } });
    if (!bde) throw ApiError.badRequest('Selected BDE is not a valid active user');
  }

  const { headers, rows } = parseSpreadsheet(req.file.buffer, fileName);
  const effectiveMapping = mapping ?? suggestMapping(headers);
  const normalized = normalizeRows(rows, effectiveMapping as Record<string, string>);
  const inFileDuplicates = markInFileDuplicates(normalized);

  let job: ImportJob;
  try {
    job = await ImportJob.create({
      createdById: user.id,
      fileName,
      status: 'PROCESSING',
      totalRows: normalized.length,
      duplicateStrategy,
      idempotencyKey,
    });
  } catch (err: unknown) {
    if (idempotencyKey && (err as { name?: string }).name === 'SequelizeUniqueConstraintError') {
      const existing = await ImportJob.findOne({ where: { idempotencyKey, createdById: user.id } });
      if (existing) {
        return sendCreated(res, existing, `Import finished (idempotent result): ${existing.importedRows} leads created`);
      }
    }
    throw err;
  }

  // Execute processing asynchronously in background batches
  const processingPromise = processImportJobAsync({
    jobId: job.id,
    fileName,
    normalized,
    inFileDuplicates,
    duplicateStrategy,
    assignedBdeId,
    user,
  });

  // In test environment or if client explicitly requests synchronous processing, await completion
  if (process.env.NODE_ENV === 'test' || req.headers['x-sync-import'] === 'true') {
    await processingPromise;
    await job.reload();
    return sendCreated(res, job, `Import finished: ${job.importedRows} leads created`);
  }

  // Production: Return immediately so HTTP request never times out
  return sendCreated(res, job, 'Import job started. Processing in background.');
}

export async function processImportJobAsync({
  jobId,
  fileName,
  normalized,
  inFileDuplicates,
  duplicateStrategy,
  assignedBdeId,
  user,
}: {
  jobId: number;
  fileName: string;
  normalized: NormalizedRow[];
  inFileDuplicates: Map<number, string>;
  duplicateStrategy: 'SKIP' | 'IMPORT';
  assignedBdeId: number | null;
  user: User;
}): Promise<void> {
  let validRows = 0;
  let invalidRows = 0;
  let duplicateRows = 0;
  let importedRows = 0;
  let skippedRows = 0;
  const failures: { rowNumber: number; reason: string; rowData: Record<string, unknown> }[] = [];

  const job = await ImportJob.findByPk(jobId);
  if (!job) return;

  try {
    const lookupMap = await buildExistingLeadsLookupMap(
      normalized.map((r) => r.data),
      leadScopeWhere(user),
    );

    const decoratedRows = normalized.map((row) => decorateRowFast(row, inFileDuplicates, lookupMap));
    const BATCH_SIZE = 50;

    for (let i = 0; i < decoratedRows.length; i += BATCH_SIZE) {
      // Check for cancellation before processing each batch
      const currentStatus = await ImportJob.findByPk(jobId, { attributes: ['status'] });
      if (currentStatus?.status === 'CANCELLED') {
        console.log(`[import] Job ${jobId} was cancelled by user.`);
        return;
      }

      const batch = decoratedRows.slice(i, i + BATCH_SIZE);

      for (const decorated of batch) {
        if (decorated.state === 'INVALID') {
          invalidRows += 1;
          skippedRows += 1;
          failures.push({ rowNumber: decorated.rowNumber, reason: decorated.reason ?? 'Invalid row', rowData: decorated.raw });
          continue;
        }
        if (decorated.state === 'DUPLICATE') {
          duplicateRows += 1;
          if (duplicateStrategy === 'SKIP') {
            skippedRows += 1;
            failures.push({ rowNumber: decorated.rowNumber, reason: decorated.reason ?? 'Duplicate', rowData: decorated.raw });
            continue;
          }
        } else {
          validRows += 1;
        }

        try {
          await withTransaction(async (transaction) => {
            const created = await Lead.create(
              {
                leadCode: await generateLeadCode(transaction),
                companyName: decorated.data.companyName as string,
                contactName: decorated.data.contactName ?? null,
                designation: decorated.data.designation ?? null,
                phone: decorated.data.phone ?? null,
                alternatePhone: decorated.data.alternatePhone ?? null,
                email: decorated.data.email ?? null,
                alternateEmail: decorated.data.alternateEmail ?? null,
                website: decorated.data.website ?? null,
                country: decorated.data.country ?? null,
                state: decorated.data.state ?? null,
                city: decorated.data.city ?? null,
                industry: decorated.data.industry ?? null,
                companySize: decorated.data.companySize ?? null,
                serviceRequired: decorated.data.serviceRequired ?? null,
                leadSource: decorated.data.leadSource ?? 'Import',
                status: ((decorated.data.status as LeadStatus) || 'NEW') as LeadStatus,
                priority: ((decorated.data.priority as LeadPriority) || 'MEDIUM') as LeadPriority,
                assignedBdeId,
                createdById: user.id,
                importedById: user.id,
                importJobId: job.id,
                tags: decorated.data.tags ?? null,
                remarks: decorated.data.remarks ?? null,
                notes: decorated.data.notes ?? null,
              },
              { transaction },
            );
            await logActivity({
              leadId: created.id,
              userId: user.id,
              activityType: 'LEAD_IMPORTED',
              description: `Imported from ${fileName} (row ${decorated.rowNumber})`,
              metadata: { importJobId: job.id, rowNumber: decorated.rowNumber },
              transaction,
            });
            importedRows += 1;
          });
        } catch (rowError) {
          skippedRows += 1;
          failures.push({
            rowNumber: decorated.rowNumber,
            reason: rowError instanceof Error ? rowError.message.slice(0, 480) : 'Could not save row',
            rowData: decorated.raw,
          });
        }
      }

      // Save incremental progress after each batch
      job.importedRows = importedRows;
      job.skippedRows = skippedRows;
      job.validRows = validRows;
      job.invalidRows = invalidRows;
      job.duplicateRows = duplicateRows;
      await job.save().catch(() => undefined);

      // Yield event loop between batches so workers/servers stay responsive
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    if (failures.length) {
      await ImportError.bulkCreate(
        failures.map((f) => ({ importJobId: job.id, rowNumber: f.rowNumber, reason: f.reason, rowData: f.rowData })),
      );
    }

    job.status = failures.length > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED';
    job.validRows = validRows;
    job.invalidRows = invalidRows;
    job.duplicateRows = duplicateRows;
    job.importedRows = importedRows;
    job.skippedRows = skippedRows;
    await job.save();

    if (assignedBdeId && importedRows > 0) {
      await createNotification({
        userId: assignedBdeId,
        type: 'LEAD_ASSIGNED',
        title: `${importedRows} new leads assigned`,
        message: `${importedRows} leads from "${fileName}" were assigned to you.`,
        entityType: 'import_job',
        entityId: job.id,
      });
    }
  } catch (sysErr) {
    console.error(`[IMPORT] Fatal error during import job ${job.id}:`, sysErr);
    job.status = 'FAILED';
    job.errorMessage = 'Import processing encountered a failure';
    await job.save().catch(() => undefined);
  }
}

export async function cancelImportJob(req: Request, res: Response) {
  const user = currentUser(req);
  const job = await ImportJob.findByPk(Number(req.params.id));
  if (!job || (user.role !== 'ADMIN' && job.createdById !== user.id)) {
    throw ApiError.notFound('Import job not found');
  }

  if (job.status !== 'PENDING' && job.status !== 'PROCESSING') {
    throw ApiError.badRequest(`Cannot cancel an import job with status ${job.status}`);
  }

  job.status = 'CANCELLED';
  await job.save();

  return sendSuccess(res, job, 'Import job cancelled');
}

export async function listImportJobs(req: Request, res: Response) {
  const user = currentUser(req);
  const { page, pageSize, offset } = parsePagination(req.query as Record<string, unknown>);
  const where = user.role === 'ADMIN' ? undefined : { createdById: user.id };
  const { rows, count } = await ImportJob.findAndCountAll({
    where,
    include: [{ model: User, as: 'creator', attributes: ['id', 'firstName', 'lastName', 'email'] }],
    limit: pageSize,
    offset,
    order: [['createdAt', 'DESC']],
    distinct: true,
  });
  return sendPaginated(res, rows, buildPaginationMeta(page, pageSize, count));
}

export async function getImportJob(req: Request, res: Response) {
  const user = currentUser(req);
  const job = await ImportJob.findByPk(Number(req.params.id), {
    include: [{ model: User, as: 'creator', attributes: ['id', 'firstName', 'lastName', 'email'] }],
  });
  if (!job || (user.role !== 'ADMIN' && job.createdById !== user.id)) throw ApiError.notFound('Import job not found');
  const errors = await ImportError.findAll({ where: { importJobId: job.id }, order: [['rowNumber', 'ASC']], limit: 500 });
  return sendSuccess(res, { job, errors });
}

/** Downloadable CSV report of every rejected row and the reason. */
export async function downloadImportErrors(req: Request, res: Response) {
  const user = currentUser(req);
  const job = await ImportJob.findByPk(Number(req.params.id));
  if (!job || (user.role !== 'ADMIN' && job.createdById !== user.id)) throw ApiError.notFound('Import job not found');

  const errors = await ImportError.findAll({ where: { importJobId: job.id }, order: [['rowNumber', 'ASC']] });
  const dataKeys = new Set<string>();
  for (const error of errors) {
    Object.keys((error.rowData as Record<string, unknown>) || {}).forEach((k) => dataKeys.add(k));
  }
  const headers = ['Row', 'Reason', ...Array.from(dataKeys)];
  const csvRows = errors.map((error) => {
    const record: Record<string, string> = { Row: String(error.rowNumber), Reason: error.reason };
    for (const key of dataKeys) {
      record[key] = String(((error.rowData as Record<string, unknown>) || {})[key] ?? '');
    }
    return record;
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="import-${job.id}-errors.csv"`);
  res.send(toCsv(csvRows, headers));
}
