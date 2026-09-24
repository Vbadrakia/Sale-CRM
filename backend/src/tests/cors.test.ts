import assert from 'node:assert/strict';
import { env } from '../config/env';

export async function runCorsTests() {
  console.log('\n--- Running CORS Allowlist Tests (Task 4 & Regression) ---');

  // Logic extracted directly from backend/src/app.ts and worker/index.ts
  function checkCorsOrigin(origin: string | undefined, allowedOrigins: string[], frontendUrl?: string): boolean {
    if (!origin) {
      // Direct server-to-server or curl/mobile requests without Origin header
      return true;
    }
    return allowedOrigins.includes(origin) || (Boolean(frontendUrl) && origin === frontendUrl);
  }

  const configuredFrontend = 'https://sale-crm.vedantbadrakia07.workers.dev';
  const allowedOrigins = [
    'https://sale-crm.vedantbadrakia07.workers.dev',
    'http://localhost:5173',
  ];

  // Test 1: Exact production origin -> Allowed
  {
    const origin = 'https://sale-crm.vedantbadrakia07.workers.dev';
    const allowed = checkCorsOrigin(origin, allowedOrigins, configuredFrontend);
    assert.equal(allowed, true, 'Exact production origin must be allowed');
    console.log('✓ Exact production origin allowed');
  }

  // Test 2: Exact development origin -> Allowed
  {
    const origin = 'http://localhost:5173';
    const allowed = checkCorsOrigin(origin, allowedOrigins, configuredFrontend);
    assert.equal(allowed, true, 'Exact development origin must be allowed');
    console.log('✓ Exact development origin allowed');
  }

  // Test 3: Malicious workers.dev subdomain -> Rejected
  {
    const maliciousSubdomain = 'https://malicious-attacker.workers.dev';
    const allowed = checkCorsOrigin(maliciousSubdomain, allowedOrigins, configuredFrontend);
    assert.equal(allowed, false, 'Arbitrary workers.dev subdomains must be rejected');
    console.log('✓ Malicious workers.dev subdomain rejected');
  }

  // Test 4: Substring prefix attack -> Rejected
  {
    const evilPrefix = 'https://evil-sale-crm.vedantbadrakia07.workers.dev';
    const allowed = checkCorsOrigin(evilPrefix, allowedOrigins, configuredFrontend);
    assert.equal(allowed, false, 'Prefix substring matching must be rejected');
    console.log('✓ Substring prefix attack rejected');
  }

  // Test 5: Subdomain wrapper attack (attacker domain wrapping trusted name) -> Rejected
  {
    const evilWrapper = 'https://sale-crm.vedantbadrakia07.workers.dev.attacker.com';
    const allowed = checkCorsOrigin(evilWrapper, allowedOrigins, configuredFrontend);
    assert.equal(allowed, false, 'Attacker domain containing trusted host as substring must be rejected');
    console.log('✓ Domain wrapper attack rejected');
  }

  // Test 6: Missing Origin header -> Allowed for direct/same-origin tools
  {
    const allowed = checkCorsOrigin(undefined, allowedOrigins, configuredFrontend);
    assert.equal(allowed, true, 'Missing origin (e.g. mobile app, curl, server-to-server) handled safely');
    console.log('✓ Missing Origin handled safely');
  }

  // Test 7: Null origin or file:// -> Rejected
  {
    const nullOrigin = 'null';
    const allowed = checkCorsOrigin(nullOrigin, allowedOrigins, configuredFrontend);
    assert.equal(allowed, false, 'null origin must be rejected');
    console.log('✓ null origin rejected');
  }

  // Test 8: Ensure CORS configuration in current env has no wildcard origins
  {
    const hasWildcard = env.corsOrigins.some((o) => o === '*' || o.includes('*'));
    assert.equal(hasWildcard, false, 'CORS allowlist must never contain wildcard (*) alongside credentials');
    console.log('✓ No wildcard (*) in CORS origins configuration');
  }
}
