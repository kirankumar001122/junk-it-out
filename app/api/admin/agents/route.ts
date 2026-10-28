import { NextRequest } from 'next/server';
import { getActiveAgents } from '@/lib/services/agentService';
import { getAdminAuthorizationStatus, getAuthUser } from '@/lib/auth/middleware';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const authorizationStatus = getAdminAuthorizationStatus(authUser);
    if (authorizationStatus === 401) {
      return errorResponse('UNAUTHORIZED', 'Authentication is required.', 401);
    }
    if (authorizationStatus === 403) {
      return errorResponse('FORBIDDEN', 'Admin access required.', 403);
    }

    const agents = await getActiveAgents();
    return successResponse(agents);
  } catch (err: any) {
    console.error('Fetch admin agents error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to fetch field agents.', 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const authorizationStatus = getAdminAuthorizationStatus(authUser);
    if (authorizationStatus === 401) {
      return errorResponse('UNAUTHORIZED', 'Authentication is required.', 401);
    }
    if (authorizationStatus === 403) {
      return errorResponse('FORBIDDEN', 'Admin access required.', 403);
    }

    const body = await req.json().catch(() => ({}));
    const { name, phone, vehicleType, vehicleNumber, serviceAreas } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return errorResponse('BAD_REQUEST', 'Agent name is required.', 400);
    }

    if (!phone || typeof phone !== 'string') {
      return errorResponse('BAD_REQUEST', 'Valid phone number is required.', 400);
    }

    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      return errorResponse('BAD_REQUEST', 'Phone number must be a valid 10-digit mobile number.', 400);
    }

    const trimmedName = name.trim();

    let user = await db.user.findUnique({ where: { phone: cleanPhone } });
    if (!user) {
      user = await db.user.create({
        data: {
          name: trimmedName,
          phone: cleanPhone,
          role: 'AGENT',
        },
      });
    } else {
      await db.user.update({
        where: { id: user.id },
        data: { role: 'AGENT', name: trimmedName },
      });
    }

    let agent = await db.agent.findUnique({ where: { userId: user.id } });
    if (!agent) {
      agent = await db.agent.create({
        data: {
          userId: user.id,
          vehicleType: vehicleType ? String(vehicleType).trim() : 'Three-Wheeler Auto Loading',
          vehicleNumber: vehicleNumber ? String(vehicleNumber).trim() : 'KA-05-JK-1000',
          serviceAreas: serviceAreas ? String(serviceAreas).trim() : 'JP Nagar, Jayanagar, Koramangala',
          status: 'AVAILABLE',
        },
      });
    }

    await db.auditLog.create({
      data: {
        userId: authUser?.userId || null,
        userName: authUser?.name || 'Admin Operations',
        action: 'AGENT_CREATED',
        oldValue: null,
        newValue: `Created field agent: ${trimmedName} (${cleanPhone}), Vehicle: ${agent.vehicleNumber}`,
      },
    }).catch(() => null);

    return successResponse(agent);
  } catch (err: any) {
    console.error('Create admin agent error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to create field agent.', 500);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const authorizationStatus = getAdminAuthorizationStatus(authUser);
    if (authorizationStatus === 401) {
      return errorResponse('UNAUTHORIZED', 'Authentication is required.', 401);
    }
    if (authorizationStatus === 403) {
      return errorResponse('FORBIDDEN', 'Admin access required.', 403);
    }

    const body = await req.json().catch(() => ({}));
    const { id, status, vehicleType, vehicleNumber, serviceAreas } = body;

    if (!id || typeof id !== 'string') {
      return errorResponse('BAD_REQUEST', 'Agent ID required.', 400);
    }

    const allowedStatuses = ['AVAILABLE', 'ON_DUTY', 'BUSY', 'OFFLINE'];
    if (status && !allowedStatuses.includes(status)) {
      return errorResponse('BAD_REQUEST', `Status must be one of: ${allowedStatuses.join(', ')}`, 400);
    }

    const existingAgent = await db.agent.findUnique({ where: { id } });
    if (!existingAgent) {
      return errorResponse('NOT_FOUND', 'Field agent not found.', 404);
    }

    const updated = await db.agent.update({
      where: { id },
      data: {
        ...(status ? { status } : {}),
        ...(vehicleType ? { vehicleType: String(vehicleType).trim() } : {}),
        ...(vehicleNumber ? { vehicleNumber: String(vehicleNumber).trim() } : {}),
        ...(serviceAreas ? { serviceAreas: String(serviceAreas).trim() } : {}),
      },
      select: {
        id: true,
        userId: true,
        vehicleType: true,
        vehicleNumber: true,
        status: true,
        currentLat: true,
        currentLng: true,
        rating: true,
        serviceAreas: true,
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
    });

    await db.auditLog.create({
      data: {
        userId: authUser?.userId || null,
        userName: authUser?.name || 'Admin Operations',
        action: 'AGENT_UPDATED',
        oldValue: `Status: ${existingAgent.status}`,
        newValue: `Status: ${updated.status}, Vehicle: ${updated.vehicleNumber}`,
      },
    }).catch(() => null);

    return successResponse(updated);
  } catch (err: any) {
    console.error('Update admin agent error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to update field agent.', 500);
  }
}
