import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const { searchParams } = new URL(req.url);
    const phone = searchParams.get('phone');

    let userId = authUser?.userId;

    if (!userId && phone) {
      const user = await db.user.findUnique({ where: { phone } });
      if (user) userId = user.id;
    }

    if (!userId) {
      return NextResponse.json({ success: true, data: [] });
    }

    const addresses = await db.address.findMany({
      where: { userId },
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
    const body = await req.json();
    const { phone, name, label, houseNo, building, street, area, landmark, pincode, lat, lng } = body;

    if (!phone || !houseNo || !street || !area) {
      return NextResponse.json({ success: false, message: 'Missing required address fields.' }, { status: 400 });
    }

    let user = await db.user.findUnique({ where: { phone } });
    if (!user) {
      user = await db.user.create({
        data: {
          phone,
          name: name || 'Customer',
          role: 'CUSTOMER',
          customer: {
            create: {
              referralCode: `JIO-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
            },
          },
        },
      });
    }

    const newAddress = await db.address.create({
      data: {
        userId: user.id,
        label: label || 'Home',
        name: name || user.name,
        phone,
        houseNo,
        building: building || null,
        street,
        area,
        landmark: landmark || null,
        pincode: pincode || '560078',
        lat: lat || 12.9077,
        lng: lng || 77.5854,
        isDefault: true,
      },
    });

    return NextResponse.json({ success: true, data: newAddress });
  } catch (error: any) {
    console.error('Save customer address error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
