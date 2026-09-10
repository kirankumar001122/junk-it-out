import { broadcaster } from '@/lib/realtime';

export const dynamic = 'force-dynamic';

export async function GET() {
  const encoder = new TextEncoder();

  const customStream = new ReadableStream({
    start(controller) {
      // Send initial heartbeat
      controller.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify({ status: 'connected' })}\n\n`));

      const unsubscribe = broadcaster.subscribe((eventData) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${eventData.event}\ndata: ${JSON.stringify(eventData.payload)}\n\n`)
          );
        } catch (err) {
          console.error('SSE Stream error:', err);
        }
      });

      // Cleanup on stream close
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
