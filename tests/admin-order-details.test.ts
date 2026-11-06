import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { GET as getOrderDetailRoute } from '../app/api/orders/[id]/route';
import { POST as assignOrderRoute } from '../app/api/orders/[id]/assign/route';
import { db } from '../lib/db';
import { signToken } from '../lib/auth/jwt';

describe('Admin Orders Management: View Button & Order Details Route', () => {
  const adminUserId = 'admin-user-id-view-test';
  const superAdminUserId = 'super-admin-user-id-view-test';
  const customerUserId = 'customer-user-id-view-test';
  const otherCustomerUserId = 'other-customer-user-id-view-test';
  const agentUserId = 'agent-user-id-view-test';
  const agentProfileId = 'agent-profile-id-view-test';
  const targetOrderId = 'order-view-uuid-1111';

  let adminToken: string;
  let superAdminToken: string;
  let customerToken: string;
  let otherCustomerToken: string;

  const originalUserFindUnique = (db.user as any).findUnique;
  const originalOrderFindFirst = (db.order as any).findFirst;
  const originalOrderFindUnique = (db.order as any).findUnique;
  const originalAgentFindUnique = (db.agent as any).findUnique;
  const originalTransaction = (db as any).$transaction;

  const mockAdminOrderData = {
    id: targetOrderId,
    orderNumber: 'JIO-VIEW-20261106-0001',
    status: 'BOOKING_RECEIVED',
    financialDirection: 'CUSTOMER_PAYS',
    estimatedTotal: 250.0,
    actualTotal: 280.0,
    pickupCharge: 40.0,
    discountAmount: 10.0,
    finalAmount: 270.0,
    paymentStatus: 'PAID',
    scheduledSlot: '10:00 AM - 12:00 PM',
    createdAt: new Date('2026-11-06T09:00:00Z'),
    customerId: 'cust-view-1',
    customer: {
      id: 'cust-view-1',
      userId: customerUserId,
      user: {
        id: customerUserId,
        name: 'Suresh Kumar',
        phone: '+919876543210',
        email: 'suresh@example.com',
      },
    },
    agentId: agentProfileId,
    agent: {
      id: agentProfileId,
      vehicleNumber: 'KA-05-JK-9988',
      vehicleType: 'Pickup Mini',
      rating: 4.8,
      userId: agentUserId,
      user: {
        id: agentUserId,
        name: 'Ramesh Agent',
        phone: '+919876543211',
        email: 'ramesh@junkitout.in',
      },
    },
    address: {
      houseNo: '24/B',
      street: '12th Main, 4th Block',
      area: 'Koramangala',
      city: 'Bengaluru',
      pincode: '560034',
      lat: 12.9352,
      lng: 77.6245,
      pickupInstructions: 'Ring bell on 2nd floor',
    },
    items: [
      {
        id: 'item-1',
        category: 'Old Newspapers',
        type: 'DRY_SCRAP',
        estimatedWeight: 15.0,
        scaleWeight: 16.5,
        pricePerKg: 14.0,
        subtotal: 231.0,
        wasteCategory: {
          id: 'cat-1',
          name: 'Old Newspapers',
          pricePerKg: 14.0,
          description: 'Dry newspapers and magazines',
        },
      },
      {
        id: 'item-2',
        category: 'Broken Electronics',
        type: 'E_WASTE',
        estimatedWeight: 5.0,
        scaleWeight: 5.0,
        pricePerKg: 20.0,
        subtotal: 100.0,
        wasteCategory: {
          id: 'cat-2',
          name: 'E-Waste',
          pricePerKg: 20.0,
          description: 'Small electronics and adapters',
        },
      },
    ],
    payments: [
      {
        id: 'pay-1',
        amount: 270.0,
        status: 'SUCCESS',
        method: 'UPI',
        gatewayOrderId: 'order_rzp_123',
        createdAt: new Date('2026-11-06T09:30:00Z'),
      },
    ],
    statusHistory: [
      {
        id: 'hist-1',
        oldStatus: null,
        newStatus: 'BOOKING_RECEIVED',
        notes: 'Order placed by customer via web',
        createdAt: new Date('2026-11-06T09:00:00Z'),
      },
    ],
    settlement: {
      totalWeightKg: 21.5,
      amount: 270.0,
      status: 'READY_FOR_PAYOUT',
    },
  };

  beforeAll(() => {
    adminToken = signToken({
      userId: adminUserId,
      phone: '+919900000001',
      role: 'ADMIN',
      tokenVersion: 1,
    });

    superAdminToken = signToken({
      userId: superAdminUserId,
      phone: '+919900000002',
      role: 'SUPER_ADMIN',
      tokenVersion: 1,
    });

    customerToken = signToken({
      userId: customerUserId,
      customerId: 'cust-view-1',
      phone: '+919876543210',
      role: 'CUSTOMER',
      tokenVersion: 1,
    });

    otherCustomerToken = signToken({
      userId: otherCustomerUserId,
      customerId: 'cust-view-2',
      phone: '+919876543299',
      role: 'CUSTOMER',
      tokenVersion: 1,
    });

    // Mock db.user.findUnique
    (db.user as any).findUnique = async ({ where }: any) => {
      if (where?.id === adminUserId) {
        return { id: adminUserId, role: 'ADMIN', tokenVersion: 1, phone: '+919900000001' };
      }
      if (where?.id === superAdminUserId) {
        return { id: superAdminUserId, role: 'SUPER_ADMIN', tokenVersion: 1, phone: '+919900000002' };
      }
      if (where?.id === customerUserId) {
        return { id: customerUserId, role: 'CUSTOMER', tokenVersion: 1, phone: '+919876543210' };
      }
      if (where?.id === otherCustomerUserId) {
        return { id: otherCustomerUserId, role: 'CUSTOMER', tokenVersion: 1, phone: '+919876543299' };
      }
      return null;
    };

    // Mock db.order.findFirst
    (db.order as any).findFirst = async ({ where }: any) => {
      const match =
        where?.id === targetOrderId ||
        where?.orderNumber === mockAdminOrderData.orderNumber ||
        (Array.isArray(where?.OR) &&
          where.OR.some(
            (cond: any) =>
              cond?.id === targetOrderId ||
              cond?.orderNumber === mockAdminOrderData.orderNumber,
          ));

      if (match) {
        return mockAdminOrderData;
      }
      return null;
    };

    // Mock db.order.findUnique
    (db.order as any).findUnique = async ({ where }: any) => {
      if (where?.id === targetOrderId) {
        return {
          ...mockAdminOrderData,
          agentId: null,
          agent: null,
        };
      }
      return null;
    };

    // Mock db.agent.findUnique
    (db.agent as any).findUnique = async ({ where }: any) => {
      if (where?.id === agentProfileId) {
        return {
          id: agentProfileId,
          status: 'AVAILABLE',
          vehicleNumber: 'KA-05-JK-9988',
          vehicleType: 'Pickup Mini',
          userId: agentUserId,
          user: {
            id: agentUserId,
            name: 'Ramesh Agent',
            phone: '+919876543211',
            email: 'ramesh@junkitout.in',
            role: 'AGENT',
          },
        };
      }
      return null;
    };

    // Mock db.$transaction for assign order
    (db as any).$transaction = async (fn: any) => {
      const tx = {
        order: {
          updateMany: async () => ({ count: 1 }),
          findUnique: async () => ({
            ...mockAdminOrderData,
            status: 'AGENT_ASSIGNED',
            agentId: agentProfileId,
            agent: {
              id: agentProfileId,
              user: {
                id: agentUserId,
                name: 'Ramesh Agent',
                phone: '+919876543211',
                email: 'ramesh@junkitout.in',
                role: 'AGENT',
              },
            },
          }),
        },
        orderStatusHistory: { create: async () => ({ id: 'hist-assign' }) },
        notification: {
          create: async () => ({ id: 'notif-1' }),
          createMany: async () => ({ count: 1 }),
        },
        agent: { update: async () => ({}) },
        auditLog: { create: async () => ({ id: 'audit-assign' }) },
      };
      return fn(tx);
    };
  });

  afterAll(() => {
    (db.user as any).findUnique = originalUserFindUnique;
    (db.order as any).findFirst = originalOrderFindFirst;
    (db.order as any).findUnique = originalOrderFindUnique;
    (db.agent as any).findUnique = originalAgentFindUnique;
    (db as any).$transaction = originalTransaction;
  });

  describe('1. Orders Management Navigation Target Verification', () => {
    it('apps/admin orders page View button points to internal admin orders route /orders/${o.id}', () => {
      const ordersPagePath = resolve(process.cwd(), 'apps/admin/app/(dashboard)/orders/page.tsx');
      expect(existsSync(ordersPagePath)).toBe(true);

      const content = readFileSync(ordersPagePath, 'utf8');
      expect(content).toMatch(/href=\{`\/orders\/\$\{o\.id\}`\}/);
      expect(content).not.toMatch(/href=\{`\/app\/orders/);
    });

    it('root admin orders page View button points to /admin/orders/${o.id}', () => {
      const rootOrdersPagePath = resolve(process.cwd(), 'app/admin/(dashboard)/orders/page.tsx');
      expect(existsSync(rootOrdersPagePath)).toBe(true);

      const content = readFileSync(rootOrdersPagePath, 'utf8');
      expect(content).toMatch(/href=\{`\/admin\/orders\/\$\{o\.id\}`\}/);
    });
  });

  describe('2. Admin Order Details Page Exists with Full UI Capabilities', () => {
    it('apps/admin has orders/[id]/page.tsx implementing all required sections', () => {
      const pagePath = resolve(process.cwd(), 'apps/admin/app/(dashboard)/orders/[id]/page.tsx');
      expect(existsSync(pagePath)).toBe(true);

      const content = readFileSync(pagePath, 'utf8');
      // Back navigation
      expect(content).toMatch(/\/orders/);
      // Customer profile
      expect(content).toMatch(/Customer/);
      // Agent assignment
      expect(content).toMatch(/Agent/);
      // Pickup address
      expect(content).toMatch(/Pickup Address/i);
      // Waste items & scale weights
      expect(content).toMatch(/Waste Items & Weights|Waste/i);
      // Financial breakdown & settlements
      expect(content).toMatch(/Financials & Settlement|Financials/i);
      // Chronological audit timeline
      expect(content).toMatch(/Order Timeline|Timeline/i);
      // Agent assignment modal
      expect(content).toMatch(/Assign Field Agent|Assign/i);
      // Error handling (400, 404, network retry)
      expect(content).toMatch(/Order Not Found|404|Error/i);
    });

    it('root app has admin/(dashboard)/orders/[id]/page.tsx implementing the required sections', () => {
      const pagePath = resolve(process.cwd(), 'app/admin/(dashboard)/orders/[id]/page.tsx');
      expect(existsSync(pagePath)).toBe(true);

      const content = readFileSync(pagePath, 'utf8');
      expect(content).toMatch(/\/admin\/orders/);
      expect(content).toMatch(/Customer/);
      expect(content).toMatch(/Pickup Address/i);
      expect(content).toMatch(/Order Timeline|Timeline/i);
    });
  });

  describe('3. Order Details API Access & Data Integrity', () => {
    it('rejects unauthenticated request with 401', async () => {
      const req = new NextRequest(`http://localhost/api/orders/${targetOrderId}`);
      const res = await getOrderDetailRoute(req, {
        params: Promise.resolve({ id: targetOrderId }),
      });
      expect(res.status).toBe(401);
    });

    it('rejects unauthorized customer (not order owner) with 403', async () => {
      const req = new NextRequest(`http://localhost/api/orders/${targetOrderId}`, {
        headers: { Cookie: `jio_token=${otherCustomerToken}` },
      });
      const res = await getOrderDetailRoute(req, {
        params: Promise.resolve({ id: targetOrderId }),
      });
      expect(res.status).toBe(403);
    });

    it('allows ADMIN to fetch complete order details with all sub-resources', async () => {
      const req = new NextRequest(`http://localhost/api/orders/${targetOrderId}`, {
        headers: { Cookie: `jio_token=${adminToken}` },
      });
      const res = await getOrderDetailRoute(req, {
        params: Promise.resolve({ id: targetOrderId }),
      });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      const data = json.data;

      // Basic fields
      expect(data.id).toBe(targetOrderId);
      expect(data.orderNumber).toBe('JIO-VIEW-20261106-0001');
      expect(data.status).toBe('BOOKING_RECEIVED');

      // Customer info
      expect(data.customer.user.name).toBe('Suresh Kumar');
      expect(data.customer.user.phone).toBe('+919876543210');

      // Agent info
      expect(data.agent.user.name).toBe('Ramesh Agent');
      expect(data.agent.vehicleNumber).toBe('KA-05-JK-9988');

      // Address
      expect(data.address.street).toBe('12th Main, 4th Block');
      expect(data.address.area).toBe('Koramangala');
      expect(data.address.city).toBe('Bengaluru');

      // Items & weights
      expect(data.items.length).toBe(2);
      expect(data.items[0].scaleWeight).toBe(16.5);
      expect(data.items[0].subtotal).toBe(231.0);

      // Financials
      expect(data.estimatedTotal).toBe(250.0);
      expect(data.actualTotal).toBe(280.0);
      expect(data.finalAmount).toBe(270.0);
      expect(data.paymentStatus).toBe('PAID');

      // Timeline
      expect(data.statusHistory.length).toBeGreaterThan(0);
      expect(data.statusHistory[0].newStatus).toBe('BOOKING_RECEIVED');
    });

    it('allows SUPER_ADMIN to fetch complete order details', async () => {
      const req = new NextRequest(`http://localhost/api/orders/${targetOrderId}`, {
        headers: { Cookie: `jio_token=${superAdminToken}` },
      });
      const res = await getOrderDetailRoute(req, {
        params: Promise.resolve({ id: targetOrderId }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.orderNumber).toBe('JIO-VIEW-20261106-0001');
    });

    it('returns 404 for non-existent order ID', async () => {
      const req = new NextRequest('http://localhost/api/orders/non-existent-order-id', {
        headers: { Cookie: `jio_token=${adminToken}` },
      });
      const res = await getOrderDetailRoute(req, {
        params: Promise.resolve({ id: 'non-existent-order-id' }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('4. Order Assignment Action Invariants', () => {
    it('rejects assignment by customer with 403', async () => {
      const req = new NextRequest(`http://localhost/api/orders/${targetOrderId}/assign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `jio_token=${customerToken}`,
        },
        body: JSON.stringify({ agentId: agentProfileId }),
      });
      const res = await assignOrderRoute(req, {
        params: Promise.resolve({ id: targetOrderId }),
      });
      expect(res.status).toBe(403);
    });

    it('allows ADMIN to assign an agent to an order', async () => {
      const req = new NextRequest(`http://localhost/api/orders/${targetOrderId}/assign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `jio_token=${adminToken}`,
        },
        body: JSON.stringify({ agentId: agentProfileId }),
      });
      const res = await assignOrderRoute(req, {
        params: Promise.resolve({ id: targetOrderId }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });
});
