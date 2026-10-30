import { NextRequest } from 'next/server';
import { broadcaster } from '@/lib/realtime';
import { getAuthUser, isAdminRole } from '@/lib/auth/middleware';
import { createSseResponse } from '@/lib/sse';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);

  if (!authUser) {
    return new Response(
      JSON.stringify({ success: false, message: 'Authentication is required.' }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  if (!isAdminRole(authUser)) {
    return new Response(
      JSON.stringify({ success: false, message: 'Admin access required.' }),
      {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  return createSseResponse({
    signal: req.signal,
    subscribe: (listener) => broadcaster.subscribe(listener),
    onEvent: (event, send) => {
      // Do not leak sensitive payload data over the broadcast stream; emit signal only
      send(event.event, {});
    },
    connectedPayload: { status: 'connected' },
  });
}
