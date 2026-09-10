import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser || !['ADMIN', 'SUPER_ADMIN'].includes(authUser.role)) {
      return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });
    }

    const payments = await db.payment.findMany({
      include: {
        order: {
          include: {
            customer: {
              include: {
                user: true,
              },
            },
            items: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (payments.length > 0) {
      const formatted = payments.map((p) => ({
        id: p.id,
        orderId: p.orderId,
        orderNumber: p.order?.orderNumber || '—',
        customer: p.order?.customer?.user?.name || 'Customer',
        amount: p.amount,
        serviceCharge: p.direction === 'CUSTOMER_PAYS' ? p.amount : 0,
        scrapValue: p.direction === 'JUNKITOUT_PAYS' ? (p.order?.actualTotal || 0) : 0,
        direction: p.direction,
        gateway: p.gateway,
        gatewayOrderId: p.gatewayOrderId || p.paymentId || 'N/A',
        gatewayPaymentId: p.paymentId || 'N/A',
        status: p.status,
        actualWeight: p.order?.items?.reduce((total, item) => total + (item.actualWeight || 0), 0) || 0,
        settlementStatus: p.order?.paymentStatus || 'PENDING',
        date: new Date(p.createdAt).toLocaleString('en-IN', {
          month: 'short',
          day: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      }));
      return NextResponse.json({ success: true, data: formatted });
    }

    // Fallback: Build payment records from Orders for display
    const orders = await db.order.findMany({
      include: {
        customer: {
          include: {
            user: true,
          },
        },
        items: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const formattedFromOrders = orders.map((o) => ({
      id: `pay-${o.id}`,
      orderId: o.id,
      orderNumber: o.orderNumber,
      customer: o.customer?.user?.name || 'Customer',
      amount: o.finalAmount || o.estimatedTotal,
      serviceCharge: o.financialDirection === 'CUSTOMER_PAYS' ? o.finalAmount : 0,
      scrapValue: o.financialDirection === 'JUNKITOUT_PAYS' ? o.actualTotal : 0,
      direction: o.financialDirection,
      gateway: 'NOT_STARTED',
      gatewayOrderId: 'N/A',
      gatewayPaymentId: 'N/A',
      status: o.paymentStatus || 'PENDING',
      actualWeight: o.items.reduce((total, item) => total + (item.actualWeight || 0), 0),
      settlementStatus: o.paymentStatus || 'PENDING',
      date: new Date(o.createdAt).toLocaleString('en-IN', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    }));

    return NextResponse.json({ success: true, data: formattedFromOrders });
  } catch (error: any) {
    console.error('Fetch admin payments error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
