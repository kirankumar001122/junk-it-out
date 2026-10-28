import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser || !['ADMIN', 'SUPER_ADMIN'].includes(authUser.role)) {
      return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get('page') || 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize') || 25) || 25));
    const customers = await db.customer.findMany({
      include: {
        user: {
          include: {
            addresses: true,
          },
        },
        orders: {
          take: 100,
          select: {
            id: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const formatted = customers.map((c) => {
      const primaryAddress = c.user.addresses.find((a) => a.isDefault) || c.user.addresses[0];
      const area = primaryAddress ? `${primaryAddress.area}, ${primaryAddress.city}` : 'South Bengaluru';
      const createdAtDate = c.createdAt || c.user.createdAt;
      const totalOrders = c.orders.length;

      return {
        id: c.id,
        userId: c.userId,
        name: c.user.name,
        phone: c.user.phone,
        email: c.user.email || '—',
        totalOrders: totalOrders,
        totalOrdersCount: totalOrders,
        pickupsCount: c.orders.filter((o) => o.status === 'PICKUP_COMPLETED' || o.status === 'SETTLEMENT_COMPLETED').length,
        points: c.points,
        status: 'ACTIVE',
        createdAt: createdAtDate ? createdAtDate.toISOString() : null,
        joinedDate: createdAtDate
          ? new Date(createdAtDate).toLocaleDateString('en-IN', {
              year: 'numeric',
              month: 'short',
              day: '2-digit',
            })
          : 'N/A',
        area: area,
        defaultArea: area,
        primaryArea: area,
        addressesCount: c.user.addresses.length,
      };
    });

    return NextResponse.json({ success: true, data: formatted, page, pageSize });
  } catch (error: any) {
    console.error('Fetch admin customers error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
