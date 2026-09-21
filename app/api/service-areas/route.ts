import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { SOUTH_BENGALURU_ZONES } from '@/lib/geofence';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { getAuthUser } from '@/lib/auth/middleware';

export async function GET(req: NextRequest) {
  try {
    const areas = await db.serviceArea.findMany({
      orderBy: { name: 'asc' },
    });

    if (areas.length === 0) {
      // Fallback to initial South Bengaluru zones list
      return successResponse(SOUTH_BENGALURU_ZONES);
    }

    return successResponse(areas);
  } catch (err: any) {
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to fetch service areas.', 500);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser || !['ADMIN', 'SUPER_ADMIN'].includes(authUser.role)) {
      return errorResponse('FORBIDDEN', 'Admin access required.', 403);
    }

    const { id, status } = await req.json().catch(() => ({}));

    if (!id || !['ACTIVE', 'INACTIVE'].includes(status)) {
      return errorResponse('BAD_REQUEST', 'Valid ServiceArea ID and status (ACTIVE | INACTIVE) required.', 400);
    }

    const updated = await db.serviceArea.update({
      where: { id },
      data: { status },
    });

    return successResponse(updated);
  } catch (err: any) {
    console.error('Update service area error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to update service area status.', 500);
  }
}

