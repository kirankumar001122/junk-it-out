import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/middleware';
import {
  isCustomerReconciliationActor,
  PaymentVerificationError,
  reconcilePaymentForOrder,
} from '@/lib/payments/verification';

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ success: false, message: 'Authentication is required.' }, { status: 401 });
    }
    if (!isCustomerReconciliationActor(authUser)) {
      return NextResponse.json({ success: false, message: 'Authenticated customer access is required.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { orderId } = body;
    if (!orderId || typeof orderId !== 'string') {
      return NextResponse.json({ success: false, message: 'A valid orderId is required.' }, { status: 400 });
    }

    const result = await reconcilePaymentForOrder(orderId, authUser);

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    const status = error instanceof PaymentVerificationError ? error.statusCode : 500;
    return NextResponse.json({ success: false, message: status < 500 ? error.message : 'Payment reconciliation failed.' }, { status });
  }
}
