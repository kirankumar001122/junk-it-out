import { NextRequest } from 'next/server';
import { checkGeofenceServiceability } from '@/lib/services/serviceAreaService';
import { validateCoordinates } from '@/lib/validations/schemas';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { lat, lng, areaName } = body;

    if (!validateCoordinates(lat, lng)) {
      return errorResponse('INVALID_COORDINATES', 'Valid latitude and longitude coordinates are required.', 400);
    }

    const result = await checkGeofenceServiceability(Number(lat), Number(lng), areaName);

    return successResponse(result);
  } catch (err: any) {
    console.error('Service area check error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to check service area.', 500);
  }
}
