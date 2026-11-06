import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { purchaseSubscriptionWithWallet } from '@/lib/subscriptions';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser || authUser.role !== 'CUSTOMER' || !authUser.customerId) {
    return NextResponse.json(
      { success: false, message: 'Authenticated customer access is required.' },
      { status: 401 },
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const offerId = typeof body.offerId === 'string' ? body.offerId.trim() : '';
    if (!offerId) {
      return NextResponse.json(
        { success: false, message: 'Subscription offer ID is required.' },
        { status: 400 },
      );
    }

    const result = await db.$transaction((tx) =>
      purchaseSubscriptionWithWallet(tx, {
        customerId: authUser.customerId!,
        offerId,
      }),
    );

    return NextResponse.json({
      success: true,
      message: 'Subscription purchased and activated successfully using your wallet balance.',
      data: result.subscription,
    });
  } catch (error) {
    console.error('Subscription purchase with wallet failed:', error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Wallet subscription purchase failed.',
      },
      { status: 400 },
    );
  }
}
