import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth/middleware';
import { broadcaster } from '@/lib/realtime';
import { db } from '@/lib/db';
import { canReceiveCustomerEvent } from '@/lib/realtime/accessPolicy';
import { isCustomerStreamRole } from '@/lib/customerAddresses';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);

  // Security: Reject unauthenticated users
  if (!authUser || !isCustomerStreamRole(authUser.role, authUser.userId)) {
    return new Response(JSON.stringify({ success: false, error: 'Authentication required for customer notification stream.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const customerId = authUser.customerId;
  const userId = authUser.userId;
  const encoder = new TextEncoder();
  let unsubscribe = () => {};

  const customStream = new ReadableStream({
    start(controller) {
      // 1. Initial connection heartbeat
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ status: 'connected', customerId, userId })}\n\n`)
      );

      // 2. Subscribe to realtime broadcaster with server-side ownership enforcement
      unsubscribe = broadcaster.subscribe((eventData) => {
        try {
          const payload = eventData.payload;

          if (!canReceiveCustomerEvent(eventData.event)) return;
          const orderId = payload?.orderId || payload?.order?.id || payload?.id;
          if (!orderId) return;
          void db.order.findUnique({ where: { id: orderId }, select: { customerId: true, customer: { select: { userId: true } } } }).then((order) => {
            if (!order || (order.customerId !== customerId && order.customer.userId !== userId)) return;
            controller.enqueue(encoder.encode(`event: ${eventData.event}\ndata: ${JSON.stringify(payload)}\n\n`));
          }).catch(() => {});
        } catch (err) {
          console.error('[CUSTOMER SSE] Stream dispatch error:', err);
        }
      });

      // 3. Clean up subscription on stream close
    },
    cancel() { unsubscribe(); },
  });

  return new Response(customStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
