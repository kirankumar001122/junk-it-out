import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';

export async function GET(req: NextRequest) {
  const requestStartedAt = performance.now();
  const timings: Record<string, number> = {};
  const logPerformance = (recordCount: number, responseBytes: number) => {
    if (process.env.NODE_ENV === 'development') {
      console.info('[admin-payments-perf]', JSON.stringify({
        timingsMs: Object.fromEntries(Object.entries(timings).map(([key, value]) => [key, Math.round(value * 100) / 100])),
        recordCount,
        responseBytes,
        totalMs: Math.round((performance.now() - requestStartedAt) * 100) / 100,
      }));
    }
  };
  try {
    let phaseStartedAt = performance.now();
    const authUser = await getAuthUser(req);
    timings.auth = performance.now() - phaseStartedAt;
    if (!authUser || !['ADMIN', 'SUPER_ADMIN'].includes(authUser.role)) {
      logPerformance(0, 0);
      return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });
    }

    const page = Math.max(1, Number(req.nextUrl.searchParams.get('page')) || 1);
    const pageSize = 50;
    const fetchSize = pageSize + 1;
    const search = req.nextUrl.searchParams.get('search')?.trim() || '';
    const where = search ? {
      OR: [
        { gatewayOrderId: { contains: search, mode: 'insensitive' as const } },
        { paymentId: { contains: search, mode: 'insensitive' as const } },
        { order: { orderNumber: { contains: search, mode: 'insensitive' as const } } },
        { order: { customer: { user: { name: { contains: search, mode: 'insensitive' as const } } } } },
      ],
    } : {};
    phaseStartedAt = performance.now();
    const payments = await db.payment.findMany({
      where,
      select: {
        id: true, orderId: true, amount: true, direction: true, gateway: true,
        gatewayOrderId: true, paymentId: true, status: true, createdAt: true,
        order: {
          select: {
            orderNumber: true, status: true, actualTotal: true, paymentStatus: true,
            customer: {
              select: { user: { select: { name: true } } },
            },
            items: { select: { actualWeight: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: fetchSize,
    });
    timings.paymentFetch = performance.now() - phaseStartedAt;

    let hasPaymentRecords = payments.length > 0;
    if (!hasPaymentRecords) {
      phaseStartedAt = performance.now();
      hasPaymentRecords = Boolean(await db.payment.findFirst({ select: { id: true } }));
      timings.paymentExistenceCheck = performance.now() - phaseStartedAt;
    }

    if (hasPaymentRecords) {
      const hasMore = payments.length > pageSize;
      const paginatedPayments = payments.slice(0, pageSize);
      const paymentIds = paginatedPayments.map((p) => p.id);

      let attemptsByPayment = new Map<string, any[]>();
      try {
        const attempts = await db.refundAttempt.findMany({
          where: { paymentId: { in: paymentIds } },
          select: {
            id: true,
            paymentId: true,
            amount: true,
            razorpayRefundId: true,
            status: true,
            failureReason: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: 'desc' },
        });
        for (const a of attempts) {
          const list = attemptsByPayment.get(a.paymentId) || [];
          list.push(a);
          attemptsByPayment.set(a.paymentId, list);
        }
      } catch (err: any) {
        // Soft fallback if RefundAttempt model is not available or query fails
      }

      const formatted = paginatedPayments.map((p) => {
        const pAttempts = attemptsByPayment.get(p.id) || [];
        const totalPaise = Math.round(Number(p.amount) * 100);
        let settledPaise = 0;
        let inFlightPaise = 0;
        for (const a of pAttempts) {
          const aPaise = Math.round(Number(a.amount) * 100);
          if (a.status === 'REFUNDED') {
            settledPaise += aPaise;
          } else if (['REFUND_PROCESSING', 'REFUND_PENDING', 'REFUND_PENDING_RECONCILIATION', 'PENDING', 'PROCESSING', 'RECONCILIATION_REQUIRED'].includes(a.status)) {
            inFlightPaise += aPaise;
          }
        }
        const remainingRefundableAmount = Math.max(0, Math.round((totalPaise - settledPaise)) / 100);
        const availableRefundableAmount = Math.max(0, Math.round((totalPaise - settledPaise - inFlightPaise)) / 100);
        const latestAttempt = pAttempts[0] || null;

        return {
          id: p.id,
          orderId: p.orderId,
          orderNumber: p.order?.orderNumber || '—',
          orderStatus: p.order?.status || null,
          customer: p.order?.customer?.user?.name || 'Customer',
          amount: p.amount,
          serviceCharge: p.direction === 'CUSTOMER_PAYS' ? p.amount : 0,
          scrapValue: p.direction === 'JUNKITOUT_PAYS' ? (p.order?.actualTotal || 0) : 0,
          direction: p.direction,
          gateway: p.gateway,
          gatewayOrderId: p.gatewayOrderId || p.paymentId || 'N/A',
          gatewayPaymentId: p.paymentId || 'N/A',
          status: p.status,
          totalRefundedAmount: Math.round(settledPaise) / 100,
          inFlightRefundAmount: Math.round(inFlightPaise) / 100,
          remainingRefundableAmount,
          availableRefundableAmount,
          razorpayRefundId: latestAttempt?.razorpayRefundId || null,
          refundFailureReason: latestAttempt?.failureReason || null,
          refundAttempts: pAttempts.map((a) => ({
            id: a.id,
            amount: Number(a.amount),
            status: a.status,
            razorpayRefundId: a.razorpayRefundId || null,
            failureReason: a.failureReason || null,
            createdAt: a.createdAt,
            updatedAt: a.updatedAt,
          })),
          refundAttempt: latestAttempt ? {
            id: latestAttempt.id,
            amount: Number(latestAttempt.amount),
            razorpayRefundId: latestAttempt.razorpayRefundId || null,
            status: latestAttempt.status,
            failureReason: latestAttempt.failureReason || null,
            updatedAt: latestAttempt.updatedAt,
          } : null,
          actualWeight: p.order?.items?.reduce((total, item) => total + (item.actualWeight || 0), 0) || 0,
          settlementStatus: p.order?.paymentStatus || 'PENDING',
          date: new Date(p.createdAt).toLocaleString('en-IN', {
            month: 'short',
            day: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }),
        };
      });
      const body = { success: true, data: formatted, page, pageSize, hasMore };
      logPerformance(formatted.length, Buffer.byteLength(JSON.stringify(body)));
      return NextResponse.json(body);
    }

    // Fallback: Build payment records from Orders for display
    const orderWhere = search ? {
      OR: [
        { orderNumber: { contains: search, mode: 'insensitive' as const } },
        { customer: { user: { name: { contains: search, mode: 'insensitive' as const } } } },
      ],
    } : {};
    phaseStartedAt = performance.now();
    const orders = await db.order.findMany({
      where: orderWhere,
      select: {
        id: true, orderNumber: true, status: true, finalAmount: true, estimatedTotal: true,
        financialDirection: true, actualTotal: true, paymentStatus: true, createdAt: true,
        customer: {
          select: { user: { select: { name: true } } },
        },
        items: { select: { actualWeight: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: fetchSize,
    });
    timings.fallbackOrderFetch = performance.now() - phaseStartedAt;

    const hasMore = orders.length > pageSize;
    const formattedFromOrders = orders.slice(0, pageSize).map((o) => ({
      id: `pay-${o.id}`,
      orderId: o.id,
      orderNumber: o.orderNumber,
      orderStatus: o.status,
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

    const body = { success: true, data: formattedFromOrders, page, pageSize, hasMore };
    logPerformance(formattedFromOrders.length, Buffer.byteLength(JSON.stringify(body)));
    return NextResponse.json(body);
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.info('[admin-payments-perf]', JSON.stringify({
        timingsMs: Object.fromEntries(Object.entries(timings).map(([key, value]) => [key, Math.round(value * 100) / 100])),
        totalMs: Math.round((performance.now() - requestStartedAt) * 100) / 100,
        failed: true,
      }));
    }
    console.error('Fetch admin payments failed:', { errorType: error instanceof Error ? error.name : 'UnknownError' });
    return NextResponse.json({ success: false, message: 'An unexpected error occurred. Please try again.' }, { status: 500 });
  }
}
