import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser || !['ADMIN', 'SUPER_ADMIN'].includes(authUser.role)) {
      return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });
    }

    const customers = await db.customer.findMany({
      include: {
        user: {
          include: {
            addresses: true,
          },
        },
        orders: {
          select: {
            id: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formatted = customers.map((c) => {
      const primaryAddress = c.user.addresses.find((a) => a.isDefault) || c.user.addresses[0];
      return {
        id: c.id,
        userId: c.userId,
        name: c.user.name,
        phone: c.user.phone,
        email: c.user.email || '—',
        pickupsCount: c.orders.filter((o) => o.status === 'PICKUP_COMPLETED' || o.status === 'SETTLEMENT_COMPLETED').length,
        totalOrdersCount: c.orders.length,
        points: c.points,
        status: 'ACTIVE',
        joinedDate: new Date(c.createdAt).toLocaleDateString('en-IN', {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
        }),
        area: primaryAddress ? `${primaryAddress.area}, ${primaryAddress.city}` : 'South Bengaluru',
        addressesCount: c.user.addresses.length,
      };
    });

    return NextResponse.json({ success: true, data: formatted });
  } catch (error: any) {
    console.error('Fetch admin customers error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
