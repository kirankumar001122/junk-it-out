import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/orders/[id]/assign/route';
import { db } from '../lib/db';
import { signToken } from '../lib/auth/jwt';
import { validateStatusTransition } from '../lib/validations/schemas';

describe('Admin Dashboard Order Assignment and Status Invariants', () => {
  let adminToken: string;
  let nonAdminToken: string;
  const testAdminUserId = 'admin-uuid-1234';
  const testAgentId = 'agent-uuid-5678';
  const testAgentUserId = 'agent-user-uuid-9999';
  const testCustUserId = 'customer-user-uuid-0000';
  const activeOrderId = 'active-order-1111';
  const completedOrderId = 'completed-order-2222';

  beforeAll(() => {
    adminToken = signToken({
      userId: testAdminUserId,
      phone: '+919988776655',
      role: 'ADMIN',
      tokenVersion: 1,
    });

    nonAdminToken = signToken({
      userId: testCustUserId,
      phone: '+919911223344',
      role: 'CUSTOMER',
      tokenVersion: 1,
    });

    // Mock db.user.findUnique for auth middleware
    (db.user as any).findUnique = async (args: any) => {
      const id = args?.where?.id;
      if (id === testAdminUserId) {
        return {
          id: testAdminUserId,
          role: 'ADMIN',
          tokenVersion: 1,
          phone: '+919988776655',
        };
      }
      return {
        id: testCustUserId,
        role: 'CUSTOMER',
        tokenVersion: 1,
        phone: '+919911223344',
      };
    };

    // Mock db.agent.findUnique to return AVAILABLE agent with user info
    (db.agent as any).findUnique = async (args: any) => {
      const id = args?.where?.id;
      if (id === testAgentId) {
        return {
          id: testAgentId,
          status: 'AVAILABLE',
          vehicleNumber: 'KA-01-AB-1234',
          vehicleType: 'Tata Ace',
          userId: testAgentUserId,
          user: {
            id: testAgentUserId,
            name: 'Audit Field Agent',
            phone: '+919966554433',
            email: 'agent@junkitout.in',
            role: 'AGENT',
          },
          tokenVersion: 1,
        };
      }
      return null;
    };

    // Mock db.order.findUnique
    (db.order as any).findUnique = async (args: any) => {
      const id = args?.where?.id;
      if (id === activeOrderId) {
        return {
          id: activeOrderId,
          orderNumber: 'JIO-TEST-ACTIVE',
          status: 'BOOKING_RECEIVED',
          agentId: null,
          customer: {
            userId: testCustUserId,
            user: { id: testCustUserId, name: 'Customer', phone: '+919911223344' },
          },
          agent: null,
        };
      }
      if (id === completedOrderId) {
        return {
          id: completedOrderId,
          orderNumber: 'JIO-TEST-COMPLETED',
          status: 'PICKUP_COMPLETED',
          agentId: testAgentId,
          customer: {
            userId: testCustUserId,
            user: { id: testCustUserId, name: 'Customer', phone: '+919911223344' },
          },
          agent: {
            id: testAgentId,
            user: { id: testAgentUserId, name: 'Audit Field Agent', phone: '+919966554433' },
          },
        };
      }
      return null;
    };

    // Mock db.$transaction
    (db as any).$transaction = async (fn: any) => {
      const tx = {
        order: {
          updateMany: async () => ({ count: 1 }),
          findUnique: async () => ({
            id: activeOrderId,
            orderNumber: 'JIO-TEST-ACTIVE',
            status: 'AGENT_ASSIGNED',
            agentId: testAgentId,
            agent: { user: { name: 'Audit Field Agent', phone: '+919966554433' } },
            customer: { user: { name: 'Customer', phone: '+919911223344' } },
          }),
        },
        orderStatusHistory: { create: async () => ({}) },
        notification: {
          create: async () => ({}),
          createMany: async () => ({ count: 1 }),
        },
        agent: { update: async () => ({}) },
        auditLog: { create: async () => ({}) },
      };
      return fn(tx);
    };
  });

  it('rejects order assignment when user is not an authenticated admin (403)', async () => {
    const req = new NextRequest(`http://localhost:3007/api/orders/${activeOrderId}/assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${nonAdminToken}`,
      },
      body: JSON.stringify({ agentId: testAgentId }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: activeOrderId }) });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('successfully assigns an available agent to an active order (200)', async () => {
    const req = new NextRequest(`http://localhost:3007/api/orders/${activeOrderId}/assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ agentId: testAgentId }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: activeOrderId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('AGENT_ASSIGNED');
  });

  it('rejects assigning agent to an already completed order (400)', async () => {
    const req = new NextRequest(`http://localhost:3007/api/orders/${completedOrderId}/assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ agentId: testAgentId }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: completedOrderId }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_STATUS_TRANSITION');
    expect(body.error.message).toContain('PICKUP_COMPLETED');
  });

  it('validates status transition table invariants for completed and cancelled orders', () => {
    expect(validateStatusTransition('PICKUP_COMPLETED', 'AGENT_ASSIGNED')).toBe(false);
    expect(validateStatusTransition('SETTLEMENT_COMPLETED', 'AGENT_ASSIGNED')).toBe(false);
    expect(validateStatusTransition('CANCELLED', 'AGENT_ASSIGNED')).toBe(false);
    expect(validateStatusTransition('BOOKING_RECEIVED', 'AGENT_ASSIGNED')).toBe(true);
    expect(validateStatusTransition('AGENT_ASSIGNED', 'AGENT_ASSIGNED')).toBe(true);
  });
});
