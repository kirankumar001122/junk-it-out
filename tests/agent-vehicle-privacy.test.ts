import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getOrderRoute } from '../app/api/orders/[id]/route';
import { GET as getOrdersRoute } from '../app/api/orders/route';
import { db } from '../lib/db';
import { signToken } from '../lib/auth/jwt';
import { generateReceiptPdfBytes } from '../lib/receiptPdf';

describe('Agent Vehicle Registration Privacy Test Suite', () => {
  const customerToken = signToken({
    userId: 'user-cust-veh-test',
    customerId: 'cust-veh-test',
    phone: '9999911111',
    role: 'CUSTOMER',
  });

  const adminToken = signToken({
    userId: 'user-admin-veh-test',
    phone: '9999922222',
    role: 'ADMIN',
  });

  const agentToken = signToken({
    userId: 'user-agent-veh-test',
    agentId: 'agent-veh-1',
    phone: '9999933333',
    role: 'AGENT',
  });

  const mockActiveOrder = {
    id: 'order-active-veh',
    orderNumber: 'JIO-20261103-VEH01',
    customerId: 'cust-veh-test',
    customer: { userId: 'user-cust-veh-test' },
    agentId: 'agent-veh-1',
    status: 'AGENT_ON_WAY',
    financialDirection: 'CUSTOMER_PAYS',
    paymentStatus: 'CAPTURED',
    agent: {
      id: 'agent-veh-1',
      vehicleType: 'Electric Auto',
      vehicleNumber: 'KA-05-1003',
      rating: 4.9,
      serviceAreas: 'South Bengaluru',
      user: {
        id: 'user-agent-veh',
        name: 'Suresh Raina',
        phone: '9888877777',
        email: 'suresh@junkitout.in',
      },
    },
    items: [],
    address: { area: 'South Bengaluru' },
  };

  const mockCompletedOrder = {
    id: 'order-completed-veh',
    orderNumber: 'JIO-20261103-VEH02',
    customerId: 'cust-veh-test',
    customer: { userId: 'user-cust-veh-test' },
    agentId: 'agent-veh-1',
    status: 'PICKUP_COMPLETED',
    financialDirection: 'CUSTOMER_PAYS',
    paymentStatus: 'CAPTURED',
    agent: {
      id: 'agent-veh-1',
      vehicleType: 'Tata Ace',
      vehicleNumber: 'KA-05-1003',
      rating: 4.8,
      serviceAreas: 'South Bengaluru',
      user: {
        id: 'user-agent-veh',
        name: 'Suresh Raina',
        phone: '9888877777',
        email: 'suresh@junkitout.in',
      },
    },
    items: [],
    address: { area: 'South Bengaluru' },
  };

  // --------------------------------------------------------------------------
  // 1. Customer API: Detail Endpoint (GET /api/orders/[id])
  // --------------------------------------------------------------------------
  describe('1. Customer API Order Detail (GET /api/orders/[id])', () => {
    it('redacts vehicle registration number to null for active pickups while keeping vehicleType and name', async () => {
      const orderDelegate = db.order as any;
      (db as any).user = { ...(db as any).user, findUnique: async () => ({ tokenVersion: 1 }) };
      (db as any).agentLocation = { findMany: async () => [] };
      orderDelegate.findFirst = async () => mockActiveOrder;

      const res = await getOrderRoute(
        new NextRequest(`http://localhost/api/orders/order-active-veh`, {
          headers: { Cookie: `jio_token=${customerToken}` },
        }),
        { params: Promise.resolve({ id: 'order-active-veh' }) }
      );

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.data.agent.vehicleNumber, null, 'Customer must not see vehicle registration number');
      assert.equal(json.data.agent.vehicleType, 'Electric Auto', 'Vehicle type must remain visible');
      assert.equal(json.data.agent.user.name, 'Suresh Raina', 'Agent name must remain visible');
      assert.equal(json.data.agent.rating, 4.9, 'Agent rating must remain visible');
    });

    it('redacts vehicle registration number to null for completed pickups', async () => {
      const orderDelegate = db.order as any;
      (db as any).user = { ...(db as any).user, findUnique: async () => ({ tokenVersion: 1 }) };
      (db as any).agentLocation = { findMany: async () => [] };
      orderDelegate.findFirst = async () => mockCompletedOrder;

      const res = await getOrderRoute(
        new NextRequest(`http://localhost/api/orders/order-completed-veh`, {
          headers: { Cookie: `jio_token=${customerToken}` },
        }),
        { params: Promise.resolve({ id: 'order-completed-veh' }) }
      );

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.data.agent.vehicleNumber, null, 'Customer must not see vehicle registration number on completed orders');
      assert.equal(json.data.agent.vehicleType, 'Tata Ace');
      assert.equal(json.data.agent.user.phone, null, 'Phone must also be redacted on completed orders');
    });
  });

  // --------------------------------------------------------------------------
  // 2. Customer API: List Endpoint (GET /api/orders)
  // --------------------------------------------------------------------------
  describe('2. Customer API Order List (GET /api/orders)', () => {
    it('redacts vehicle registration number across customer order list', async () => {
      const orderDelegate = db.order as any;
      (db as any).user = { ...(db as any).user, findUnique: async () => ({ tokenVersion: 1 }) };
      (db as any).customer = { findUnique: async () => ({ id: 'cust-veh-test' }) };
      orderDelegate.findMany = async () => [mockActiveOrder, mockCompletedOrder];
      orderDelegate.count = async () => 2;

      const res = await getOrdersRoute(
        new NextRequest('http://localhost/api/orders', {
          headers: { Cookie: `jio_token=${customerToken}` },
        })
      );

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.data[0].agent.vehicleNumber, null);
      assert.equal(json.data[0].agent.vehicleType, 'Electric Auto');
      assert.equal(json.data[1].agent.vehicleNumber, null);
      assert.equal(json.data[1].agent.vehicleType, 'Tata Ace');
    });
  });

  // --------------------------------------------------------------------------
  // 3. Admin API: Registration Number Retained
  // --------------------------------------------------------------------------
  describe('3. Admin API Access (Authorized Administrative Workflows)', () => {
    it('retains vehicle registration number in admin order detail API', async () => {
      const orderDelegate = db.order as any;
      (db as any).user = { ...(db as any).user, findUnique: async () => ({ tokenVersion: 1 }) };
      (db as any).agentLocation = { findMany: async () => [] };
      orderDelegate.findFirst = async () => mockActiveOrder;

      const res = await getOrderRoute(
        new NextRequest(`http://localhost/api/orders/order-active-veh`, {
          headers: { Cookie: `jio_token=${adminToken}` },
        }),
        { params: Promise.resolve({ id: 'order-active-veh' }) }
      );

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.data.agent.vehicleNumber, 'KA-05-1003', 'Admin must retain vehicle registration number');
    });

    it('retains vehicle registration number in admin order list API', async () => {
      const orderDelegate = db.order as any;
      (db as any).user = { ...(db as any).user, findUnique: async () => ({ tokenVersion: 1 }) };
      orderDelegate.findMany = async () => [mockActiveOrder];
      orderDelegate.count = async () => 1;

      const res = await getOrdersRoute(
        new NextRequest('http://localhost/api/orders', {
          headers: { Cookie: `jio_token=${adminToken}` },
        })
      );

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.data[0].agent.vehicleNumber, 'KA-05-1003', 'Admin must retain vehicle registration number');
    });
  });

  // --------------------------------------------------------------------------
  // 4. Agent / Internal Workflows
  // --------------------------------------------------------------------------
  describe('4. Agent / Internal Workflows', () => {
    it('retains vehicle registration details for authorized agent requests', async () => {
      const orderDelegate = db.order as any;
      (db as any).user = { ...(db as any).user, findUnique: async () => ({ tokenVersion: 1 }) };
      (db as any).agent = {
        findUnique: async () => ({
          id: 'agent-veh-1',
          serviceAreas: 'South Bengaluru',
        }),
      };
      (db as any).agentLocation = { findMany: async () => [] };
      orderDelegate.findFirst = async () => mockActiveOrder;

      const res = await getOrderRoute(
        new NextRequest(`http://localhost/api/orders/order-active-veh`, {
          headers: { Cookie: `jio_token=${agentToken}` },
        }),
        { params: Promise.resolve({ id: 'order-active-veh' }) }
      );

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.data.agent.vehicleNumber, 'KA-05-1003', 'Agent must retain vehicle registration number');
    });
  });

  // --------------------------------------------------------------------------
  // 5. Customer PDF Receipt Privacy
  // --------------------------------------------------------------------------
  describe('5. Customer PDF Receipt Privacy', () => {
    it('does not leak agent vehicle registration number onto the customer receipt PDF', () => {
      const pdfBytes = generateReceiptPdfBytes(mockActiveOrder);
      const pdfString = Buffer.from(pdfBytes).toString('latin1');
      assert.equal(
        pdfString.includes('KA-05-1003'),
        false,
        'Customer PDF receipt must not include agent vehicle registration number'
      );
      assert.equal(
        pdfString.includes('Suresh Raina'),
        true,
        'Customer PDF receipt should retain agent name'
      );
      assert.equal(
        pdfString.includes('Electric Auto'),
        true,
        'Customer PDF receipt should retain vehicle type'
      );
    });
  });
});
