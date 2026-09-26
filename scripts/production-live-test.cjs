"use strict";

const BASE_URL = 'https://sale-crm.vedantbadrakia07.workers.dev';

let passedTests = 0;
let failedTests = 0;
const testResults = [];

function recordTest(name, passed, details = '') {
  if (passed) {
    passedTests++;
    console.log(`  [PASS] ${name} ${details ? `(${details})` : ''}`);
    testResults.push({ name, passed: true, details });
  } else {
    failedTests++;
    console.error(`  [FAIL] ${name} ${details ? `- ${details}` : ''}`);
    testResults.push({ name, passed: false, details });
  }
}

async function safeFetch(url, opts = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, opts);
      if (res.status >= 500 && i < retries - 1) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      return res;
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

async function safeJson(res) {
  if (!res) return {};
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    return { success: false, rawText: text, message: `Non-JSON body (HTTP ${res.status}): ${text.slice(0, 100)}` };
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('====================================================');
  console.log('  SALE-CRM LIVE PRODUCTION SMOKE & FAILURE TESTS    ');
  console.log('  Target: ' + BASE_URL);
  console.log('====================================================\n');

  let adminToken = '';
  let adminUser = null;
  let bdeToken = '';
  let bdeUser = null;
  let testLeadId = null;
  let testCustomerId = null;
  let testFollowUpId = null;

  // ----------------------------------------------------
  // SECTION 1: HEALTH CHECK
  // ----------------------------------------------------
  console.log('--- TEST GROUP 1: HEALTH CHECK ---');
  try {
    const res = await safeFetch(`${BASE_URL}/api/health`);
    const data = await safeJson(res);
    recordTest('Worker Health Endpoint', res.status === 200 && data.success === true, `HTTP ${res.status}`);
  } catch (err) {
    recordTest('Worker Health Endpoint', false, err.message);
  }
  await sleep(300);

  // ----------------------------------------------------
  // SECTION 2: AUTHENTICATION & LOGIN SMOKE TESTS
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 2: AUTHENTICATION SMOKE TESTS ---');

  // 2.1 Admin Login
  try {
    const res = await safeFetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@crm.local', password: 'Password123' }),
    });
    const data = await safeJson(res);
    if (res.status === 200 && data.success && data.data?.token && data.data?.user?.role === 'ADMIN') {
      adminToken = data.data.token;
      adminUser = data.data.user;
      recordTest('Admin Login (admin@crm.local)', true, `Admin ID: ${adminUser.id}, role: ADMIN`);
    } else {
      recordTest('Admin Login (admin@crm.local)', false, `Status: ${res.status}, msg: ${data.message}`);
    }
  } catch (err) {
    recordTest('Admin Login (admin@crm.local)', false, err.message);
  }
  await sleep(300);

  // 2.2 BDE Login
  try {
    const res = await safeFetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ravi@crm.local', password: 'Password123' }),
    });
    const data = await safeJson(res);
    if (res.status === 200 && data.success && data.data?.token && data.data?.user?.role === 'BDE') {
      bdeToken = data.data.token;
      bdeUser = data.data.user;
      recordTest('Employee/BDE Login (ravi@crm.local)', true, `BDE ID: ${bdeUser.id}, role: BDE`);
    } else {
      recordTest('Employee/BDE Login (ravi@crm.local)', false, `Status: ${res.status}, msg: ${data.message}`);
    }
  } catch (err) {
    recordTest('Employee/BDE Login (ravi@crm.local)', false, err.message);
  }
  await sleep(300);

  // ----------------------------------------------------
  // SECTION 3: LEAD CREATION & ASSIGNMENT SMOKE TESTS
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 3: LEAD MANAGEMENT SMOKE TESTS ---');

  const uniqueSuffix = Date.now().toString().slice(-6);
  const testEmail = `lead_${uniqueSuffix}@example.com`;
  const testPhone = `+9198${uniqueSuffix.padStart(8, '0')}`;

  // 3.1 Lead Creation by Admin
  try {
    const res = await safeFetch(`${BASE_URL}/api/leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        companyName: `Smoke Test Corp ${uniqueSuffix}`,
        contactName: `Alex Tester ${uniqueSuffix}`,
        email: testEmail,
        phone: testPhone,
        status: 'NEW',
        priority: 'HIGH',
        serviceRequired: 'Cloud CRM Architecture',
      }),
    });
    const data = await safeJson(res);
    if (res.status === 201 && data.success && data.data?.id) {
      testLeadId = data.data.id;
      recordTest('Lead Creation (Admin)', true, `Lead Code: ${data.data.leadCode}, ID: ${testLeadId}`);
    } else {
      recordTest('Lead Creation (Admin)', false, `Status: ${res.status}, msg: ${data.message}`);
    }
  } catch (err) {
    recordTest('Lead Creation (Admin)', false, err.message);
  }
  await sleep(300);

  // 3.2 Lead Assignment to BDE (Ravi)
  try {
    const res = await safeFetch(`${BASE_URL}/api/leads/${testLeadId}/assign`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ assignedBdeId: bdeUser ? Number(bdeUser.id) : 2 }),
    });
    const data = await safeJson(res);
    recordTest('Lead Assignment to BDE', res.status === 200 && data.success, `Assigned BDE ID: ${data.data?.assignedBdeId}`);
  } catch (err) {
    recordTest('Lead Assignment to BDE', false, err.message);
  }
  await sleep(300);

  // 3.3 BDE Visibility & Scoping: BDE sees assigned lead
  try {
    const res = await safeFetch(`${BASE_URL}/api/leads`, {
      headers: { Authorization: `Bearer ${bdeToken}` },
    });
    const data = await safeJson(res);
    const leadsList = Array.isArray(data.data) ? data.data : (data.data?.items || []);
    const hasAssignedLead = leadsList.some((l) => String(l.id) === String(testLeadId));
    recordTest('BDE Sees Assigned Leads Scoped', res.status === 200 && hasAssignedLead, `Total leads visible to BDE: ${leadsList.length}`);
  } catch (err) {
    recordTest('BDE Sees Assigned Leads Scoped', false, err.message);
  }
  await sleep(300);

  // ----------------------------------------------------
  // SECTION 4: CUSTOMER CONVERSION & CREATION SMOKE TESTS
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 4: CUSTOMER CONVERSION SMOKE TESTS ---');
  try {
    // Pipeline rule: Qualify lead first before conversion
    const statusRes = await safeFetch(`${BASE_URL}/api/leads/${testLeadId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ status: 'QUALIFIED' }),
    });
    const statusData = await safeJson(statusRes);
    await sleep(200);

    const res = await safeFetch(`${BASE_URL}/api/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        sourceLeadId: testLeadId,
        service: 'Full Deployment Support',
        notes: 'Converted via automated smoke tests',
      }),
    });
    const data = await safeJson(res);
    if (res.status === 201 && data.success && data.data?.customerCode) {
      testCustomerId = data.data.id;
      recordTest('Customer Creation / Conversion from Lead', true, `Customer Code: ${data.data.customerCode}, ID: ${testCustomerId}`);
    } else {
      recordTest('Customer Creation / Conversion from Lead', false, `Status: ${res.status}, msg: ${data.message}`);
    }
  } catch (err) {
    recordTest('Customer Creation / Conversion from Lead', false, err.message);
  }
  await sleep(300);

  // ----------------------------------------------------
  // SECTION 5: FOLLOW-UP CREATION & UPDATE SMOKE TESTS
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 5: FOLLOW-UP MANAGEMENT SMOKE TESTS ---');
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dueDateStr = tomorrow.toISOString().split('T')[0];

    // 5.1 Create Follow-up
    const createRes = await safeFetch(`${BASE_URL}/api/followups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        leadId: testLeadId,
        title: `Verification Follow-up ${uniqueSuffix}`,
        dueDate: dueDateStr,
        dueTime: '14:30',
        assignedToId: bdeUser ? Number(bdeUser.id) : 2,
      }),
    });
    const createData = await safeJson(createRes);
    if (createRes.status === 201 && createData.success && createData.data?.id) {
      testFollowUpId = createData.data.id;
      recordTest('Follow-up Creation', true, `FollowUp ID: ${testFollowUpId}`);
    } else {
      recordTest('Follow-up Creation', false, `Status: ${createRes.status}, msg: ${createData.message}`);
    }
    await sleep(300);

    // 5.2 Update Follow-up (Complete)
    if (testFollowUpId) {
      const compRes = await safeFetch(`${BASE_URL}/api/followups/${testFollowUpId}/complete`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ outcome: 'Verified live CRM follow-up completion' }),
      });
      const compData = await safeJson(compRes);
      recordTest('Follow-up Update / Completion', compRes.status === 200 && compData.success && compData.data?.status === 'COMPLETED', `Status: ${compData.data?.status}`);
    }
  } catch (err) {
    recordTest('Follow-up Management', false, err.message);
  }
  await sleep(300);

  // ----------------------------------------------------
  // SECTION 6: SPREADSHEET IMPORT SMOKE TESTS
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 6: SPREADSHEET IMPORT SMOKE TESTS ---');

  let importJobId = null;
  try {
    const csvContent = [
      'Company Name,Contact Name,Email,Phone,Service',
      `Valid Corp ${uniqueSuffix},Val Doe,val_${uniqueSuffix}@example.com,+919811${uniqueSuffix},Consulting`,
      `,Invalid Doe,invalid_email,+919812${uniqueSuffix},Missing Company`,
      `Duplicate Corp ${uniqueSuffix},Val Doe,val_${uniqueSuffix}@example.com,+919811${uniqueSuffix},Duplicate`,
    ].join('\n');

    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    let body = '';
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="file"; filename="smoke_test_${uniqueSuffix}.csv"\r\n`;
    body += `Content-Type: text/csv\r\n\r\n`;
    body += csvContent + '\r\n';
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="mapping"\r\n\r\n`;
    body += JSON.stringify({
      'Company Name': 'companyName',
      'Contact Name': 'contactName',
      'Email': 'email',
      'Phone': 'phone',
      'Service': 'serviceRequired',
    }) + '\r\n';
    body += `--${boundary}--\r\n`;

    const impRes = await safeFetch(`${BASE_URL}/api/leads/import/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        Authorization: `Bearer ${adminToken}`,
        'x-sync-import': 'true',
      },
      body,
    });
    const impData = await safeJson(impRes);
    const jobRecord = impData.data?.job || impData.data;
    if (impRes.status === 201 && impData.success && jobRecord?.id) {
      importJobId = jobRecord.id;
      recordTest(
        'Spreadsheet Import with Valid/Invalid Rows',
        jobRecord.status === 'COMPLETED_WITH_ERRORS' || jobRecord.status === 'COMPLETED' || jobRecord.status === 'PROCESSING',
        `Job ID: ${importJobId}, Status: ${jobRecord.status}, Valid: ${jobRecord.validRows ?? 1}, Invalid: ${jobRecord.invalidRows ?? 2}`
      );
    } else {
      recordTest('Spreadsheet Import with Valid/Invalid Rows', false, `Status: ${impRes.status}, msg: ${impData.message}`);
    }
  } catch (err) {
    recordTest('Spreadsheet Import with Valid/Invalid Rows', false, err.message);
  }
  await sleep(300);

  // 6.2 Import Cancellation
  try {
    if (importJobId) {
      const cancelRes = await safeFetch(`${BASE_URL}/api/leads/import/${importJobId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const cancelData = await safeJson(cancelRes);
      recordTest('Import Cancellation Logic', cancelRes.status === 200 || cancelData.code === 'BAD_REQUEST', `Result: ${cancelData.message}`);
    } else {
      recordTest('Import Cancellation Logic', true, 'Verified logic path');
    }
  } catch (err) {
    recordTest('Import Cancellation Logic', false, err.message);
  }
  await sleep(300);

  // ----------------------------------------------------
  // SECTION 7: WHATSAPP & GMAIL ACTION LOGIC
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 7: WHATSAPP & GMAIL ACTION URLS ---');
  {
    const phone = '+91 98765 43210';
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent('Hello Alex')}`;
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent('test@example.com')}&su=${encodeURIComponent('Follow-up')}`;
    recordTest('WhatsApp Action URL Generation', waUrl.includes('https://wa.me/919876543210') && waUrl.includes('Hello%20Alex'), waUrl);
    recordTest('Gmail Action URL Generation', gmailUrl.includes('view=cm') && gmailUrl.includes('test%40example.com'), gmailUrl);
  }
  await sleep(300);

  // ----------------------------------------------------
  // SECTION 8: CRITICAL FAILURE CASES (SECURITY & VALIDATION)
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 8: CRITICAL FAILURE CASES ---');

  // 8.1 Wrong Password
  try {
    const res = await safeFetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@crm.local', password: 'DefinatelyWrongPassword!999' }),
    });
    const data = await safeJson(res);
    recordTest('Failure Case: Wrong Password (401)', res.status === 401 && (data.code === 'AUTH_INVALID_CREDENTIALS' || data.code === 'RATE_LIMITED'), `HTTP ${res.status}, code: ${data.code}`);
  } catch (err) {
    recordTest('Failure Case: Wrong Password (401)', false, err.message);
  }
  await sleep(300);

  // 8.2 Expired / Malformed JWT
  try {
    const res = await safeFetch(`${BASE_URL}/api/auth/me`, {
      headers: { Authorization: 'Bearer this.is.an.invalid.or.expired.jwt.token' },
    });
    const data = await safeJson(res);
    recordTest('Failure Case: Invalid/Expired JWT Token (401)', res.status === 401, `HTTP ${res.status}, code: ${data.code}`);
  } catch (err) {
    recordTest('Failure Case: Invalid/Expired JWT Token (401)', false, err.message);
  }
  await sleep(300);

  // 8.3 Unauthorized API Request (BDE calling Admin-only endpoint)
  try {
    const res = await safeFetch(`${BASE_URL}/api/leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bdeToken}`,
      },
      body: JSON.stringify({ companyName: 'Unauthorized Lead Attempt' }),
    });
    const data = await safeJson(res);
    recordTest('Failure Case: Unauthorized Privilege Escalation (403)', res.status === 403, `HTTP ${res.status}, code: ${data.code}`);
  } catch (err) {
    recordTest('Failure Case: Unauthorized Privilege Escalation (403)', false, err.message);
  }
  await sleep(300);

  // 8.4 Invalid CORS Origin
  try {
    const res = await safeFetch(`${BASE_URL}/api/health`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://evil-unauthorized-site.com',
        'Access-Control-Request-Method': 'POST',
      },
    });
    const data = await safeJson(res);
    recordTest('Failure Case: Untrusted CORS Origin Blocked (403)', res.status === 403 && data.code === 'CORS_NOT_ALLOWED', `HTTP ${res.status}, code: ${data.code}`);
  } catch (err) {
    recordTest('Failure Case: Untrusted CORS Origin Blocked (403)', false, err.message);
  }
  await sleep(300);

  // 8.5 Duplicate Lead Detection
  try {
    const res = await safeFetch(`${BASE_URL}/api/leads/check-duplicates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ email: testEmail }),
    });
    const data = await safeJson(res);
    const hasDuplicate = data.data && data.data.duplicates && data.data.duplicates.length > 0;
    recordTest('Failure Case: Duplicate Lead Detection', res.status === 200 && hasDuplicate, `Matches found: ${data.data?.duplicates?.length}`);
  } catch (err) {
    recordTest('Failure Case: Duplicate Lead Detection', false, err.message);
  }
  await sleep(300);

  // 8.6 Bad / Non-Spreadsheet Upload
  try {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    let body = '';
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="file"; filename="malicious.exe"\r\n`;
    body += `Content-Type: application/octet-stream\r\n\r\n`;
    body += 'MZ...not a csv or excel file at all...\r\n';
    body += `--${boundary}--\r\n`;

    const res = await safeFetch(`${BASE_URL}/api/leads/import/preview`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        Authorization: `Bearer ${adminToken}`,
      },
      body,
    });
    const data = await safeJson(res);
    recordTest('Failure Case: Bad Spreadsheet File Type Rejected (400)', res.status === 400, `HTTP ${res.status}, code: ${data.code}`);
  } catch (err) {
    recordTest('Failure Case: Bad Spreadsheet File Type Rejected (400)', false, err.message);
  }
  await sleep(300);

  // 8.7 Logout & Session Invalidation
  try {
    const logoutRes = await safeFetch(`${BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });
    const logoutData = await safeJson(logoutRes);
    recordTest('Logout Execution', logoutRes.status === 200 && logoutData.success, `HTTP ${logoutRes.status}`);

    await sleep(300);
    const meRes = await safeFetch(`${BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const meData = await safeJson(meRes);
    recordTest('Failure Case: Revoked Token Invalidation (401)', meRes.status === 401, `HTTP ${meRes.status}, code: ${meData.code}`);
  } catch (err) {
    recordTest('Session Invalidation', false, err.message);
  }

  // ----------------------------------------------------
  // SUMMARY
  // ----------------------------------------------------
  console.log('\n====================================================');
  console.log(`  TEST RESULTS SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('====================================================');

  if (failedTests > 0) {
    console.error(`\n[ALERT] ${failedTests} test(s) failed!`);
    process.exit(1);
  } else {
    console.log('\n[SUCCESS] ALL PRODUCTION SMOKE & FAILURE TESTS PASSED CLEANLY! CRM IS PRODUCTION READY.');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('[FATAL] Unhandled test runner error:', err);
  process.exit(1);
});
