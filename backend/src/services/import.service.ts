import * as XLSX from 'xlsx';
import { ApiError } from '../utils/ApiError';
import { isValidEmail, isValidPhone, normalizeEmail, normalizePhone, normalizeText, normalizeWebsite, phoneCompareKey } from '../utils/normalize';
import { LEAD_PRIORITIES, LEAD_STATUSES } from '../validators/lead.validators';
import { LeadPriority, LeadStatus } from '../types';

export const MAX_IMPORT_ROWS = 5000;

/** CRM fields a spreadsheet column can be mapped onto. */
export const IMPORTABLE_FIELDS = [
  'companyName',
  'contactName',
  'designation',
  'phone',
  'alternatePhone',
  'email',
  'alternateEmail',
  'website',
  'country',
  'state',
  'city',
  'industry',
  'companySize',
  'serviceRequired',
  'leadSource',
  'status',
  'priority',
  'tags',
  'remarks',
  'notes',
] as const;

export type ImportableField = (typeof IMPORTABLE_FIELDS)[number];

const HEADER_ALIASES: Record<string, ImportableField> = {
  company: 'companyName',
  companyname: 'companyName',
  organisation: 'companyName',
  organization: 'companyName',
  business: 'companyName',
  contact: 'contactName',
  contactname: 'contactName',
  name: 'contactName',
  person: 'contactName',
  designation: 'designation',
  title: 'designation',
  jobtitle: 'designation',
  phone: 'phone',
  mobile: 'phone',
  phonenumber: 'phone',
  contactnumber: 'phone',
  altphone: 'alternatePhone',
  alternatephone: 'alternatePhone',
  secondaryphone: 'alternatePhone',
  email: 'email',
  emailaddress: 'email',
  mail: 'email',
  altemail: 'alternateEmail',
  alternateemail: 'alternateEmail',
  website: 'website',
  url: 'website',
  domain: 'website',
  country: 'country',
  state: 'state',
  region: 'state',
  city: 'city',
  town: 'city',
  industry: 'industry',
  sector: 'industry',
  companysize: 'companySize',
  employees: 'companySize',
  service: 'serviceRequired',
  servicerequired: 'serviceRequired',
  requirement: 'serviceRequired',
  source: 'leadSource',
  leadsource: 'leadSource',
  status: 'status',
  priority: 'priority',
  tags: 'tags',
  remarks: 'remarks',
  notes: 'notes',
  comment: 'remarks',
  comments: 'remarks',
};

export interface ParsedSheet {
  headers: string[];
  rows: Record<string, unknown>[];
}

/** Parses an uploaded buffer safely. Formulas are never evaluated. */
export function parseSpreadsheet(buffer: Buffer, fileName: string): ParsedSheet {
  if (!buffer || buffer.length === 0) {
    throw ApiError.badRequest(`Could not read "${fileName}". The file is empty.`);
  }

  const isZip = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  const isOle = buffer.length >= 8 && buffer[0] === 0xd0 && buffer[1] === 0xcf;
  const isXlsx = fileName.toLowerCase().endsWith('.xlsx');
  const isXls = fileName.toLowerCase().endsWith('.xls');

  if (isXlsx && !isZip) {
    throw ApiError.badRequest(`Could not read "${fileName}". The file appears to be malformed.`);
  }
  if (isXls && !isOle && !isZip) {
    throw ApiError.badRequest(`Could not read "${fileName}". The file appears to be malformed.`);
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellFormula: false, // never retain/execute formulas
      cellHTML: false,
      cellDates: false,
raw: false,
    });
  } catch {
    throw ApiError.badRequest(`Could not read "${fileName}". The file appears to be malformed.`);
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw ApiError.badRequest('The uploaded file contains no worksheets');
  const sheet = workbook.Sheets[sheetName];

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '' });
  if (!matrix.length) throw ApiError.badRequest('The uploaded file contains no rows');

  const headers = (matrix[0] as unknown[]).map((h, index) => normalizeText(String(h ?? '')) || `Column ${index + 1}`);
  const body = matrix.slice(1);
  if (body.length > MAX_IMPORT_ROWS) {
    throw ApiError.badRequest(`Files are limited to ${MAX_IMPORT_ROWS} data rows. Split the file and try again.`);
  }

  const rows = body
    .map((raw) => {
      const record: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        record[header] = (raw as unknown[])[index] ?? '';
      });
      return record;
    })
    .filter((row) => Object.values(row).some((value) => String(value ?? '').trim() !== ''));

  return { headers, rows };
}

/** Best-effort automatic header → field mapping the admin can override. */
export function suggestMapping(headers: string[]): Record<string, ImportableField | ''> {
  const mapping: Record<string, ImportableField | ''> = {};
  const used = new Set<ImportableField>();
  for (const header of headers) {
    const key = header.toLowerCase().replace(/[^a-z]/g, '');
    const field = HEADER_ALIASES[key];
    if (field && !used.has(field)) {
      mapping[header] = field;
      used.add(field);
    } else {
      mapping[header] = '';
    }
  }
  return mapping;
}

export interface NormalizedRow {
  rowNumber: number;
  data: Partial<Record<ImportableField, string | null>>;
  raw: Record<string, unknown>;
  errors: string[];
}

/** Cleans a value and strips leading characters Excel treats as formulas. */
function sanitizeCell(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  let text = String(value).trim();
  if (!text) return null;
  if (/^[=+\-@\t\r]/.test(text) && !/^[-+]?\d/.test(text)) {
    text = `'${text}`; // neutralize potential formula injection on re-export
  }
  return text.slice(0, 1000);
}

export function normalizeRows(
  rows: Record<string, unknown>[],
  mapping: Record<string, string>,
): NormalizedRow[] {
  const mapped = Object.entries(mapping).filter(([, field]) =>
    (IMPORTABLE_FIELDS as readonly string[]).includes(field),
  ) as [string, ImportableField][];

  return rows.map((raw, index) => {
    const data: Partial<Record<ImportableField, string | null>> = {};
    for (const [header, field] of mapped) {
      data[field] = sanitizeCell(raw[header]);
    }

    const errors: string[] = [];

    if (!data.companyName) errors.push('Company name is required');
    if (data.email) {
      data.email = normalizeEmail(data.email);
      if (!isValidEmail(data.email)) errors.push(`Invalid email: ${data.email}`);
    }
    if (data.alternateEmail) {
      data.alternateEmail = normalizeEmail(data.alternateEmail);
      if (!isValidEmail(data.alternateEmail)) errors.push(`Invalid alternate email: ${data.alternateEmail}`);
    }
    if (data.phone) {
      data.phone = normalizePhone(data.phone);
      if (!isValidPhone(data.phone)) errors.push('Invalid phone number');
    }
    if (data.alternatePhone) {
      data.alternatePhone = normalizePhone(data.alternatePhone);
      if (!isValidPhone(data.alternatePhone)) errors.push('Invalid alternate phone number');
    }
    if (!data.email && !data.phone) errors.push('A phone number or email address is required');
    if (data.website) data.website = normalizeWebsite(data.website);

    if (data.status) {
      const status = data.status.toUpperCase().replace(/[\s-]+/g, '_') as LeadStatus;
      if (!(LEAD_STATUSES as readonly string[]).includes(status)) {
        errors.push(`Invalid status: ${data.status}`);
      } else {
        data.status = status;
      }
    }
    if (data.priority) {
      const priority = data.priority.toUpperCase() as LeadPriority;
      if (!(LEAD_PRIORITIES as readonly string[]).includes(priority)) {
        errors.push(`Invalid priority: ${data.priority}`);
      } else {
        data.priority = priority;
      }
    }

    return { rowNumber: index + 2, data, raw, errors }; // +2: 1-based + header row
  });
}

/** Flags rows that duplicate another row inside the same file. */
export function markInFileDuplicates(rows: NormalizedRow[]): Map<number, string> {
  const seenEmail = new Map<string, number>();
  const seenPhone = new Map<string, number>();
  const result = new Map<number, string>();

  for (const row of rows) {
    if (row.errors.length) continue;
    const emailKey = normalizeEmail(row.data.email ?? null);
    const phoneKey = phoneCompareKey(row.data.phone ?? null);
    if (emailKey && seenEmail.has(emailKey)) {
      result.set(row.rowNumber, `Duplicate of row ${seenEmail.get(emailKey)} in this file (same email)`);
      continue;
    }
    if (phoneKey && seenPhone.has(phoneKey)) {
      result.set(row.rowNumber, `Duplicate of row ${seenPhone.get(phoneKey)} in this file (same phone)`);
      continue;
    }
    if (emailKey) seenEmail.set(emailKey, row.rowNumber);
    if (phoneKey) seenPhone.set(phoneKey, row.rowNumber);
  }

  return result;
}

export function toCsv(rows: Record<string, string | number | null>[], headers: string[]): string {
  const escape = (value: unknown) => {
    let text = value === null || value === undefined ? '' : String(value);
    // Mitigate CSV formula injection: prefix dangerous leading characters (=, +, -, @, \t, \r) with ' unless it's a normal number
    if (/^[=+\-@\t\r]/.test(text) && !/^[-+]?\d+(\.\d+)?$/.test(text)) {
      text = `'${text}`;
    }
    return `"${text.replace(/"/g, '""')}"`;
  };
  const lines = [headers.map(escape).join(',')];
  for (const row of rows) lines.push(headers.map((h) => escape(row[h])).join(','));
  return lines.join('\r\n');
}
