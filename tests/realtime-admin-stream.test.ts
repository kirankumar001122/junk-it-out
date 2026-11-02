import assert from 'node:assert/strict';
import { test, describe, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getRealtimeStream } from '../app/api/realtime/stream/route';
import { signToken } from '../lib/auth/jwt';
import { db } from '../lib/db';
import { broadcaster } from '../lib/realtime';

describe('Admin Realtime Stream Route', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'local-test-secret-at-least-32-bytes-long-for-jwt-security';
  });

  function requestFor(role?: 'CUSTOMER' | 'AGENT' | 'ADMIN' | 'SUPER_ADMIN', query = '') {
    const requestUrl = `http://localhost/api/realtime/stream${query}`;
    if (!role) return new NextRequest(requestUrl);

    const token = signToken({
      userId: `${role.toLowerCase()}-user`,
      phone: 'test-only',
      role,
      ...(role === 'AGENT' ? { agentId: 'agent-stream-user', tokenVersion: 1 } : {}),
    });
    return new NextRequest(requestUrl, {
      headers: { Cookie: `jio_token=${token}` },
    });
  }

  test('verifies admin authorization, payload data sanitization, and clean disconnection', async () => {
    const agentDelegate = db.agent as any;
    const originalFindUnique = agentDelegate.findUnique;
    agentDelegate.findUnique = async ({ where }: any) => {
      if (where.id === 'agent-stream-user') return { id: 'agent-stream-user', tokenVersion: 1 };
      return null;
    };
    const originalSubscribe = broadcaster.subscribe.bind(broadcaster);
    let activeSubscriptions = 0;
    (broadcaster as any).subscribe = (listener: (event: any) => void) => {
      const unsubscribe = originalSubscribe(listener);
      activeSubscriptions += 1;
      return () => {
        activeSubscriptions -= 1;
        unsubscribe();
      };
    };

    try {
      const unauthenticated = await getRealtimeStream(requestFor());
      assert.equal(unauthenticated.status, 401);
      assert.equal(activeSubscriptions, 0);

      // This endpoint is admin-only; customers use /api/customer/stream, where
      // an optional order ID is checked against the authenticated owner.
      const otherCustomerOrder = await getRealtimeStream(requestFor('CUSTOMER', '?orderId=another-customer-order'));
      assert.equal(otherCustomerOrder.status, 403);
      assert.equal(activeSubscriptions, 0, 'customers cannot subscribe through the admin stream');

      // Agents use /api/agent/stream, which filters event payloads by their
      // server-derived agent ID. The admin stream rejects agents entirely.
      const unassignedAgentOrder = await getRealtimeStream(requestFor('AGENT', '?orderId=unassigned-order'));
      assert.equal(unassignedAgentOrder.status, 403);
      assert.equal(activeSubscriptions, 0, 'agents cannot subscribe through the admin stream');

      const adminResponse = await getRealtimeStream(requestFor('ADMIN'));
      assert.equal(adminResponse.status, 200);
      assert.equal(adminResponse.headers.get('Content-Type'), 'text/event-stream; charset=utf-8');
      const reader = adminResponse.body!.getReader();
      const decoder = new TextDecoder();

      const connected = decoder.decode((await reader.read()).value);
      assert.match(connected, /event: connected/);
      assert.equal(activeSubscriptions, 1);

      broadcaster.broadcast('ORDER_UPDATED', {
        id: 'order-private',
        address: { houseNo: 'PRIVATE_ADDRESS_SENTINEL' },
        customer: { user: { phone: 'PRIVATE_PHONE_SENTINEL' } },
      });
      broadcaster.broadcast('AGENT_LOCATION_UPDATED', {
        orderId: 'order-private',
        agentId: 'agent-private',
        lat: 12.9,
        lng: 77.5,
      });
      broadcaster.broadcast('NEW_PICKUP_AVAILABLE', {
        orderId: 'private-order',
        customerPhone: 'PRIVATE_PHONE_SENTINEL',
      });

      const orderEvent = decoder.decode((await reader.read()).value);
      assert.match(orderEvent, /event: ORDER_UPDATED/);
      assert.match(orderEvent, /data: \{\}/);
      assert.doesNotMatch(orderEvent, /PRIVATE_ADDRESS_SENTINEL|PRIVATE_PHONE_SENTINEL|order-private/);

      const locationEvent = decoder.decode((await reader.read()).value);
      assert.match(locationEvent, /event: AGENT_LOCATION_UPDATED/);
      assert.match(locationEvent, /data: \{\}/);
      assert.doesNotMatch(locationEvent, /12\.9|agent-private|order-private/);

      await reader.cancel();
      assert.equal(activeSubscriptions, 0, 'disconnect removes the broadcaster subscription');
    } finally {
      agentDelegate.findUnique = originalFindUnique;
      (broadcaster as any).subscribe = originalSubscribe;
    }
  });
});
