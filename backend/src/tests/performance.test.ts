import assert from 'node:assert/strict';
import { sequelize, withDbRetry } from '../config/database';
import { overview, invalidateDashboardCache } from '../controllers/dashboard.controller';
import { Lead, FollowUp, Customer, User } from '../models';
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
}
