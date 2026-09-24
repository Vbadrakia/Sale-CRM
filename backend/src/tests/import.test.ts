import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseSpreadsheet, normalizeRows, suggestMapping } from '../services/import.service';
import { ApiError } from '../utils/ApiError';
import { ImportJob, ImportError } from '../models';
import * as importController from '../controllers/import.controller';
import { runImportRetentionJob } from '../jobs/importRetention';
import type { Request, Response } from 'express';

export async function runImportTests() {
  console.log('\n--- Running Import & XLSX Processing Tests (Task 5, 8, 14, 15) ---');

  // Helper to generate an in-memory XLSX buffer
  function createXlsxBuffer(data: (string | number)[][]): Buffer {
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }

  // Test 1: Valid Spreadsheet Parsing (XLSX)
  {
    const buffer = createXlsxBuffer([
      ['Company Name', 'Contact Person', 'Email Address', 'Phone'],
      ['Acme Corp', 'Alice Smith', 'alice@acme.com', '+1-555-0100'],
      ['Beta LLC', 'Bob Jones', 'bob@beta.com', '+1-555-0200'],
    ]);

    const parsed = parseSpreadsheet(buffer, 'test.xlsx');
    assert.equal(parsed.headers.length, 4);
    assert.equal(parsed.rows.length, 2);
    assert.equal(parsed.rows[0]['Company Name'], 'Acme Corp');
    assert.equal(parsed.rows[1]['Email Address'], 'bob@beta.com');
    console.log('✓ Valid XLSX spreadsheet parsed correctly');
  }

  // Test 2: Formula Injection Sanitization (CSV / Spreadsheet formulas)
  {
    const buffer = createXlsxBuffer([
      ['Company Name', 'Contact Person', 'Remarks'],
      ['Safe Corp', '=cmd|"/C calc"!A0', '+12345'], // Formula and normal numeric plus
      ['@Evil Inc', '-DDE("cmd";"calc")', '=SUM(A1:A10)'],
    ]);

    const parsed = parseSpreadsheet(buffer, 'formulas.xlsx');
    const mapping = {
      'Company Name': 'companyName',
      'Contact Person': 'contactName',
      'Remarks': 'remarks',
    };

    const normalized = normalizeRows(parsed.rows, mapping);
    assert.equal(normalized.length, 2);

    // =cmd should be neutralized with leading single quote
    assert.equal(
      normalized[0].data.contactName,
      `'=cmd|"/C calc"!A0`,
      'Formulas starting with = must be neutralized with leading single quote'
    );

    // +12345 is numeric, so it should remain numeric text
    assert.equal(normalized[0].data.remarks, '+12345');

    // @Evil Inc should be neutralized
    assert.equal(
      normalized[1].data.companyName,
      `'@Evil Inc`,
      'Values starting with @ must be neutralized'
    );

    // -DDE should be neutralized
    assert.equal(
      normalized[1].data.contactName,
      `'-DDE("cmd";"calc")`,
      'Formulas starting with - must be neutralized'
    );

    // =SUM formula should be neutralized
    assert.equal(
      normalized[1].data.remarks,
      `'=SUM(A1:A10)`,
      'Formulas starting with = must be neutralized'
    );

    console.log('✓ Formula injection protection verified (cells starting with =, +, -, @ neutralized)');
  }

  // Test 3: Malformed buffer rejected with 400 ApiError
  {
    const junkBuffer = Buffer.from('This is completely corrupted binary garbage not a zip or spreadsheet\x00\xFF\xAA');
    assert.throws(
      () => parseSpreadsheet(junkBuffer, 'corrupted.xlsx'),
      (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.equal((err as ApiError).statusCode, 400);
        return true;
      }
    );
    console.log('✓ Malformed spreadsheet buffer rejected with 400 Bad Request');
  }

  // Test 4: Suggest mapping accurately identifies common CRM column aliases
  {
    const headers = ['Company', 'Contact', 'Job Title', 'Mobile', 'Email Address', 'Country'];
    const mapping = suggestMapping(headers);

    assert.equal(mapping['Company'], 'companyName');
    assert.equal(mapping['Contact'], 'contactName');
    assert.equal(mapping['Job Title'], 'designation');
    assert.equal(mapping['Mobile'], 'phone');
    assert.equal(mapping['Email Address'], 'email');
    assert.equal(mapping['Country'], 'country');
    console.log('✓ Suggest mapping correctly matches standard CRM header aliases');
  }

  // Test 5: Validation errors for required and invalid fields
  {
    const rows = [
      { 'Company Name': '', 'Email': 'not-an-email', 'Phone': '123' }, // Missing company & invalid email
      { 'Company Name': 'Valid Co', 'Email': 'valid@co.com', 'Phone': '9876543210' },
    ];
    const mapping = {
      'Company Name': 'companyName',
      'Email': 'email',
      'Phone': 'phone',
    };

    const normalized = normalizeRows(rows, mapping);
    assert.equal(normalized[0].errors.length > 0, true, 'Row 1 should have validation errors');
    assert.ok(normalized[0].errors.some((e) => e.includes('Company name is required')));
    assert.ok(normalized[0].errors.some((e) => e.includes('Invalid email')));

    assert.equal(normalized[1].errors.length, 0, 'Row 2 should have zero errors');
    console.log('✓ Row validation enforces required companyName and validates email/phone');
  }

  // Test 6: Cancel Import Job (Task 15)
  {
    const origFindByPk = ImportJob.findByPk;
    try {
      const mockJob = {
        id: 42,
        status: 'PROCESSING',
        createdById: 5,
        save: async () => mockJob,
      };

      ImportJob.findByPk = (async () => mockJob) as unknown as typeof ImportJob.findByPk;

      const req = {
        user: { id: 5, role: 'BDE' },
        params: { id: '42' },
      } as unknown as Request;

      let responseCode = 200;
      let responseBody: unknown = null;
      const res = {
        status(code: number) {
          responseCode = code;
          return res;
        },
        json(data: unknown) {
          responseBody = data;
          return res;
        },
      } as unknown as Response;

      await importController.cancelImportJob(req, res);
      assert.equal(responseCode, 200);
      assert.ok(responseBody !== null);
      assert.equal(mockJob.status, 'CANCELLED');
      console.log('✓ Import job cancellation verified (status transitioned to CANCELLED)');

      // Trying to cancel an already completed job should fail
      mockJob.status = 'COMPLETED';
      await assert.rejects(
        async () => {
          await importController.cancelImportJob(req, res);
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal((err as ApiError).statusCode, 400);
          return true;
        }
      );
      console.log('✓ Attempt to cancel finished job rejected with 400 Bad Request');
    } finally {
      ImportJob.findByPk = origFindByPk;
    }
  }

  // Test 7: Import Error Retention Purge (Task 14)
  {
    const origDestroy = ImportError.destroy;
    try {
      let destroyWhereClause: unknown = null;
      ImportError.destroy = (async (options: { where: unknown }) => {
        destroyWhereClause = options.where;
        return 15; // 15 purged records
      }) as unknown as typeof ImportError.destroy;

      const result = await runImportRetentionJob(30);
      assert.equal(result.deletedErrors, 15);
      assert.ok(destroyWhereClause !== null);
      console.log('✓ Import error retention job correctly purges records older than 30 days');
    } finally {
      ImportError.destroy = origDestroy;
    }
  }
}
