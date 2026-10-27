import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST as acceptOrder } from '../app/api/orders/[id]/accept/route';
import { db } from '../lib/db';
import { signToken } from '../lib/auth/jwt';

process.env.JWT_SECRET = 'test-agent-accept-secret-key-2026';

const database = db as any;

function createAgentToken(agentId: string = 'agent-123', userId: string = 'user-agent-123') {
  return signToken({
    userId,
    phone: '+919876543210',
    name: 'Field Agent Test',
    role: 'AGENT',
    customerId: null,
    agentId,
    adminId: null,
    tokenVersion: 1,
  });
}

function createCustomerToken() {
  return signToken({
    userId: 'user-cust-123',
    phone: '+919876543211',
    name: 'Customer Test',
    role: 'CUSTOMER',
    customerId: 'cust-123',
    agentId: null,
    adminId: null,
    tokenVersion: 1,
  });
}

function makeRequest(
  url: string,
  options: {
    token?: string;
  } = {}
) {
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      'Content-Type': 'application/json',
    },
  });
}

async function runTests() {
  console.log('--- STARTING AGENT ACCEPT PICKUP WORKFLOW TESTS ---');

  const origAgentFindUnique = database.agent.findUnique;
  const origAgentUpdate = database.agent.update;
  const origOrderFindFirst = database.order.findFirst;
  const origOrderFindUnique = database.order.findUnique;
  const origOrderUpdateMany = database.order.updateMany;
  const origHistoryCreate = database.orderStatusHistory.create;

  try {
    // 1. Authorization: Unauthenticated
    console.log('Test 1: Rejects unauthenticated request with 401...');
    {
      const req = makeRequest('http://localhost:3000/api/orders/order-1/accept');
      const res = await acceptOrder(req, { params: Promise.resolve({ id: 'order-1' }) });
      assert.equal(res.status, 401, 'Should return 401 for unauthenticated request');
      const body = await res.json();
      assert.equal(body.success, false);
      assert.equal(body.error?.code, 'UNAUTHORIZED');
    }

    // 2. Authorization: Non-agent role
    console.log('Test 2: Rejects non-agent (customer) role with 403...');
    {
      const req = makeRequest('http://localhost:3000/api/orders/order-1/accept', {
        token: createCustomerToken(),
      });
      const res = await acceptOrder(req, { params: Promise.resolve({ id: 'order-1' }) });
      assert.equal(res.status, 403, 'Should return 403 for non-agent role');
      const body = await res.json();
      assert.equal(body.error?.code, 'FORBIDDEN');
    }

    // 3. Agent offline
    console.log('Test 3: Rejects when agent is offline with 400...');
    {
      database.agent.findUnique = async ({ where }: any) => {
        if (where.id === 'agent-123') {
          return { id: 'agent-123', status: 'OFFLINE', tokenVersion: 1, user: { name: 'Agent' } };
        }
        return null;
      };

      const req = makeRequest('http://localhost:3000/api/orders/order-1/accept', {
        token: createAgentToken('agent-123'),
      });
      const res = await acceptOrder(req, { params: Promise.resolve({ id: 'order-1' }) });
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.error?.code, 'AGENT_NOT_AVAILABLE');
    }

    // Common mock agent setup
    const mockAgent = {
      id: 'agent-123',
      status: 'AVAILABLE',
      serviceAreas: 'Indiranagar, Koramangala',
      vehicleNumber: 'KA-01-AB-1234',
      tokenVersion: 1,
      user: {
        id: 'user-agent-123',
        name: 'Agent Kiran',
        phone: '+919876543210',
      },
    };
    database.agent.findUnique = async ({ where }: any) => {
      if (where.id === 'agent-123') return mockAgent;
      return null;
    };

    // 4. Missing order
    console.log('Test 4: Rejects missing order with 404...');
    {
      database.order.findFirst = async () => null;

      const req = makeRequest('http://localhost:3000/api/orders/order-missing/accept', {
        token: createAgentToken('agent-123'),
      });
      const res = await acceptOrder(req, { params: Promise.resolve({ id: 'order-missing' }) });
      assert.equal(res.status, 404);
      const body = await res.json();
      assert.equal(body.error?.code, 'ORDER_NOT_FOUND');
    }

    // 5. Assignment Conflict (Assigned to another agent)
    console.log('Test 5: Rejects order assigned to another agent with 409 CONFLICT...');
    {
      database.order.findFirst = async () => ({
        id: 'order-conflict',
        orderNumber: 'ORD-1001',
        agentId: 'other-agent-999',
        status: 'AGENT_ASSIGNED',
        address: { area: 'Indiranagar' },
      });

      const req = makeRequest('http://localhost:3000/api/orders/order-conflict/accept', {
        token: createAgentToken('agent-123'),
      });
      const res = await acceptOrder(req, { params: Promise.resolve({ id: 'order-conflict' }) });
      assert.equal(res.status, 409);
      const body = await res.json();
      assert.equal(body.error?.code, 'CONFLICT');
    }

    // 6. Invalid order state (Cancelled or Completed)
    console.log('Test 6: Rejects cancelled or completed order with 400 ORDER_UNAVAILABLE...');
    {
      database.order.findFirst = async () => ({
        id: 'order-cancelled',
        orderNumber: 'ORD-1002',
        agentId: null,
        status: 'CANCELLED',
        address: { area: 'Indiranagar' },
      });

      const req = makeRequest('http://localhost:3000/api/orders/order-cancelled/accept', {
        token: createAgentToken('agent-123'),
      });
      const res = await acceptOrder(req, { params: Promise.resolve({ id: 'order-cancelled' }) });
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.error?.code, 'ORDER_UNAVAILABLE');
    }

    // 7. First-time acceptance with hydrated order data & data privacy check
    console.log('Test 7: First-time acceptance returns hydrated data without leaking sensitive fields...');
    {
      let statusHistoryCreated = false;
      let agentUpdatedStatus = '';

      database.order.findFirst = async () => ({
        id: 'order-fresh-1',
        orderNumber: 'ORD-2001',
        agentId: null,
        status: 'BOOKING_RECEIVED',
        address: {
          id: 'addr-1',
          name: 'Jane Customer',
          houseNo: '42',
          street: '12th Main',
          area: 'Indiranagar',
          lat: 12.9716,
          lng: 77.5946,
        },
      });

      database.order.updateMany = async () => ({ count: 1 });

      database.orderStatusHistory.create = async ({ data }: any) => {
        statusHistoryCreated = true;
        assert.equal(data.orderId, 'order-fresh-1');
        assert.equal(data.newStatus, 'AGENT_ACCEPTED');
        return { id: 'hist-1', ...data };
      };

      database.agent.update = async ({ data }: any) => {
        agentUpdatedStatus = data.status;
        return { ...mockAgent, status: data.status };
      };

      database.order.findUnique = async ({ include }: any) => {
        // Verify privacy projection: customer user select must NOT include passwordHash
        assert.ok(include.customer.include.user.select, 'Customer user must have explicit field selection');
        assert.equal(include.customer.include.user.select.passwordHash, undefined, 'passwordHash must never be selected');
        assert.equal(include.customer.include.user.select.name, true);
        assert.equal(include.customer.include.user.select.phone, true);

        return {
          id: 'order-fresh-1',
          orderNumber: 'ORD-2001',
          agentId: 'agent-123',
          customerId: 'cust-1',
          status: 'AGENT_ACCEPTED',
          address: {
            id: 'addr-1',
            name: 'Jane Customer',
            houseNo: '42',
            street: '12th Main',
            area: 'Indiranagar',
            lat: 12.9716,
            lng: 77.5946,
          },
          items: [
            {
              id: 'item-1',
              categoryId: 'cat-metal',
              estimatedWeight: 15.5,
              actualWeight: null,
              category: { id: 'cat-metal', name: 'Metal Scrap' },
            },
          ],
          customer: {
            id: 'cust-1',
            user: {
              id: 'user-cust-1',
              name: 'Jane Customer',
              phone: '+919999988888',
            },
          },
          agent: {
            id: 'agent-123',
            user: {
              id: 'user-agent-123',
              name: 'Agent Kiran',
              phone: '+919876543210',
            },
          },
        };
      };

      const req = makeRequest('http://localhost:3000/api/orders/order-fresh-1/accept', {
        token: createAgentToken('agent-123'),
      });
      const res = await acceptOrder(req, { params: Promise.resolve({ id: 'order-fresh-1' }) });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(statusHistoryCreated, true, 'Status history should be created');
      assert.equal(agentUpdatedStatus, 'ASSIGNED', 'Agent status should be ASSIGNED');

      // Hydrated return verification
      assert.equal(body.data.id, 'order-fresh-1');
      assert.equal(body.data.orderId, 'order-fresh-1', 'orderId alias must be provided for backwards compatibility');
      assert.equal(body.data.orderNumber, 'ORD-2001');
      assert.equal(body.data.status, 'AGENT_ACCEPTED');
      assert.ok(Array.isArray(body.data.items), 'items array must be included');
      assert.equal(body.data.items.length, 1);
      assert.equal(body.data.items[0].category.name, 'Metal Scrap');
      assert.equal(body.data.address.area, 'Indiranagar');
      assert.equal(body.data.customer.user.name, 'Jane Customer');
      assert.equal(body.data.customer.user.phone, '+919999988888');
      assert.equal(body.data.customer.user.passwordHash, undefined, 'No passwordHash in response');
    }

    // 8. Safe Idempotent Repeat Acceptance
    console.log('Test 8: Repeat accept returns 200 with hydrated data and does not duplicate history...');
    {
      let historyCallCount = 0;
      database.orderStatusHistory.create = async () => {
        historyCallCount++;
        return {};
      };

      database.order.findFirst = async () => ({
        id: 'order-repeat-1',
        orderNumber: 'ORD-2002',
        agentId: 'agent-123',
        status: 'AGENT_ACCEPTED', // already accepted
        address: { area: 'Indiranagar' },
      });

      database.order.findUnique = async ({ where }: any) => {
        assert.equal(where.id, 'order-repeat-1');
        return {
          id: 'order-repeat-1',
          orderNumber: 'ORD-2002',
          agentId: 'agent-123',
          customerId: 'cust-1',
          status: 'AGENT_ACCEPTED',
          address: { area: 'Indiranagar', houseNo: '10' },
          items: [{ id: 'item-2', category: { name: 'Paper' }, estimatedWeight: 5 }],
          customer: { user: { id: 'u1', name: 'Cust', phone: '123' } },
          agent: { user: { id: 'u2', name: 'Agent', phone: '456' } },
        };
      };

      const req = makeRequest('http://localhost:3000/api/orders/order-repeat-1/accept', {
        token: createAgentToken('agent-123'),
      });
      const res = await acceptOrder(req, { params: Promise.resolve({ id: 'order-repeat-1' }) });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.data.id, 'order-repeat-1');
      assert.equal(body.data.orderId, 'order-repeat-1');
      assert.ok(Array.isArray(body.data.items));
      assert.equal(historyCallCount, 0, 'Must NOT create duplicate order status history on idempotent repeat');
    }

    // 9. Concurrency Conflict / Recheck branch
    console.log('Test 9: Concurrent race condition safely rechecks order state...');
    {
      database.order.findFirst = async () => ({
        id: 'order-race-1',
        orderNumber: 'ORD-2003',
        agentId: null,
        status: 'BOOKING_RECEIVED',
        address: { area: 'Indiranagar' },
      });

      // updateMany fails because another agent took it
      database.order.updateMany = async () => ({ count: 0 });

      // Recheck shows another agent won the race
      database.order.findUnique = async () => ({
        id: 'order-race-1',
        agentId: 'other-agent-888',
        status: 'AGENT_ACCEPTED',
      });

      const req = makeRequest('http://localhost:3000/api/orders/order-race-1/accept', {
        token: createAgentToken('agent-123'),
      });
      const res = await acceptOrder(req, { params: Promise.resolve({ id: 'order-race-1' }) });
      assert.equal(res.status, 409);
      const body = await res.json();
      assert.equal(body.error?.code, 'CONFLICT');
    }

    // 10. Frontend cache resolution (no extra fetch) logic test
    console.log('Test 10: Verifying frontend no-extra-fetch resolution behavior...');
    {
      let fetchOrderDetailsCalls = 0;
      const fakeFetchOrderDetails = async (id: string) => {
        fetchOrderDetailsCalls++;
        return { id, orderNumber: 'FETCHED', items: [{ id: 'f-item' }] };
      };

      // Scenario A: Accept response returns items -> uses response directly, 0 calls to fetchOrderDetails
      const acceptResponseDataA = {
        id: 'ord-a',
        orderId: 'ord-a',
        orderNumber: 'ORD-A',
        items: [{ id: 'item-a', estimatedWeight: 10 }],
      };
      const cachedModalA: any = null;

      const rawOrderA = acceptResponseDataA;
      const updatedOrderA = Array.isArray(rawOrderA?.items)
        ? rawOrderA
        : cachedModalA && (cachedModalA.id === 'ord-a' || cachedModalA.orderNumber === 'ord-a')
        ? { ...cachedModalA, ...rawOrderA }
        : await fakeFetchOrderDetails('ord-a');

      assert.equal(updatedOrderA.id, 'ord-a');
      assert.equal(fetchOrderDetailsCalls, 0, 'Should not fetch when response contains items');

      // Scenario B: Accept response has no items, but cachedModalOrder has items -> uses cache, 0 calls
      const acceptResponseDataB = {
        id: 'ord-b',
        orderId: 'ord-b',
        orderNumber: 'ORD-B',
        status: 'AGENT_ACCEPTED',
      };
      const cachedModalB: any = {
        id: 'ord-b',
        orderNumber: 'ORD-B',
        address: { area: 'Indiranagar' },
        items: [{ id: 'item-b', estimatedWeight: 20 }],
      };

      const rawOrderB = acceptResponseDataB;
      const updatedOrderB = Array.isArray((rawOrderB as any)?.items)
        ? rawOrderB
        : cachedModalB && (cachedModalB.id === 'ord-b' || cachedModalB.orderNumber === 'ord-b')
        ? {
            ...cachedModalB,
            ...(rawOrderB || {}),
            id: rawOrderB?.id || cachedModalB.id,
            status: rawOrderB?.status || 'AGENT_ACCEPTED',
          }
        : await fakeFetchOrderDetails('ord-b');

      assert.equal(updatedOrderB.id, 'ord-b');
      assert.equal(updatedOrderB.status, 'AGENT_ACCEPTED');
      assert.equal(updatedOrderB.items.length, 1);
      assert.equal(fetchOrderDetailsCalls, 0, 'Should not fetch when cachedModalOrder is available');

      // Scenario C: Neither has items -> falls back to fetchOrderDetails
      const acceptResponseDataC = {
        id: 'ord-c',
        status: 'AGENT_ACCEPTED',
      };
      const rawOrderC = acceptResponseDataC;
      const updatedOrderC = Array.isArray((rawOrderC as any)?.items)
        ? rawOrderC
        : await fakeFetchOrderDetails('ord-c');

      assert.equal(updatedOrderC.id, 'ord-c');
      assert.equal(fetchOrderDetailsCalls, 1, 'Only falls back to fetch when neither response nor cache has items');
    }

    console.log('--- ALL AGENT ACCEPT PICKUP REGRESSION TESTS PASSED! ---');
  } finally {
    database.agent.findUnique = origAgentFindUnique;
    database.agent.update = origAgentUpdate;
    database.order.findFirst = origOrderFindFirst;
    database.order.findUnique = origOrderFindUnique;
    database.order.updateMany = origOrderUpdateMany;
    database.orderStatusHistory.create = origHistoryCreate;
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
