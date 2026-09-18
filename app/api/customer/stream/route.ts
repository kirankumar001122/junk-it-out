import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth/middleware';
import { broadcaster } from '@/lib/realtime';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);

  // Security: Reject unauthenticated users
  if (!authUser || !authUser.userId) {
    return new Response(JSON.stringify({ success: false, error: 'Authentication required for customer notification stream.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const customerId = authUser.customerId;
  const userId = authUser.userId;
  const encoder = new TextEncoder();

  const customStream = new ReadableStream({
    start(controller) {
      // 1. Initial connection heartbeat
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ status: 'connected', customerId, userId })}\n\n`)
      );

      // 2. Subscribe to realtime broadcaster with server-side ownership enforcement
      const unsubscribe = broadcaster.subscribe((eventData) => {
        try {
          const payload = eventData.payload;

          // Server-side Ownership Security:
          // A customer MUST ONLY receive events for orders belonging to their profile/userId.
          if (['AGENT_ASSIGNED', 'ORDER_UPDATED', 'ORDER_ACCEPTED'].includes(eventData.event)) {
            const eventCustomerId = payload?.customerId || payload?.order?.customerId;
            const eventUserId = payload?.userId || payload?.order?.customer?.userId;

            const isOwner =
              (customerId && eventCustomerId === customerId) ||
              (userId && eventUserId === userId);

            if (!isOwner) {
              return; // Suppress notification for other customers
            }
          }

          // Forward event to authenticated customer client
          controller.enqueue(
            encoder.encode(`event: ${eventData.event}\ndata: ${JSON.stringify(payload)}\n\n`)
          );
        } catch (err) {
          console.error('[CUSTOMER SSE] Stream dispatch error:', err);
        }
      });

      // 3. Clean up subscription on stream close
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
