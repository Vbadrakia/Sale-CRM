process.env.NODE_ENV = 'test';

import { runAuthTests } from './auth.test';
import { runAuthzTests } from './authz.test';
import { runCorsTests } from './cors.test';
import { runImportTests } from './import.test';
import { runSecurityTests } from './security.test';

async function runAllSuites() {
  console.log('====================================================');
  console.log('  SALE-CRM SECURITY & PRODUCTION REGRESSION SUITE   ');
  console.log('====================================================');

  const suites: { name: string; fn: () => Promise<void> }[] = [
    { name: 'Authentication & Session Integrity (Task 1 & 2)', fn: runAuthTests },
    { name: 'Authorization & Model A Access Control (Task 11)', fn: runAuthzTests },
    { name: 'CORS Strict Allowlist Validation (Task 4)', fn: runCorsTests },
    { name: 'Import Engine & Data Retention (Task 5, 8, 14, 15)', fn: runImportTests },
    { name: 'Security Hardening & Production Error Safety (Task 9, 10, 13)', fn: runSecurityTests },
  ];

  let passed = 0;
  let failed = 0;
  const errors: { suite: string; error: unknown }[] = [];

  for (const suite of suites) {
    try {
      await suite.fn();
      passed++;
    } catch (err) {
      failed++;
      errors.push({ suite: suite.name, error: err });
      console.error(`\n❌ SUITE FAILED: ${suite.name}`);
      console.error(err);
    }
  }

  console.log('\n====================================================');
  console.log(`TOTAL SUITES: ${suites.length} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('====================================================\n');

  if (failed > 0) {
    console.error(`Regression test run FAILED with ${failed} failing suite(s).`);
    process.exit(1);
  } else {
    console.log('All regression test suites PASSED successfully.');
    process.exit(0);
  }
}

void runAllSuites();
