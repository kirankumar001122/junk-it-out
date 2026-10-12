import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { getCustomerAddresses } from '@/lib/services/customerService';
import { errorResponse } from '@/lib/utils/apiResponse';
import { parseAddressCoordinate } from '@/lib/customerAddresses';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return errorResponse('UNAUTHORIZED', 'Authentication required.', 401);
    }

    if (authUser.role !== 'CUSTOMER' || !authUser.userId) {
      return errorResponse('FORBIDDEN', 'Customer account required.', 403);
    }

    const addresses = await getCustomerAddresses(authUser.userId, 100);
    addresses.sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || b.createdAt.getTime() - a.createdAt.getTime());

    return NextResponse.json({ success: true, data: addresses });
  } catch (error: any) {
    console.error('Fetch customer addresses error:', error);
    return errorResponse('ADDRESS_LOOKUP_FAILED', 'Saved addresses are temporarily unavailable.', 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return errorResponse('UNAUTHORIZED', 'Authentication required.', 401);
    }

    if (authUser.role !== 'CUSTOMER' || !authUser.userId) {
      return errorResponse('FORBIDDEN', 'Customer account required.', 403);
    }

    const body = await req.json();
    const { phone, name, label, houseNo, building, street, area, landmark, pincode, lat, lng, formattedAddress } = body;

    if ('isDefault' in body && typeof body.isDefault !== 'boolean') {
      return NextResponse.json({ success: false, message: 'Invalid default-address flag.' }, { status: 400 });
    }

    const latitude = parseAddressCoordinate(lat, -90, 90);
    const longitude = parseAddressCoordinate(lng, -180, 180);
    if (![houseNo, street, area, pincode].every((value) => typeof value === 'string' && value.trim()) ||
        latitude === null || longitude === null) {
      return NextResponse.json({ success: false, message: 'House/flat, street, area, postcode, and valid map coordinates are required.' }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { id: authUser.userId },
      select: { id: true, name: true, phone: true, role: true },
    });
    if (!user || user.role !== 'CUSTOMER') {
      return errorResponse('USER_NOT_FOUND', 'Customer account not found.', 404);
    }

    if (phone && String(phone).replace(/\D/g, '').slice(-10) !== user.phone.replace(/\D/g, '').slice(-10)) {
      return errorResponse('FORBIDDEN', 'Addresses can only be saved to your own account.', 403);
    }

    const newAddress = await db.$transaction(async (tx) => {
      if (body.isDefault) {
        await tx.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
      }
      return tx.address.create({
        data: {
          userId: user.id,
          label: label || 'Home',
          name: name || user.name,
          phone: user.phone,
          formattedAddress: typeof formattedAddress === 'string' ? formattedAddress.trim() || null : null,
          houseNo: houseNo.trim(),
          building: building || null,
          street: street.trim(),
          area: area.trim(),
          landmark: landmark || null,
          pincode: pincode.trim(),
          lat: latitude,
          lng: longitude,
          isDefault: Boolean(body.isDefault),
        },
      });
    });

    return NextResponse.json({ success: true, data: newAddress });
  } catch (error: any) {
    console.error('Save customer address error:', error);
    return errorResponse('ADDRESS_SAVE_FAILED', 'The address could not be saved. Please try again later.', 500);
  }
}
