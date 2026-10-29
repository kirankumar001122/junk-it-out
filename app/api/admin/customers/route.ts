import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminAuthorizationStatus, getAuthUser } from '@/lib/auth/middleware';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const authorizationStatus = getAdminAuthorizationStatus(authUser);
    if (authorizationStatus === 401) {
      return NextResponse.json({ success: false, message: 'Authentication is required.' }, { status: 401 });
    }
    if (authorizationStatus === 403) {
      return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get('page') || 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize') || 25) || 25));
    const customers = await db.customer.findMany({
      include: {
        user: {
          include: {
            addresses: {
              select: {
                id: true,
                isDefault: true,
                area: true,
                city: true,
              },
            },
          },
        },
        orders: {
          where: {
            status: { in: ['PICKUP_COMPLETED', 'SETTLEMENT_COMPLETED'] },
          },
          select: {
            id: true,
            status: true,
          },
        },
        _count: {
          select: {
            orders: true,
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
      const totalOrders = (c as any)._count?.orders ?? c.orders?.length ?? 0;

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
