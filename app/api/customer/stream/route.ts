import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { broadcaster } from '@/lib/realtime';
import { createSseResponse } from '@/lib/sse';
import { getOrderIdentifierWhere } from '@/lib/orderAccess';
import {
  createBoundedDispatcher,
  shouldForwardCustomerEvent,
  type CustomerTrackingState,
} from '@/lib/sseTracking';

export const dynamic = 'force-dynamic';

const HEARTBEAT_INTERVAL_MS = 20_000;

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  const isAdmin = authUser?.role === 'ADMIN' || authUser?.role === 'SUPER_ADMIN';
  const isCustomer = authUser?.role === 'CUSTOMER';

  if (!authUser || (!isCustomer && !isAdmin) || !authUser.userId) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Authentication required for notification stream.',
      }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  const userId = authUser.userId;
  const hasOrderId = req.nextUrl.searchParams.has('orderId');
  const requestedOrderId = req.nextUrl.searchParams.get('orderId')?.trim() ?? '';
  let trackedOrder: CustomerTrackingState = {
    trackedOrderId: null,
    assignedAgentId: null,
    orderStatus: null,
  };

  if (hasOrderId) {
    if (!requestedOrderId) {
      return new Response(
        JSON.stringify({ success: false, error: 'A valid order ID is required.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const orderWhere = isAdmin
      ? getOrderIdentifierWhere(requestedOrderId)
      : {
          ...getOrderIdentifierWhere(requestedOrderId),
          customer: { userId },
        };

    const order = await db.order.findFirst({
      where: orderWhere,
      select: { id: true, agentId: true, status: true },
    });

    if (!order) {
      return new Response(
        JSON.stringify({ success: false, error: 'Order not found or access denied.' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      );
    }

    trackedOrder = {
      trackedOrderId: order.id,
      assignedAgentId: order.agentId,
      orderStatus: order.status,
    };
  }

  // For order-specific streams the owner check was completed above and the
  // stream only accepts that exact ID. The global customer stream resolves
  // every event's order against the authenticated user before forwarding it.
  const isOwnedOrder = (orderId: string) => {
    if (isAdmin) return Promise.resolve(true);
    if (trackedOrder.trackedOrderId) {
      return orderId === trackedOrder.trackedOrderId;
    }

    return db.order.findFirst({
      where: { id: orderId, customer: { userId } },
      select: { id: true },
    }).then(Boolean);
  };

  // The global stream authorizes each event against the database. Bound the
  // number of in-flight checks so a slow database cannot create an unbounded
  // backlog. Dropped events are never sent without authorization.
  const MAX_PENDING_AUTHORIZATIONS = 32;
  const dispatchAuthorizedEvent = createBoundedDispatcher(
    MAX_PENDING_AUTHORIZATIONS,
    async ({ event, send }: {
      event: Parameters<typeof shouldForwardCustomerEvent>[0];
      send: (name: string, payload: unknown) => void;
    }) => {
      if (await shouldForwardCustomerEvent(event, trackedOrder, isOwnedOrder)) {
        send(event.event, event.payload);
      }
    },
    (error) => console.error('[CUSTOMER SSE] Event authorization error:', error),
  );

  return createSseResponse({
    signal: req.signal,
    subscribe: (listener) => broadcaster.subscribe(listener),
    connectedPayload: {
      status: 'connected',
      orderId: trackedOrder.trackedOrderId,
    },
    heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
    onEvent(event, send) {
      if (trackedOrder.trackedOrderId) {
        // This order's ownership was verified before subscribing, and its
        // synchronous check preserves event order for tracking state updates.
        if (shouldForwardCustomerEvent(event, trackedOrder, isOwnedOrder) as boolean) {
          send(event.event, event.payload);
        }
        return;
      }

      dispatchAuthorizedEvent({ event, send });
    },
  });
}
