import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { parseBenefits } from '@/lib/wallet';

function isAuthorizedAdmin(role?: string) {
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser || !isAuthorizedAdmin(authUser.role)) {
    return NextResponse.json(
      { success: false, message: 'Administrator access is required.' },
      { status: 403 },
    );
  }

  try {
    const params = req.nextUrl.searchParams;
    const search = params.get('search')?.trim() || undefined;
    const status = params.get('status')?.trim() || undefined;

    const fromDate = params.get('from') ? new Date(params.get('from')!) : undefined;
    const toDate = params.get('to') ? new Date(`${params.get('to')}T23:59:59.999Z`) : undefined;

    const subscriptions = await db.customerSubscription.findMany({
      where: {
        status: status && status !== 'ALL' ? status : undefined,
        createdAt: {
          gte: fromDate,
          lte: toDate,
        },
        customer: search
          ? {
            user: {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
              ],
            },
          }
          : undefined,
      },
      include: {
        customer: {
          include: {
            user: { select: { id: true, name: true, phone: true, email: true } },
          },
        },
        offer: true,
        payment: {
          select: {
            id: true,
            amount: true,
            paymentMethod: true,
            status: true,
            gatewayPaymentId: true,
            walletTransactionId: true,
            createdAt: true,
          },
        },
        orders: {
          select: { id: true, orderNumber: true, createdAt: true, status: true },
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const now = new Date();
    const data = subscriptions.map((sub) => {
      const isExpired = sub.expiryDate <= now;
      const computedStatus = sub.status === 'CANCELLED' ? 'CANCELLED' : isExpired ? 'EXPIRED' : sub.status;
      const remainingPickups = Math.max(0, (sub.pickupsAllowed || 0) - (sub.pickupsUsed || 0));

      return {
        id: sub.id,
        customerId: sub.customerId,
        customerName: sub.customer?.user?.name || 'Customer',
        customerPhone: sub.customer?.user?.phone || '',
        customerEmail: sub.customer?.user?.email || null,
        planName: sub.offer.name,
        billingPeriod: sub.offer.billingPeriod || (sub.offer.durationMonths === 0 ? 'WEEKLY' : sub.offer.durationMonths === 3 ? 'QUARTERLY' : 'MONTHLY'),
        price: sub.offer.price,
        status: computedStatus,
        startDate: sub.startDate.toISOString(),
        expiryDate: sub.expiryDate.toISOString(),
        pickupsAllowed: sub.pickupsAllowed,
        pickupsUsed: sub.pickupsUsed,
        remainingPickups,
        autoRenew: sub.autoRenew,
        cancelledAt: sub.cancelledAt ? sub.cancelledAt.toISOString() : null,
        cancellationReason: sub.cancellationReason,
        paymentMethod: sub.payment?.paymentMethod || 'RAZORPAY',
        paymentStatus: sub.payment?.status || 'UNKNOWN',
        paymentAmount: sub.payment?.amount || sub.offer.price,
        recentOrders: sub.orders,
        offerBenefits: parseBenefits(sub.offer.benefitsJson),
      };
    });

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Admin subscriptions lookup failed:', error);
    return NextResponse.json(
      { success: false, message: 'Unable to load customer subscriptions.' },
      { status: 500 },
    );
  }
}

