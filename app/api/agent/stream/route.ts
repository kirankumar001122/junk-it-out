import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth/middleware';
import { broadcaster } from '@/lib/realtime';

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

  const customStream = new ReadableStream({
    start(controller) {
      // 1. Initial connection heartbeat
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ status: 'connected', agentId })}\n\n`)
      );

      // 2. Subscribe to realtime broadcaster
      const unsubscribe = broadcaster.subscribe((eventData) => {
        try {
          const payload = eventData.payload;

          // Event Targeting logic:
          // For NEW_PICKUP_AVAILABLE, check if this agent is in targetAgentIds
          if (eventData.event === 'NEW_PICKUP_AVAILABLE') {
            const targetIds: string[] = payload?.targetAgentIds || [];
            if (!targetIds.includes(agentId)) {
              return; // Ignore event if agent is not targeted/eligible
            }
          } else if (
            ['ORDER_UPDATED', 'ORDER_ACCEPTED', 'AGENT_STARTED', 'AGENT_ARRIVED', 'ORDER_COMPLETED'].includes(
              eventData.event
            )
          ) {
            // For active order status changes, ensure event is assigned to this agent
            if (payload?.agentId && payload.agentId !== agentId) {
              return;
            }
          }

          // Forward event to authenticated agent client
          controller.enqueue(
            encoder.encode(`event: ${eventData.event}\ndata: ${JSON.stringify(payload)}\n\n`)
          );
        } catch (err) {
          console.error('[AGENT SSE] Stream send error:', err);
        }
      });

      // 3. Clean up subscription when stream closes
      return () => {
        unsubscribe();
      };
    },
  });

  return new Response(customStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
