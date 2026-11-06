import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { cancelCustomerSubscription } from '@/lib/subscriptions';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const authUser = await getAuthUser(req);
  if (!authUser || !authUser.userId) {
    return NextResponse.json(
      { success: false, message: 'Authentication required.' },
      { status: 401 },
    );
  }

  const isCustomer = authUser.role === 'CUSTOMER';
  const isAdmin = authUser.role === 'ADMIN' || authUser.role === 'SUPER_ADMIN';

  if (!isCustomer && !isAdmin) {
    return NextResponse.json(
      { success: false, message: 'Unauthorized.' },
      { status: 403 },
    );
  }

  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const reason = typeof body.reason === 'string' ? body.reason.trim() : 'Customer requested cancellation';

    const updated = await db.$transaction((tx) =>
      cancelCustomerSubscription(tx, {
        subscriptionId: id,
        customerId: isCustomer ? authUser.customerId : undefined,
        reason,
      }),
    );

    return NextResponse.json({
      success: true,
      message: 'Subscription has been cancelled successfully.',
      data: updated,
    });
  } catch (error) {
    console.error('Subscription cancellation failed:', error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Unable to cancel subscription.',
      },
      { status: 400 },
    );
  }
}

