import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET as getAdminStats } from '../app/api/admin/stats/route';
import { db } from '../lib/db';
import { signToken } from '../lib/auth/jwt';

async function run() {
  const paymentDelegate = db.payment as any;
  const settlementDelegate = db.settlement as any;
  const orderDelegate = db.order as any;
  const agentDelegate = db.agent as any;
  const customerDelegate = db.customer as any;
  const orderItemDelegate = db.orderItem as any;

  const originalPaymentAggregate = paymentDelegate.aggregate;
  const originalSettlementAggregate = settlementDelegate.aggregate;
  const originalSettlementGroupBy = settlementDelegate.groupBy;
  const originalOrderCount = orderDelegate.count;
  const originalOrderGroupBy = orderDelegate.groupBy;
  const originalOrderFindMany = orderDelegate.findMany;
  const originalAgentCount = agentDelegate.count;
  const originalAgentGroupBy = agentDelegate.groupBy;
  const originalCustomerCount = customerDelegate.count;
  const originalOrderItemAggregate = orderItemDelegate.aggregate;

  // Stubs
  orderDelegate.count = async () => 10;
  orderDelegate.findMany = async () => [];
  orderDelegate.groupBy = async () => [
    { status: 'BOOKING_RECEIVED', _count: { _all: 3 } },
    { status: 'AGENT_ASSIGNED', _count: { _all: 2 } },
    { status: 'PICKUP_COMPLETED', _count: { _all: 5 } },
  ];
  agentDelegate.count = async () => 5;
  agentDelegate.groupBy = async () => [
    { status: 'AVAILABLE', _count: { _all: 5 } },
  ];
  customerDelegate.count = async () => 20;
  orderItemDelegate.aggregate = async () => ({ _sum: { actualWeight: 150.5 } });

  // Mock Payments (Revenue = ₹2,450.00)
  paymentDelegate.aggregate = async ({ where }: any) => {
    assert.deepEqual(where.status.in, ['CAPTURED', 'SETTLEMENT_COMPLETED']);
    return { _sum: { amount: 2450.0 } };
  };

  // Mock Settlements GroupBy (Approved = ₹850.00, Paid = ₹400.00, Pending = ₹120.00)
  settlementDelegate.groupBy = async () => [
    { status: 'APPROVED', _sum: { amount: 850.0 } },
    { status: 'PAID', _sum: { amount: 400.0 } },
    { status: 'PENDING', _sum: { amount: 120.0 } },
  ];

  settlementDelegate.aggregate = async ({ where }: any) => {
    if (Array.isArray(where?.status?.in)) {
      if (where.status.in.includes('APPROVED')) {
        return { _sum: { amount: 850.0 } };
      }
      if (where.status.in.includes('PAID')) {
        return { _sum: { amount: 400.0 } };
      }
    }
    if (where?.status === 'PENDING') {
      return { _sum: { amount: 120.0 } };
    }
    return { _sum: { amount: 0 } };
  };

  try {
    const adminToken = signToken({
      userId: 'admin-1',
      phone: '7676272709',
      role: 'ADMIN',
    });

    const req = new NextRequest('http://localhost/api/admin/stats', {
      headers: {
        Cookie: `jio_token=${adminToken}`,
      },
    });

    const res = await getAdminStats(req);
    assert.equal(res.status, 200);

    const json = await res.json();
    assert.equal(json.success, true);
    const data = json.data;

    // Verify revenue and payouts are separate
    assert.equal(data.totalRevenue, 2450.0, 'totalRevenue should equal sum of captured payments');
    assert.notEqual(data.totalCustomerPayouts, data.totalRevenue, 'totalCustomerPayouts must not equal totalRevenue');

    // Verify distinction between approved settlements and money actually paid
    assert.equal(data.paidCustomerPayouts, 400.0, 'paidCustomerPayouts should equal sum of PAID settlements');
    assert.equal(data.totalCustomerPayouts, 400.0, 'totalCustomerPayouts should reflect paid settlements');
    assert.equal(data.approvedCustomerPayouts, 850.0, 'approvedCustomerPayouts should equal sum of APPROVED settlements');
    assert.equal(data.pendingCustomerPayouts, 120.0, 'pendingCustomerPayouts should equal sum of PENDING settlements');
    assert.equal(data.totalCustomerSettlements, 1370.0, 'totalCustomerSettlements should equal approved + paid + pending');

    console.log('Admin stats database aggregation and payout separation tests passed.');
  } finally {
    paymentDelegate.aggregate = originalPaymentAggregate;
    settlementDelegate.aggregate = originalSettlementAggregate;
    settlementDelegate.groupBy = originalSettlementGroupBy;
    orderDelegate.count = originalOrderCount;
    orderDelegate.groupBy = originalOrderGroupBy;
    orderDelegate.findMany = originalOrderFindMany;
    agentDelegate.count = originalAgentCount;
    agentDelegate.groupBy = originalAgentGroupBy;
    customerDelegate.count = originalCustomerCount;
    orderItemDelegate.aggregate = originalOrderItemAggregate;
    await db.$disconnect();
  }
}

void run();
