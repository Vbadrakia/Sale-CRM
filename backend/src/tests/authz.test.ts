import assert from 'node:assert/strict';
import { ApiError } from '../utils/ApiError';
import { User, Lead, FollowUp, Activity, Notification } from '../models';
import * as followupController from '../controllers/followup.controller';
import * as leadController from '../controllers/lead.controller';
import type { Request, Response } from 'express';

export async function runAuthzTests() {
  console.log('\n--- Running Authorization Tests (Task 11 Model A & Access Control) ---');

  function mockReqRes(user: { id: number; role: 'ADMIN' | 'BDE' }, body = {}, params = {}, query = {}) {
    const req = {
      user: { ...user, isActive: true, emailVerified: true },
      body,
      params,
      query,
    } as unknown as Request;

    let statusCode = 200;
    let jsonBody: unknown = null;

    const res = {
      status(code: number) {
        statusCode = code;
        return res;
      },
      json(data: unknown) {
        jsonBody = data;
        return res;
      },
    } as unknown as Response;

    return { req, res, getResponse: () => ({ statusCode, jsonBody }) };
  }

  // Preserve model methods
  const origLeadFindByPk = Lead.findByPk;
  const origFollowUpFindByPk = FollowUp.findByPk;
  const origFollowUpFindOne = FollowUp.findOne;
  const origFollowUpCreate = FollowUp.create;
  const origFollowUpUpdate = FollowUp.update;
  const origUserFindOne = User.findOne;
  const origActivityCreate = Activity.create;
  const origNotificationCreate = Notification.create;

  try {
    // Test 1: Model A Follow-Up Assignment Mismatch Rejected
    // Lead belongs to BDE 10, Admin tries to assign follow-up to BDE 20
    {
      Lead.findByPk = (async () => ({
        id: 50,
        companyName: 'Acme Corp',
        assignedBdeId: 10, // Owned by BDE 10
      })) as unknown as typeof Lead.findByPk;

      const { req, res } = mockReqRes(
        { id: 1, role: 'ADMIN' },
        {
          leadId: 50,
          title: 'Intro Call',
          dueDate: '2026-10-01',
          dueTime: '10:00',
          assignedToId: 20, // Disallowed mismatch under Model A!
        }
      );

      await assert.rejects(
        async () => {
          await followupController.createFollowUp(req, res);
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError, 'Expected ApiError');
          assert.equal((err as ApiError).statusCode, 400);
          assert.ok(
            (err as ApiError).message.includes('Follow-up assignee must match'),
            'Must enforce Model A ownership match'
          );
          return true;
        }
      );
      console.log('✓ Model A: Follow-up assignment mismatch against lead owner rejected');
    }

    // Test 2: Model A Follow-Up Assignment Matching Owner Allowed
    {
      Lead.findByPk = (async () => ({
        id: 50,
        companyName: 'Acme Corp',
        assignedBdeId: 10, // Owned by BDE 10
        nextFollowUpAt: null,
        save: async () => undefined,
      })) as unknown as typeof Lead.findByPk;

      User.findOne = (async () => ({ id: 10, role: 'BDE', isActive: true })) as unknown as typeof User.findOne;
      FollowUp.findOne = (async () => null) as unknown as typeof FollowUp.findOne;
      Activity.create = (async () => ({})) as unknown as typeof Activity.create;

      let createdPayload: unknown = null;
      FollowUp.create = (async (data: unknown) => {
        createdPayload = data;
        return {
          id: 701,
          ...(data as object),
          reload: async () => ({ id: 701, ...(data as object) }),
        };
      }) as unknown as typeof FollowUp.create;

      const { req, res } = mockReqRes(
        { id: 1, role: 'ADMIN' },
        {
          leadId: 50,
          title: 'Intro Call',
          dueDate: '2026-10-01',
          dueTime: '10:00',
          assignedToId: 10, // Matches lead owner!
        }
      );

      await followupController.createFollowUp(req, res);
      assert.ok(createdPayload !== null);
      assert.equal((createdPayload as { assignedToId: number }).assignedToId, 10);
      console.log('✓ Model A: Matching follow-up assignment allowed');
    }

    // Test 3: Cross-BDE Follow-Up Access Rejected
    // BDE 20 tries to get/update follow-up owned by BDE 10
    {
      FollowUp.findByPk = (async () => ({
        id: 702,
        leadId: 50,
        assignedToId: 10, // Assigned to BDE 10
        lead: { id: 50, assignedBdeId: 10 },
      })) as unknown as typeof FollowUp.findByPk;

      const { req, res } = mockReqRes({ id: 20, role: 'BDE' }, {}, { id: '702' });

      await assert.rejects(
        async () => {
          await followupController.getFollowUp(req, res);
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal((err as ApiError).statusCode, 404); // Scoped notFound to prevent info leak
          return true;
        }
      );
      console.log('✓ Cross-BDE access to follow-up rejected');
    }

    // Test 4: BDE accessing own follow-up allowed
    {
      const mockFollowUp = {
        id: 703,
        leadId: 50,
        assignedToId: 10, // Assigned to BDE 10
        title: 'Check in',
        lead: { id: 50, assignedBdeId: 10 },
        reload: async () => mockFollowUp,
      };
      FollowUp.findByPk = (async () => mockFollowUp) as unknown as typeof FollowUp.findByPk;

      const { req, res, getResponse } = mockReqRes({ id: 10, role: 'BDE' }, {}, { id: '703' });
      await followupController.getFollowUp(req, res);
      const { statusCode, jsonBody } = getResponse();
      assert.equal(statusCode, 200);
      assert.equal((jsonBody as { success: boolean; data: { id: number } }).data.id, 703);
      console.log('✓ BDE accessing own follow-up allowed');
    }

    // Test 5: Admin accessing any follow-up allowed
    {
      const mockFollowUp = {
        id: 704,
        leadId: 50,
        assignedToId: 10,
        title: 'Admin review',
        lead: { id: 50, assignedBdeId: 10 },
        reload: async () => mockFollowUp,
      };
      FollowUp.findByPk = (async () => mockFollowUp) as unknown as typeof FollowUp.findByPk;

      const { req, res, getResponse } = mockReqRes({ id: 1, role: 'ADMIN' }, {}, { id: '704' });
      await followupController.getFollowUp(req, res);
      const { statusCode, jsonBody } = getResponse();
      assert.equal(statusCode, 200);
      assert.equal((jsonBody as { success: boolean; data: { id: number } }).data.id, 704);
      console.log('✓ Admin accessing any follow-up allowed');
    }

    // Test 6: Cross-BDE Lead Access Rejected
    {
      Lead.findByPk = (async () => ({
        id: 55,
        companyName: 'Private Enterprise',
        assignedBdeId: 10,
      })) as unknown as typeof Lead.findByPk;

      const { req, res } = mockReqRes({ id: 20, role: 'BDE' }, {}, { id: '55' });
      await assert.rejects(
        async () => {
          await leadController.getLead(req, res);
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal((err as ApiError).statusCode, 404);
          return true;
        }
      );
      console.log('✓ Cross-BDE access to lead rejected');
    }

    // Test 7: Lead Reassignment Synchronizes Pending Follow-Ups
    // When lead is reassigned from BDE 10 to BDE 20, pending follow-ups must update to BDE 20
    {
      let syncedFollowUpsTo: number | null = null;
      FollowUp.update = (async (values: { assignedToId: number }) => {
        syncedFollowUpsTo = values.assignedToId;
        return [1];
      }) as unknown as typeof FollowUp.update;

      const mockLeadInstance = {
        id: 60,
        companyName: 'Synergy Ltd',
        assignedBdeId: 10,
        save: async () => mockLeadInstance,
        reload: async () => mockLeadInstance,
      };

      Lead.findByPk = (async () => mockLeadInstance) as unknown as typeof Lead.findByPk;

      // Mock user existence check for assignee
      User.findOne = (async () => ({
        id: 20,
        role: 'BDE',
        isActive: true,
        fullName: 'Jane BDE',
      })) as unknown as typeof User.findOne;
      Activity.create = (async () => ({})) as unknown as typeof Activity.create;
      Notification.create = (async () => ({})) as unknown as typeof Notification.create;

      const { req, res, getResponse } = mockReqRes(
        { id: 1, role: 'ADMIN' },
        { assignedBdeId: 20 },
        { id: '60' }
      );

      await leadController.assignLead(req, res);
      const { statusCode } = getResponse();
      assert.equal(statusCode, 200);
      assert.equal(mockLeadInstance.assignedBdeId, 20, 'Lead owner should be updated to BDE 20');
      assert.equal(syncedFollowUpsTo, 20, 'Pending follow-ups must be synchronized to new lead owner');
      console.log('✓ Lead reassignment synchronizes pending follow-ups to new owner (Model A)');
    }
  } finally {
    Lead.findByPk = origLeadFindByPk;
    FollowUp.findByPk = origFollowUpFindByPk;
    FollowUp.findOne = origFollowUpFindOne;
    FollowUp.create = origFollowUpCreate;
    FollowUp.update = origFollowUpUpdate;
    User.findOne = origUserFindOne;
    Activity.create = origActivityCreate;
    Notification.create = origNotificationCreate;
  }
}
