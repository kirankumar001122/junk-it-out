import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

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

    const updatedAgent = await db.agent.update({
      where: { id: authUser.agentId },
      data: { status: targetStatus },
      include: { user: true },
    });
    logTiming('agent update complete');

    return successResponse({
      agentId: updatedAgent.id,
      status: updatedAgent.status,
      name: updatedAgent.user.name,
      updatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Update agent status error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to update agent availability status.', 500);
  }
}
