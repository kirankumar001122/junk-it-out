import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { parseBenefits } from '@/lib/wallet';

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser || authUser.role !== 'CUSTOMER' || !authUser.customerId) {
    return NextResponse.json({ success: false, message: 'Authenticated customer access is required.' }, { status: 401 });
  }
  try {
    const subscriptions = await db.customerSubscription.findMany({
      where: { customerId: authUser.customerId },
      include: {
        offer: true,
        payment: {
          select: {
            amount: true,
            status: true,
            paymentMethod: true,
            gatewayPaymentId: true,
            walletTransactionId: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    const now = new Date();
    const data = subscriptions.map((subscription) => {
      const isExpired = subscription.expiryDate <= now;
      const status = subscription.status === 'CANCELLED' ? 'CANCELLED' : isExpired ? 'EXPIRED' : subscription.status;
      const remainingPickups = Math.max(0, (subscription.pickupsAllowed || 0) - (subscription.pickupsUsed || 0));

      return {
        ...subscription,
        status,
        remainingPickups,
        offer: {
          ...subscription.offer,
          benefits: parseBenefits(subscription.offer.benefitsJson),
        },
      };
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Customer subscriptions lookup failed:', error);
    return NextResponse.json({ success: false, message: 'Unable to load subscription history.' }, { status: 500 });
  }
}
