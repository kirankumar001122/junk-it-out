import { NextRequest } from 'next/server';
import { getActiveAgents } from '@/lib/services/agentService';
import { getAuthUser } from '@/lib/auth/middleware';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser || !['ADMIN', 'SUPER_ADMIN'].includes(authUser.role)) {
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
    if (!authUser || !['ADMIN', 'SUPER_ADMIN'].includes(authUser.role)) {
      return errorResponse('FORBIDDEN', 'Admin access required.', 403);
    }

    const body = await req.json();
    const { name, phone, vehicleType, vehicleNumber, serviceAreas } = body;

    if (!name || !phone) {
      return errorResponse('BAD_REQUEST', 'Name and phone are required.', 400);
    }

    let user = await db.user.findUnique({ where: { phone } });
    if (!user) {
      user = await db.user.create({
        data: {
          name,
          phone,
          role: 'AGENT',
        },
      });
    } else {
      await db.user.update({
        where: { id: user.id },
        data: { role: 'AGENT', name },
      });
    }

    let agent = await db.agent.findUnique({ where: { userId: user.id } });
    if (!agent) {
      agent = await db.agent.create({
        data: {
          userId: user.id,
          vehicleType: vehicleType || 'Three-Wheeler Auto Loading',
          vehicleNumber: vehicleNumber || 'KA-05-JK-1000',
          serviceAreas: serviceAreas || 'JP Nagar, Jayanagar, Koramangala',
          status: 'AVAILABLE',
        },
      });
    }

    return successResponse(agent);
  } catch (err: any) {
    console.error('Create admin agent error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to create field agent.', 500);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser || !['ADMIN', 'SUPER_ADMIN'].includes(authUser.role)) {
      return errorResponse('FORBIDDEN', 'Admin access required.', 403);
    }

    const body = await req.json();
    const { id, status, vehicleType, vehicleNumber, serviceAreas } = body;

    if (!id) {
      return errorResponse('BAD_REQUEST', 'Agent ID required.', 400);
    }

    const updated = await db.agent.update({
      where: { id },
      data: {
        ...(status ? { status } : {}),
        ...(vehicleType ? { vehicleType } : {}),
        ...(vehicleNumber ? { vehicleNumber } : {}),
        ...(serviceAreas ? { serviceAreas } : {}),
      },
    });

    return successResponse(updated);
  } catch (err: any) {
    console.error('Update admin agent error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to update field agent.', 500);
  }
}
