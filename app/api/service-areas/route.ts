import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { SOUTH_BENGALURU_ZONES } from '@/lib/geofence';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

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
