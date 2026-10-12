import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { errorResponse } from '@/lib/utils/apiResponse';
import { parseAddressCoordinate } from '@/lib/customerAddresses';

type Context = { params: Promise<{ id: string }> };

async function ownedAddress(req: NextRequest, id: string) {
  const authUser = await getAuthUser(req);
  if (!authUser) return { error: errorResponse('UNAUTHORIZED', 'Authentication required.', 401) };
  if (authUser.role !== 'CUSTOMER' || !authUser.userId) return { error: errorResponse('FORBIDDEN', 'Customer account required.', 403) };
  const address = await db.address.findFirst({ where: { id, userId: authUser.userId } });
  if (!address) return { error: errorResponse('ADDRESS_NOT_FOUND', 'Saved address not found.', 404) };
  return { authUser, address };
}

export async function PATCH(req: NextRequest, { params }: Context) {
  try {
    const { id } = await params;
    const owned = await ownedAddress(req, id);
    if (owned.error) return owned.error;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return errorResponse('VALIDATION_ERROR', 'Invalid address data.', 400);

    const data: Record<string, unknown> = {};
    for (const field of ['label', 'name', 'houseNo', 'building', 'street', 'area', 'landmark', 'pincode', 'formattedAddress', 'pickupInstructions'] as const) {
      if (field in body) {
        const value = body[field];
        if (value !== null && typeof value !== 'string') return errorResponse('VALIDATION_ERROR', `Invalid ${field}.`, 400);
        if (['label', 'name', 'houseNo', 'street', 'area', 'pincode'].includes(field) && (typeof value !== 'string' || !value.trim())) {
          return errorResponse('VALIDATION_ERROR', `${field} cannot be empty.`, 400);
        }
        data[field] = typeof value === 'string' ? value.trim() || null : null;
      }
    }
    for (const field of ['lat', 'lng'] as const) {
      if (field in body) {
        const value = parseAddressCoordinate(body[field], field === 'lat' ? -90 : -180, field === 'lat' ? 90 : 180);
        const min = field === 'lat' ? -90 : -180;
        const max = field === 'lat' ? 90 : 180;
        if (value === null || value < min || value > max) return errorResponse('VALIDATION_ERROR', `Invalid ${field}.`, 400);
        data[field] = value;
      }
    }
    if ('isDefault' in body) {
      if (typeof body.isDefault !== 'boolean') return errorResponse('VALIDATION_ERROR', 'Invalid isDefault.', 400);
      data.isDefault = body.isDefault;
    }
    const updated = await db.$transaction(async (tx) => {
      if (body.isDefault === true) {
        await tx.address.updateMany({ where: { userId: owned.address.userId }, data: { isDefault: false } });
      }
      return tx.address.update({ where: { id }, data });
    });
    return NextResponse.json({ success: true, data: updated });
  } catch {
    return errorResponse('ADDRESS_UPDATE_FAILED', 'The address could not be updated.', 500);
  }
}

export async function DELETE(req: NextRequest, { params }: Context) {
  try {
    const { id } = await params;
    const owned = await ownedAddress(req, id);
    if (owned.error) return owned.error;
    await db.address.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return errorResponse('ADDRESS_DELETE_FAILED', 'The address could not be deleted.', 500);
  }
}
