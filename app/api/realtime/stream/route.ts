import { NextRequest } from 'next/server';
import { getAuthUser, isAdminRole } from '@/lib/auth/middleware';
import { broadcaster } from '@/lib/realtime';
import { createSseResponse } from '@/lib/sse';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) {
    return new Response(
      JSON.stringify({ success: false, error: 'Authentication required for realtime stream.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (!isAdminRole(authUser)) {
    return new Response(
      JSON.stringify({ success: false, error: 'Administrator access required for realtime stream.' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    );
  }

  return createSseResponse({
    signal: req.signal,
    subscribe: (listener) => broadcaster.subscribe(listener),
    connectedPayload: { status: 'connected' },
    onEvent(event, send) {
      send(event.event, event.payload);
    },
  });
}
