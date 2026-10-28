import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET as getOrdersRoute } from '../app/api/orders/route';
import { GET as getOrderDetailRoute } from '../app/api/orders/[id]/route';
import { GET as getReviewsRoute } from '../app/api/reviews/route';
import { GET as getComplaintsRoute } from '../app/api/complaints/route';
import { signToken } from '../lib/auth/jwt';
import { db } from '../lib/db';

process.env.JWT_SECRET = 'local-test-secret-at-least-32-bytes-long-for-jwt-security';

function token(role: 'CUSTOMER' | 'ADMIN', claims: Record<string, unknown> = {}) {
  return signToken({
    userId: `${role.toLowerCase()}-1`,
    phone: '9999911111',
    role,
    ...(role === 'CUSTOMER' ? { customerId: 'cust-1' } : {}),
    ...claims,
  });
}

function scanForSensitiveKeys(obj: unknown, path = ''): string[] {
  const violations: string[] = [];
  if (!obj || typeof obj !== 'object') return violations;

  if (Array.isArray(obj)) {
    obj.forEach((item, idx) => {
      violations.push(...scanForSensitiveKeys(item, `${path}[${idx}]`));
    });
    return violations;
  }

  const sensitiveKeys = ['passwordHash', 'password', 'salt', 'tokenHash'];
  const record = obj as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    const currentPath = path ? `${path}.${key}` : key;
    if (sensitiveKeys.includes(key)) {
      violations.push(currentPath);
    }
    if (typeof record[key] === 'object' && record[key] !== null) {
      violations.push(...scanForSensitiveKeys(record[key], currentPath));
    }
  }

  return violations;
}

async function testResponseShapeSecurity() {
  const orderDelegate = db.order as any;
  const reviewDelegate = db.review as any;
  const complaintDelegate = db.complaint as any;

  const originalOrderFindMany = orderDelegate.findMany;
  const originalOrderFindFirst = orderDelegate.findFirst;
  const originalReviewFindMany = reviewDelegate.findMany;
  const originalComplaintFindMany = complaintDelegate.findMany;

  try {
    // 1. Verify GET /api/orders projection excludes sensitive fields
    let orderFindManySelectInclude: any = null;
    orderDelegate.findMany = async (args: any) => {
      orderFindManySelectInclude = args.include || args.select;
      return [
        {
          id: 'order-1',
          orderNumber: 'JIO-20261028-0001',
          status: 'BOOKING_RECEIVED',
          customer: {
            id: 'cust-1',
            user: { id: 'user-1', name: 'Alice Customer', phone: '9999911111', email: 'alice@example.com' },
          },
          agent: {
            id: 'agent-1',
            user: { id: 'agent-user-1', name: 'Bob Agent', phone: '9888822222' },
          },
        },
      ];
    };

    const customerToken = token('CUSTOMER');
    const ordersReq = new NextRequest('http://localhost/api/orders', {
      headers: { Cookie: `jio_token=${customerToken}` },
    });
    const ordersRes = await getOrdersRoute(ordersReq);
    assert.equal(ordersRes.status, 200);
    const ordersData = await ordersRes.json();
    const orderViolations = scanForSensitiveKeys(ordersData);
    assert.deepEqual(orderViolations, [], 'GET /api/orders response must never contain sensitive user fields');

    // Verify non-customer / admin path projection in orders route
    const adminToken = token('ADMIN');
    const adminOrdersReq = new NextRequest('http://localhost/api/orders', {
      headers: { Cookie: `jio_token=${adminToken}` },
    });
    await getOrdersRoute(adminOrdersReq);
    // In admin branch, customer.include.user must have select without passwordHash
    const customerUserProjection = orderFindManySelectInclude?.customer?.include?.user;
    assert.ok(customerUserProjection?.select, 'customer.user must use explicit select projection');
    assert.equal(customerUserProjection.select.passwordHash, undefined, 'passwordHash must not be selected');

    // 2. Verify GET /api/orders/[id] projection
    let orderDetailInclude: any = null;
    orderDelegate.findFirst = async (args: any) => {
      orderDetailInclude = args.include;
      return {
        id: 'order-1',
        orderNumber: 'JIO-20261028-0001',
        customerId: 'cust-1',
        customer: {
          id: 'cust-1',
          userId: 'customer-1',
          user: { id: 'customer-1', name: 'Alice', phone: '9999911111', email: 'alice@example.com' },
        },
        agent: {
          id: 'agent-1',
          user: { id: 'agent-1', name: 'Agent Smith', phone: '9888822222', email: 'agent@example.com' },
        },
      };
    };

    const orderDetailReq = new NextRequest('http://localhost/api/orders/order-1', {
      headers: { Cookie: `jio_token=${customerToken}` },
    });
    const orderDetailRes = await getOrderDetailRoute(orderDetailReq, {
      params: Promise.resolve({ id: 'order-1' }),
    });
    assert.equal(orderDetailRes.status, 200);
    const orderDetailData = await orderDetailRes.json();
    const detailViolations = scanForSensitiveKeys(orderDetailData);
    assert.deepEqual(detailViolations, [], 'GET /api/orders/[id] must never contain sensitive user fields');
    assert.ok(orderDetailInclude?.customer?.include?.user?.select, 'order-detail query must use explicit select for customer user');
    assert.ok(orderDetailInclude?.agent?.include?.user?.select, 'order-detail query must use explicit select for agent user');

    // 3. Verify GET /api/reviews projection
    let reviewsInclude: any = null;
    reviewDelegate.findMany = async (args: any) => {
      reviewsInclude = args.include;
      return [
        {
          id: 'rev-1',
          rating: 5,
          comment: 'Great service!',
          customer: { user: { id: 'user-1', name: 'Alice', phone: '9999911111', email: 'alice@test.com' } },
          agent: { user: { id: 'agent-1', name: 'Bob', phone: '9888822222', email: 'bob@test.com' } },
        },
      ];
    };

    const reviewsReq = new NextRequest('http://localhost/api/reviews', {
      headers: { Cookie: `jio_token=${customerToken}` },
    });
    const reviewsRes = await getReviewsRoute(reviewsReq);
    assert.equal(reviewsRes.status, 200);
    const reviewsData = await reviewsRes.json();
    const reviewViolations = scanForSensitiveKeys(reviewsData);
    assert.deepEqual(reviewViolations, [], 'GET /api/reviews must never contain sensitive user fields');
    assert.ok(reviewsInclude?.customer?.include?.user?.select, 'reviews query must use explicit select for customer user');
    assert.ok(reviewsInclude?.agent?.include?.user?.select, 'reviews query must use explicit select for agent user');

    // 4. Verify GET /api/complaints projection
    let complaintsInclude: any = null;
    complaintDelegate.findMany = async (args: any) => {
      complaintsInclude = args.include;
      return [
        {
          id: 'comp-1',
          description: 'Delayed pickup',
          status: 'OPEN',
          customer: { user: { id: 'user-1', name: 'Alice', phone: '9999911111', email: 'alice@test.com' } },
        },
      ];
    };

    const complaintsReq = new NextRequest('http://localhost/api/complaints', {
      headers: { Cookie: `jio_token=${customerToken}` },
    });
    const complaintsRes = await getComplaintsRoute(complaintsReq);
    assert.equal(complaintsRes.status, 200);
    const complaintsData = await complaintsRes.json();
    const complaintViolations = scanForSensitiveKeys(complaintsData);
    assert.deepEqual(complaintViolations, [], 'GET /api/complaints must never contain sensitive user fields');
    assert.ok(complaintsInclude?.customer?.include?.user?.select, 'complaints query must use explicit select for customer user');

    console.log('Response shape sensitive data tests passed successfully.');
  } finally {
    orderDelegate.findMany = originalOrderFindMany;
    orderDelegate.findFirst = originalOrderFindFirst;
    reviewDelegate.findMany = originalReviewFindMany;
    complaintDelegate.findMany = originalComplaintFindMany;
  }
}

void testResponseShapeSecurity().catch((err) => {
  console.error('Response shape security test failed:', err);
  process.exit(1);
});
