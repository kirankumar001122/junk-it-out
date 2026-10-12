import { broadcaster } from '@/lib/realtime';
import { getAuthUser, requireAdminUser } from '@/lib/auth/middleware';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!requireAdminUser(authUser)) {
    return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });
  }
  const encoder = new TextEncoder();
  let unsubscribe = () => {};

  const customStream = new ReadableStream({
    start(controller) {
      // Send initial heartbeat
      controller.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify({ status: 'connected' })}\n\n`));

      unsubscribe = broadcaster.subscribe((eventData) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${eventData.event}\ndata: ${JSON.stringify(eventData.payload)}\n\n`)
          );
        } catch (err) {
          console.error('SSE Stream error:', err);
        }
      });

      // Cleanup on stream close
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
