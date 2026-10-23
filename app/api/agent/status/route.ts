import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { reconcileUndispatchedPaidOrders } from '@/lib/payments/dispatchRecovery';

const ALLOWED_STATUSES = ['AVAILABLE', 'OFFLINE'];

export async function PATCH(req: NextRequest) {
  const startedAt = Date.now();
  const logTiming = (phase: string) =>
    console.info(`[api/agent/status] ${phase} elapsedMs=${Date.now() - startedAt}`);
  try {
    const authUser = await getAuthUser(req);
    logTiming('authentication complete');
    if (!authUser) {
      return errorResponse('UNAUTHORIZED', 'Authentication required.', 401);
    }

    if (authUser.role !== 'AGENT' || !authUser.agentId) {
      return errorResponse('FORBIDDEN', 'Only authorized field agents can update status.', 403);
    }

    const body = await req.json().catch(() => ({}));
    const { status } = body;

    if (!status || typeof status !== 'string' || !ALLOWED_STATUSES.includes(status.toUpperCase())) {
      return errorResponse(
        'INVALID_STATUS',
        `Invalid agent status. Allowed values: ${ALLOWED_STATUSES.join(', ')}.`,
        400
      );
    }

    const targetStatus = status.toUpperCase();

    const updateResult = await db.$transaction(async (tx) => {
      if (targetStatus === 'AVAILABLE') {
        const activeOrder = await tx.order.findFirst({
          where: {
            agentId: authUser.agentId,
            status: { in: ['AGENT_ASSIGNED', 'AGENT_ACCEPTED', 'AGENT_ON_WAY', 'AGENT_ARRIVED', 'WASTE_VERIFICATION', 'WEIGHING'] },
          },
          select: { id: true },
        });
        if (activeOrder) return { conflict: true as const };
      }

      const updatedAgent = await tx.agent.update({
        where: { id: authUser.agentId },
        data: { status: targetStatus },
        include: { user: true },
      });
      return { conflict: false as const, updatedAgent };
    }, { isolationLevel: 'Serializable' });

    if (updateResult.conflict) {
      return errorResponse('AGENT_HAS_ACTIVE_ORDER', 'Finish or cancel the active pickup before becoming available.', 409);
    }

    const updatedAgent = updateResult.updatedAgent;
    logTiming('agent update complete');

    if (targetStatus === 'AVAILABLE') {
      try {
        const areas = (updatedAgent.serviceAreas || '')
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean);
        for (const area of areas) {
          await reconcileUndispatchedPaidOrders({ serviceArea: area, limit: 5 });
        }
      } catch (err) {
        console.warn('[AGENT_STATUS] Opportunistic dispatch recovery encountered error:', err);
      }
    }

    return successResponse({
      agentId: updatedAgent.id,
      status: updatedAgent.status,
      name: updatedAgent.user.name,
      updatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    if (err?.code === 'P2034') {
      return errorResponse('AGENT_STATE_CONFLICT', 'An order assignment changed during the availability update. Refresh and try again.', 409);
    }
    console.error('Update agent status error:');
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to update agent availability status.', 500);
  }
}
