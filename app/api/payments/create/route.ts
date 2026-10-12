import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { createRazorpayOrder, getRazorpayKeyId } from '@/lib/payments/razorpay';
import { initiateCustomerPayment, PaymentInitiationError } from '@/lib/payments/initiation';

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser || authUser.role !== 'CUSTOMER' || !authUser.customerId) {
      return NextResponse.json({ success: false, message: 'Authenticated customer access is required.' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body.orderId !== 'string' || !body.orderId.trim()) {
      return NextResponse.json({ success: false, message: 'Order ID is required.' }, { status: 400 });
    }

    const data = await initiateCustomerPayment(body.orderId, authUser.customerId, {
      store: db,
      createGatewayOrder: createRazorpayOrder,
      getKeyId: getRazorpayKeyId,
    });
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    const status = error instanceof PaymentInitiationError ? error.statusCode : 500;
    return NextResponse.json({ success: false, message: error.message }, { status });
  }
}
