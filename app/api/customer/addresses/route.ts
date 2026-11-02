import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser || authUser.role !== 'CUSTOMER' || !authUser.userId) {
      return NextResponse.json({ success: false, message: 'Authenticated customer access is required.' }, { status: 401 });
    }

    const addresses = await db.address.findMany({
      where: { userId: authUser.userId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: addresses });
  } catch (error: any) {
    console.error('Fetch customer addresses error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser || authUser.role !== 'CUSTOMER' || !authUser.userId) {
      return NextResponse.json({ success: false, message: 'Authenticated customer access is required.' }, { status: 401 });
    }

    const body = await req.json();
    const { label, houseNo, building, street, area, landmark, pincode, lat, lng, name: bodyName } = body;

    if (!houseNo || !street || !area) {
      return NextResponse.json({ success: false, message: 'Missing required address fields.' }, { status: 400 });
    }

    if (
      typeof lat !== 'number' ||
      typeof lng !== 'number' ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat === 0 ||
      lng === 0
    ) {
      return NextResponse.json(
        { success: false, message: 'Valid GPS latitude and longitude coordinates are required.' },
        { status: 400 }
      );
    }

    const cleanPincode = typeof pincode === 'string' ? pincode.trim() : typeof pincode === 'number' ? String(pincode) : '';
    if (!cleanPincode || !/^[1-9][0-9]{5}$/.test(cleanPincode)) {
      return NextResponse.json(
        { success: false, message: 'A valid 6-digit Indian pincode is required.' },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({
      where: { id: authUser.userId },
      select: { id: true, phone: true, name: true },
    });

    if (!user) {
      return NextResponse.json({ success: false, message: 'Customer account not found.' }, { status: 404 });
    }

    const phone = user.phone;
    const name = bodyName?.trim() || user.name || 'Customer';
    const isDefault = body.isDefault !== undefined ? Boolean(body.isDefault) : true;

    const runTx = async (tx: any) => {
      const addressClient = tx?.address || db.address;
      if (isDefault && typeof addressClient?.updateMany === 'function') {
        await addressClient.updateMany({
          where: { userId: user.id },
          data: { isDefault: false },
        });
      }

      if (typeof addressClient?.create === 'function') {
        return addressClient.create({
          data: {
            userId: user.id,
            label: label || 'Home',
            name,
            phone,
            houseNo,
            building: building || null,
            street,
            area,
            landmark: landmark || null,
            pincode: cleanPincode,
            lat,
            lng,
            isDefault,
          },
        });
      }

      return null;
    };

    const newAddress = typeof db.$transaction === 'function'
      ? await db.$transaction(runTx)
      : await runTx(db);

    return NextResponse.json({ success: true, data: newAddress });
  } catch (error: any) {
    console.error('Save customer address error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser || authUser.role !== 'CUSTOMER' || !authUser.userId) {
      return NextResponse.json({ success: false, message: 'Authenticated customer access is required.' }, { status: 401 });
    }

    const id = new URL(req.url).searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, message: 'Address ID is required.' }, { status: 400 });
    }

    const result = await db.address.deleteMany({
      where: { id, userId: authUser.userId },
    });
    if (result.count === 0) {
      return NextResponse.json({ success: false, message: 'Address not found.' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Delete customer address error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
