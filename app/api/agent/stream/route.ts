import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { broadcaster } from '@/lib/realtime';
import { createSseResponse } from '@/lib/sse';
import { isAgentEventForAgent } from '@/lib/sseTracking';

export const dynamic = 'force-dynamic';

const HEARTBEAT_INTERVAL_MS = 20_000;

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);

  if (!authUser || authUser.role !== 'AGENT' || !authUser.userId) {
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized agent access required.' }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  const agentId = authUser.agentId ?? (await db.agent.findUnique({
    where: { userId: authUser.userId },
    select: { id: true },
  }))?.id;
  if (!agentId) {
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized agent access required.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  return createSseResponse({
    signal: req.signal,
    subscribe: (listener) => broadcaster.subscribe(listener),
    connectedPayload: { status: 'connected', agentId },
    heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
    onEvent(event, send) {
      if (!isAgentEventForAgent(event.event, event.payload, agentId)) return;
      send(event.event, event.payload);
    },
  });
}
