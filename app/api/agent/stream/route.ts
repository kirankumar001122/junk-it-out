import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth/middleware';
import { broadcaster } from '@/lib/realtime';
import { db } from '@/lib/db';
import { canReceiveAgentEvent, isAgentPickupTarget } from '@/lib/realtime/accessPolicy';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);

  // Security: Reject unauthenticated users or non-agents
  if (!authUser || authUser.role !== 'AGENT' || !authUser.agentId) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized agent access required.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const agentId = authUser.agentId;
  const encoder = new TextEncoder();
  let unsubscribe = () => {};

  const customStream = new ReadableStream({
    start(controller) {
      // 1. Initial connection heartbeat
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ status: 'connected', agentId })}\n\n`)
      );

      // 2. Subscribe to realtime broadcaster
      unsubscribe = broadcaster.subscribe((eventData) => {
        try {
          const payload = eventData.payload;
          if (!canReceiveAgentEvent(eventData.event)) return;
          if (eventData.event === 'NEW_PICKUP_AVAILABLE') {
            if (!isAgentPickupTarget(agentId, payload?.targetAgentIds)) {
              return;
            }
          } else {
            const orderId = payload?.orderId || payload?.order?.id || payload?.id;
            if (eventData.event === 'AGENT_LOCATION_UPDATED' && payload?.agentId === agentId) {
              // An agent may receive its own location acknowledgement.
            } else {
              if (!orderId) return;
              void db.order.findUnique({ where: { id: orderId }, select: { agentId: true } }).then((order) => {
                if (order?.agentId !== agentId) return;
                controller.enqueue(encoder.encode(`event: ${eventData.event}\ndata: ${JSON.stringify(payload)}\n\n`));
              }).catch(() => {});
              return;
            }
          }
          controller.enqueue(
            encoder.encode(`event: ${eventData.event}\ndata: ${JSON.stringify(payload)}\n\n`)
          );
        } catch (err) {
          console.error('[AGENT SSE] Stream send error:', err);
        }
      });

      // 3. Clean up subscription when stream closes
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
