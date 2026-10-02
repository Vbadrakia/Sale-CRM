import assert from 'node:assert/strict';
import { sequelize, withDbRetry } from '../config/database';
import { overview, invalidateDashboardCache } from '../controllers/dashboard.controller';
import { updateLeadStatus } from '../controllers/lead.controller';
import { Lead, FollowUp, Customer, User, Activity } from '../models';
import type { Request, Response } from 'express';

export async function runPerformanceTests() {
  console.log('\n--- Running Backend Performance & Pool Optimization Tests ---');

  // Test 1: Worker pool and retry configuration assertions
  {
    const seqAny = sequelize as unknown as { options?: { pool?: Record<string, unknown>; retry?: { max?: number; match?: (RegExp | string)[] } } };
    const poolConfig = seqAny.options?.pool;
    assert.ok(poolConfig, 'Sequelize pool configuration must exist');
    assert.equal(poolConfig.maxUses, Infinity, 'Worker pool maxUses must be Infinity for Hyperdrive pooling');

    const retryConfig = seqAny.options?.retry;
    assert.ok(retryConfig, 'Retry config must exist');
    assert.equal(retryConfig.max, 1, 'Sequelize retry max must be 1 to prevent stacked retry explosions');

    const hasTimeoutPattern = retryConfig.match?.some((pattern) => {
      const str = pattern.toString();
      return str.includes('query read timeout') || str.includes('ETIMEDOUT') || str.includes('closed');
    });
    assert.equal(hasTimeoutPattern, false, 'Timeout patterns (/closed/, /ETIMEDOUT/, /query read timeout/) must be excluded from retry patterns');

    console.log('✓ Pool options and non-stacked retry layer verified');
  }

  // Test 2: withDbRetry single layer execution
  {
    let attempts = 0;
    try {
      await withDbRetry(async () => {
        attempts++;
        throw new Error('Simulated transient error');
      });
    } catch {
      // Expected
    }
    assert.equal(attempts, 1, 'withDbRetry default maxRetries must be 1 to avoid duplicating Sequelize retries');
    console.log('✓ withDbRetry default single attempt verified');
  }

  // Test 3: Dashboard overview in-memory caching and aggregate response
  {
    const origLeadFindAll = Lead.findAll;
    const origFollowUpFindAll = FollowUp.findAll;
    const origCustomerFindAll = Customer.findAll;
    const origUserFindAll = User.findAll;

    let leadFindAllCalls = 0;

    try {
      Lead.findAll = (async (options: { attributes?: unknown[] }) => {
        leadFindAllCalls++;
        const attrs = options?.attributes || [];
        if (attrs.includes('status')) {
          return [
            { status: 'NEW', total: '10' },
            { status: 'WON', total: '5' },
          ];
        }
        if (attrs.includes('leadSource')) {
          return [{ leadSource: 'WEBSITE', total: '15' }];
        }
        if (attrs.includes('assignedBdeId')) {
          return [{ assignedBdeId: 1, status: 'WON', total: '5' }];
        }
        return [{ month: '2026-09', total: '15' }];
      }) as unknown as typeof Lead.findAll;

      FollowUp.findAll = (async (options: { where?: { status?: string } }) => {
        if (options?.where?.status === 'COMPLETED') {
          return [{ assignedToId: 1, total: '3' }];
        }
        return [{ today: '2', upcoming: '4', overdue: '1', completed: '3' }];
      }) as unknown as typeof FollowUp.findAll;

      Customer.findAll = (async () => {
        return [{ total: '5', newThisMonth: '2' }];
      }) as unknown as typeof Customer.findAll;

      User.findAll = (async () => {
        return [
          {
            id: 1,
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com',
            role: 'BDE',
            isActive: true,
          },
        ];
      }) as unknown as typeof User.findAll;

      invalidateDashboardCache();

      let sentData: Record<string, unknown> | null = null;
      const req = {
        user: {
          id: 1,
          role: 'ADMIN',
          email: 'admin@example.com',
        },
        id: 'perf-test-req',
      } as unknown as Request;

      const res = {
        status(_code: number) {
          return res;
        },
        json(data: { success: boolean; data: Record<string, unknown> }) {
          sentData = data.data;
          return res;
        },
      } as unknown as Response;

      // 1. Initial overview call - computes and caches
      await overview(req, res);
      assert.ok(sentData, 'Overview response must be returned');
      assert.ok((sentData as Record<string, unknown>).summary, 'Overview must include summary');
      assert.ok((sentData as Record<string, unknown>).leadsByStatus, 'Overview must include leadsByStatus');
      assert.ok((sentData as Record<string, unknown>).leadsBySource, 'Overview must include leadsBySource');
      assert.ok((sentData as Record<string, unknown>).leadsByBde, 'Overview must include leadsByBde');
      assert.ok((sentData as Record<string, unknown>).monthlyTrend, 'Overview must include monthlyTrend');
      assert.ok((sentData as Record<string, unknown>).conversion, 'Overview must include conversion');
      assert.ok((sentData as Record<string, unknown>).followUps, 'Overview must include followUps');

      const initialCalls = leadFindAllCalls;
      assert.ok(initialCalls > 0, 'Database calls must be made on cache miss');

      // 2. Second overview call - must be served directly from in-memory cache
      let cachedData: Record<string, unknown> | null = null;
      const resCached = {
        status(_code: number) {
          return resCached;
        },
        json(data: { success: boolean; data: Record<string, unknown> }) {
          cachedData = data.data;
          return resCached;
        },
      } as unknown as Response;

      await overview(req, resCached);
      assert.deepEqual(cachedData, sentData, 'Overview cached response must match initial compute');
      assert.equal(leadFindAllCalls, initialCalls, 'No additional database calls should be made within 30s cache TTL');

      console.log('✓ Dashboard overview endpoint and 30s in-memory cache verified');
    } finally {
      Lead.findAll = origLeadFindAll;
      FollowUp.findAll = origFollowUpFindAll;
      Customer.findAll = origCustomerFindAll;
      User.findAll = origUserFindAll;
    }
  }

  // Test 4: Invalidation after lead status change ensures immediate fresh counts
  {
    const origLeadFindAll = Lead.findAll;
    const origLeadFindByPk = Lead.findByPk;
    const origFollowUpFindAll = FollowUp.findAll;
    const origCustomerFindAll = Customer.findAll;
    const origUserFindAll = User.findAll;
    const origActivityCreate = Activity.create;

    let leadFindAllCalls = 0;
    let newStatusCount = 10;

    try {
      Activity.create = (async () => ({})) as unknown as typeof Activity.create;
      Lead.findAll = (async (options: { attributes?: unknown[] }) => {
        leadFindAllCalls++;
        const attrs = options?.attributes || [];
        if (attrs.includes('status')) {
          return [
            { status: 'NEW', total: String(newStatusCount) },
            { status: 'WON', total: '5' },
          ];
        }
        if (attrs.includes('leadSource')) {
          return [{ leadSource: 'WEBSITE', total: '15' }];
        }
        if (attrs.includes('assignedBdeId')) {
          return [{ assignedBdeId: 1, status: 'WON', total: '5' }];
        }
        return [{ month: '2026-09', total: '15' }];
      }) as unknown as typeof Lead.findAll;

      FollowUp.findAll = (async (options: { where?: { status?: string } }) => {
        if (options?.where?.status === 'COMPLETED') {
          return [{ assignedToId: 1, total: '3' }];
        }
        return [{ today: '2', upcoming: '4', overdue: '1', completed: '3' }];
      }) as unknown as typeof FollowUp.findAll;

      Customer.findAll = (async () => {
        return [{ total: '5', newThisMonth: '2' }];
      }) as unknown as typeof Customer.findAll;

      User.findAll = (async () => {
        return [
          {
            id: 1,
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com',
            role: 'BDE',
            isActive: true,
          },
        ];
      }) as unknown as typeof User.findAll;

      invalidateDashboardCache();

      let sentData: Record<string, unknown> | null = null;
      const req = {
        user: { id: 1, role: 'ADMIN', email: 'admin@example.com' },
        id: 'perf-test-req-2',
      } as unknown as Request;

      const res = {
        status(_code: number) { return res; },
        json(data: { success: boolean; data: Record<string, unknown> }) {
          sentData = data.data;
          return res;
        },
      } as unknown as Response;

      // 1. Initial overview populates cache with newStatusCount = 10
      await overview(req, res);
      const summaryInitial = ((sentData ?? {}) as Record<string, unknown>).summary as { leads: { NEW: number } };
      assert.equal(summaryInitial.leads.NEW, 10, 'Initial count should be 10');
      const callsBefore = leadFindAllCalls;

      // 2. Perform lead status change via updateLeadStatus
      const mockLead = {
        id: 101,
        leadCode: 'LEAD-101',
        status: 'NEW',
        assignedBdeId: 1,
        save: async () => mockLead,
      };
      Lead.findByPk = (async () => mockLead) as unknown as typeof Lead.findByPk;

      const updateReq = {
        params: { id: '101' },
        body: { status: 'CONTACTED' },
        user: { id: 1, role: 'ADMIN', email: 'admin@example.com' },
      } as unknown as Request;

      const updateRes = {
        status(_code: number) { return updateRes; },
        json(_data: unknown) { return updateRes; },
      } as unknown as Response;

      newStatusCount = 9; // Simulate DB state update
      await updateLeadStatus(updateReq, updateRes);

      // 3. Immediately query overview again: cache must have been invalidated!
      await overview(req, res);
      assert.ok(leadFindAllCalls > callsBefore, 'Overview must re-query database after status update instead of using stale cache');
      const summaryAfter = ((sentData ?? {}) as Record<string, unknown>).summary as { leads: { NEW: number } };
      assert.equal(summaryAfter.leads.NEW, 9, 'Overview counts must reflect updated database state immediately');

      console.log('✓ Cache invalidation after lead mutation and immediate fresh overview verified');
    } finally {
      Lead.findAll = origLeadFindAll;
      Lead.findByPk = origLeadFindByPk;
      FollowUp.findAll = origFollowUpFindAll;
      Customer.findAll = origCustomerFindAll;
      User.findAll = origUserFindAll;
      Activity.create = origActivityCreate;
    }
  }

  // Test 5: Cache-Control: no-store on authenticated responses & listLeads distinct: false
  {
    const { authenticate } = await import('../middleware/auth');
    const { signAuthToken } = await import('../utils/jwt');
    const origFindByPk = User.findByPk;
    try {
      User.findByPk = (async () => ({
        id: 999,
        email: 'perfuser@example.com',
        role: 'ADMIN',
        isActive: true,
        emailVerified: true,
        tokenVersion: 1,
      })) as unknown as typeof User.findByPk;

      const token = signAuthToken({ id: 999, email: 'perfuser@example.com', role: 'ADMIN', tokenVersion: 1 });
      const req = {
        method: 'GET',
        headers: { authorization: `Bearer ${token}` },
      } as unknown as Request;

      const headersSet: Record<string, string> = {};
      const res = {
        setHeader(name: string, value: string) {
          headersSet[name.toLowerCase()] = value;
        },
      } as unknown as Response;

      await authenticate(req, res, () => {});
      assert.equal(headersSet['cache-control'], 'no-store', 'authenticate must set Cache-Control: no-store on response');

      // Verify listLeads implementation uses distinct: false
      const fs = await import('fs');
      const path = await import('path');
      const leadControllerCode = fs.readFileSync(path.resolve(__dirname, '../controllers/lead.controller.ts'), 'utf-8');
      assert.ok(leadControllerCode.includes('distinct: false,'), 'listLeads in lead.controller.ts must use distinct: false for performance');

      console.log('✓ Cache-Control: no-store on authenticated responses and listLeads distinct: false verified');
    } finally {
      User.findByPk = origFindByPk;
    }
  }
}
