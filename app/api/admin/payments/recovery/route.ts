import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, isAdminRole } from '@/lib/auth/middleware';
import { reconcileUndispatchedPaidOrders } from '@/lib/payments/dispatchRecovery';

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) {
    return NextResponse.json({ success: false, message: 'Authentication required.' }, { status: 401 });
  }
  if (!isAdminRole(authUser)) {
    return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { serviceArea, limit } = body;

    const summary = await reconcileUndispatchedPaidOrders({
      serviceArea: typeof serviceArea === 'string' ? serviceArea : undefined,
      limit: typeof limit === 'number' ? limit : undefined,
    });

    return NextResponse.json({ success: true, data: summary });
  } catch (error: any) {
    console.error('[ADMIN_DISPATCH_RECOVERY_ERROR]', error);
    return NextResponse.json(
      { success: false, message: 'Dispatch recovery run failed.' },
      { status: 500 },
    );
  }
}
