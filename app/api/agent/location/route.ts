import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { broadcaster } from '@/lib/realtime';
import { validateCoordinates } from '@/lib/validations/schemas';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser || authUser.role !== 'AGENT') {
      return errorResponse('UNAUTHORIZED', 'Authenticated agent access is required.', 401);
    }

    const body = await req.json().catch(() => ({}));
    const { agentId, orderId, lat, lng, speed = 0.0 } = body;

    const targetAgentId = authUser.agentId || agentId;
    if (!targetAgentId) {
      return errorResponse('UNAUTHORIZED', 'Agent authentication or agentId required.', 401);
    }

    if (authUser.agentId && authUser.agentId !== targetAgentId) {
      return errorResponse('FORBIDDEN', 'Agents cannot update location for another agent.', 403);
    }

    if (!validateCoordinates(lat, lng)) {
      return errorResponse('INVALID_COORDINATES', 'Valid latitude and longitude coordinates required.', 400);
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    const agent = await db.agent.update({
      where: { id: targetAgentId },
      data: {
        currentLat: latitude,
        currentLng: longitude,
      },
      include: { user: true },
    });

    const locRecord = await db.agentLocation.create({
      data: {
        agentId: targetAgentId,
        orderId: orderId || null,
        lat: latitude,
        lng: longitude,
        speed: parseFloat(speed) || 0.0,
      },
    });

    broadcaster.broadcast('AGENT_LOCATION_UPDATED', {
      agentId: targetAgentId,
      agentName: agent.user.name,
      vehicleNumber: agent.vehicleNumber,
      status: agent.status,
      orderId,
      lat: latitude,
      lng: longitude,
      timestamp: locRecord.timestamp,
    });

    return successResponse(locRecord);
  } catch (err: any) {
    console.error('Update agent location error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to update agent location.', 500);
  }
}
