import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getOrderRoute } from '../app/api/orders/[id]/route';
import { GET as getOrdersRoute } from '../app/api/orders/route';
import { db } from '../lib/db';
import { signToken } from '../lib/auth/jwt';
import {
  canCustomerContactAgent,
  shouldHideAgentContact,
  isPickupCompletedStatus,
} from '../lib/orders/lifecycle';

describe('Agent Contact Privacy & Phone Number Visibility Test Suite', () => {
  // --------------------------------------------------------------------------
  // 1. Lifecycle Status Visibility Invariants
  // --------------------------------------------------------------------------
  describe('1. Lifecycle Status Visibility Helpers', () => {
    it('Scenario 1: AGENT_ASSIGNED allows customer to contact agent', () => {
      assert.equal(canCustomerContactAgent('AGENT_ASSIGNED'), true);
      assert.equal(shouldHideAgentContact('AGENT_ASSIGNED'), false);
    });

    it('Scenario 2: AGENT_ACCEPTED allows customer to contact agent', () => {
      assert.equal(canCustomerContactAgent('AGENT_ACCEPTED'), true);
      assert.equal(shouldHideAgentContact('AGENT_ACCEPTED'), false);
    });

    it('Scenario 3: AGENT_ON_WAY allows customer to contact agent', () => {
      assert.equal(canCustomerContactAgent('AGENT_ON_WAY'), true);
      assert.equal(shouldHideAgentContact('AGENT_ON_WAY'), false);
    });

    it('Scenario 4: AGENT_ARRIVED allows customer to contact agent', () => {
      assert.equal(canCustomerContactAgent('AGENT_ARRIVED'), true);
      assert.equal(shouldHideAgentContact('AGENT_ARRIVED'), false);
    });

    it('Scenario 5: WEIGHING_WASTE and WEIGHING allow customer to contact agent', () => {
      assert.equal(canCustomerContactAgent('WEIGHING_WASTE'), true);
      assert.equal(canCustomerContactAgent('WEIGHING'), true);
      assert.equal(canCustomerContactAgent('WASTE_VERIFICATION'), true);
      assert.equal(shouldHideAgentContact('WEIGHING_WASTE'), false);
      assert.equal(shouldHideAgentContact('WEIGHING'), false);
    });

    it('Scenario 6: PICKUP_COMPLETED strictly hides agent contact', () => {
      assert.equal(canCustomerContactAgent('PICKUP_COMPLETED'), false);
      assert.equal(shouldHideAgentContact('PICKUP_COMPLETED'), true);
      assert.equal(isPickupCompletedStatus('PICKUP_COMPLETED'), true);
    });

    it('Scenario 7: SETTLEMENT_DONE strictly hides agent contact', () => {
      assert.equal(canCustomerContactAgent('SETTLEMENT_DONE'), false);
      assert.equal(shouldHideAgentContact('SETTLEMENT_DONE'), true);
      assert.equal(isPickupCompletedStatus('SETTLEMENT_DONE'), true);
    });

    it('Terminal statuses (SETTLEMENT_COMPLETED, COMPLETED, CANCELLED) strictly hide agent contact', () => {
      assert.equal(canCustomerContactAgent('SETTLEMENT_COMPLETED'), false);
      assert.equal(canCustomerContactAgent('COMPLETED'), false);
      assert.equal(canCustomerContactAgent('CANCELLED'), false);

      assert.equal(shouldHideAgentContact('SETTLEMENT_COMPLETED'), true);
      assert.equal(shouldHideAgentContact('COMPLETED'), true);
      assert.equal(shouldHideAgentContact('CANCELLED'), true);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Customer vs Admin API Exposure for Single Order Tracking
  // --------------------------------------------------------------------------
  describe('2. Order Tracking API Contact Redaction (GET /api/orders/[id])', () => {
    const customerToken = signToken({
      userId: 'user-cust-1',
      customerId: 'cust-1',
      phone: '9999999999',
      role: 'CUSTOMER',
    });

    const adminToken = signToken({
      userId: 'user-admin-1',
      phone: '9888888888',
      role: 'ADMIN',
    });

    const mockOrderBase = {
      id: 'order-uuid-1234',
      orderNumber: 'JIO-20261103-TEST01',
      customerId: 'cust-1',
      customer: { userId: 'user-cust-1' },
      agentId: 'agent-1',
      agent: {
        id: 'agent-1',
        vehicleType: 'Tata Ace',
        vehicleNumber: 'KA-01-AB-1234',
        user: {
          id: 'user-agent-1',
          name: 'Ramesh Kumar',
          phone: '9876543210',
          email: 'ramesh@junkitout.in',
        },
      },
    };

    const makeRequest = (id: string, token: string) => {
      return getOrderRoute(
        new NextRequest(`http://localhost/api/orders/${encodeURIComponent(id)}`, {
          headers: { Cookie: `jio_token=${token}` },
        }),
        { params: Promise.resolve({ id }) }
      );
    };

    it('exposes agent phone to customer when order is in active pickup state (e.g. AGENT_ON_WAY, WEIGHING_WASTE)', async () => {
      const orderDelegate = db.order as any;
      (db as any).user = { ...(db as any).user, findUnique: async () => ({ tokenVersion: 1 }) };
      (db as any).agentLocation = { findMany: async () => [] };

      orderDelegate.findFirst = async () => ({
        ...mockOrderBase,
        status: 'AGENT_ON_WAY',
      });

      const res = await makeRequest('order-uuid-1234', customerToken);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.data.agent.user.name, 'Ramesh Kumar');
      assert.equal(json.data.agent.user.phone, '9876543210', 'Active pickup must expose agent phone');
    });

    it('Scenario 8: Customer API response after completion (PICKUP_COMPLETED) must NOT expose the phone number', async () => {
      const orderDelegate = db.order as any;
      (db as any).user = { ...(db as any).user, findUnique: async () => ({ tokenVersion: 1 }) };
      (db as any).agentLocation = { findMany: async () => [] };

      orderDelegate.findFirst = async () => ({
        ...mockOrderBase,
        status: 'PICKUP_COMPLETED',
      });

      const res = await makeRequest('order-uuid-1234', customerToken);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.data.agent.user.name, 'Ramesh Kumar');
      assert.equal(json.data.agent.user.phone, null, 'Customer API response must have phone set to null after PICKUP_COMPLETED');
    });

    it('Customer API response after SETTLEMENT_DONE must NOT expose the phone number', async () => {
      const orderDelegate = db.order as any;
      (db as any).user = { ...(db as any).user, findUnique: async () => ({ tokenVersion: 1 }) };
      (db as any).agentLocation = { findMany: async () => [] };

      orderDelegate.findFirst = async () => ({
        ...mockOrderBase,
        status: 'SETTLEMENT_DONE',
      });

      const res = await makeRequest('order-uuid-1234', customerToken);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.data.agent.user.phone, null, 'Customer API response must have phone set to null after SETTLEMENT_DONE');
    });

    it('Scenario 9: Authorized admin view must still retain agent contact details for completed pickups', async () => {
      const orderDelegate = db.order as any;
      (db as any).user = { ...(db as any).user, findUnique: async () => ({ tokenVersion: 1 }) };
      (db as any).agentLocation = { findMany: async () => [] };

      orderDelegate.findFirst = async () => ({
        ...mockOrderBase,
        status: 'PICKUP_COMPLETED',
      });

      const res = await makeRequest('order-uuid-1234', adminToken);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.data.agent.user.name, 'Ramesh Kumar');
      assert.equal(
        json.data.agent.user.phone,
        '9876543210',
        'Authorized admin view must retain agent contact details even for completed pickups'
      );
    });

    it('Refresh Scenario: Refreshing the tracking page after pickup completion consistently redacts phone', async () => {
      const orderDelegate = db.order as any;
      (db as any).user = { ...(db as any).user, findUnique: async () => ({ tokenVersion: 1 }) };
      (db as any).agentLocation = { findMany: async () => [] };

      orderDelegate.findFirst = async () => ({
        ...mockOrderBase,
        status: 'PICKUP_COMPLETED',
      });

      // First load after completion
      const res1 = await makeRequest('order-uuid-1234', customerToken);
      const json1 = await res1.json();
      assert.equal(json1.data.agent.user.phone, null);

      // Subsequent refresh
      const res2 = await makeRequest('order-uuid-1234', customerToken);
      const json2 = await res2.json();
      assert.equal(json2.data.agent.user.phone, null, 'Page refresh must never leak agent phone');
    });
  });

  // --------------------------------------------------------------------------
  // 3. Customer Order List API Contact Redaction (GET /api/orders)
  // --------------------------------------------------------------------------
  describe('3. Order List API Contact Redaction (GET /api/orders)', () => {
    const customerToken = signToken({
      userId: 'user-cust-1',
      customerId: 'cust-1',
      phone: '9999999999',
      role: 'CUSTOMER',
    });

    const adminToken = signToken({
      userId: 'user-admin-1',
      phone: '9888888888',
      role: 'ADMIN',
    });

    it('redacts agent phone for completed orders in customer order list while preserving it for active orders', async () => {
      const orderDelegate = db.order as any;
      (db as any).user = { ...(db as any).user, findUnique: async () => ({ tokenVersion: 1 }) };

      orderDelegate.findMany = async () => [
        {
          id: 'order-1',
          status: 'AGENT_ON_WAY',
          agent: {
            user: { name: 'Agent Active', phone: '9876543210' },
          },
        },
        {
          id: 'order-2',
          status: 'PICKUP_COMPLETED',
          agent: {
            user: { name: 'Agent Done', phone: '9876543210' },
          },
        },
      ];
      orderDelegate.count = async () => 2;

      const req = new NextRequest('http://localhost/api/orders', {
        headers: { Cookie: `jio_token=${customerToken}` },
      });
      const res = await getOrdersRoute(req);
      assert.equal(res.status, 200);
      const json = await res.json();

      const activeOrder = json.data.find((o: any) => o.id === 'order-1');
      const completedOrder = json.data.find((o: any) => o.id === 'order-2');

      assert.equal(activeOrder.agent.user.phone, '9876543210');
      assert.equal(completedOrder.agent.user.phone, null);
    });

    it('preserves agent phone for all orders in authorized admin order list', async () => {
      const orderDelegate = db.order as any;
      (db as any).user = { ...(db as any).user, findUnique: async () => ({ tokenVersion: 1 }) };

      orderDelegate.findMany = async () => [
        {
          id: 'order-2',
          status: 'PICKUP_COMPLETED',
          agent: {
            user: { name: 'Agent Done', phone: '9876543210' },
          },
        },
      ];
      orderDelegate.count = async () => 1;

      const req = new NextRequest('http://localhost/api/orders', {
        headers: { Cookie: `jio_token=${adminToken}` },
      });
      const res = await getOrdersRoute(req);
      assert.equal(res.status, 200);
      const json = await res.json();

      const completedOrder = json.data.find((o: any) => o.id === 'order-2');
      assert.equal(completedOrder.agent.user.phone, '9876543210', 'Admin must see agent phone');
    });
  });
});
