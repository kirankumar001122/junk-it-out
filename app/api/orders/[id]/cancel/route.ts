import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { broadcaster } from '@/lib/realtime';
import { getAuthUser, requireAdminUser } from '@/lib/auth/middleware';
import { validateStatusTransition } from '@/lib/validations/schemas';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ success: false, message: 'Authentication is required.' }, { status: 401 });
    const { cancellationReason } = await req.json().catch(() => ({}));

    const order = await db.order.findUnique({
      where: { id },
      include: { customer: { include: { user: true } }, agent: true },
    });

    if (!order) {
      return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
    }

    const isAdmin = requireAdminUser(authUser);
    if (authUser.role === 'CUSTOMER' && order.customer.userId !== authUser.userId && order.customerId !== authUser.customerId) {
      return NextResponse.json({ success: false, message: 'You are not authorized to cancel this pickup.' }, { status: 403 });
    }
    if (!isAdmin && authUser.role !== 'CUSTOMER') {
      return NextResponse.json({ success: false, message: 'Only the customer or an admin can cancel this pickup.' }, { status: 403 });
    }
    if (!validateStatusTransition(order.status, 'CANCELLED')) {
      return NextResponse.json({ success: false, message: 'This pickup can no longer be cancelled.' }, { status: 409 });
    }

    const updatedOrder = await db.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: { id, status: order.status, paymentStatus: order.paymentStatus },
        data: {
          status: 'CANCELLED',
          ...(order.paymentStatus === 'CAPTURED' ? { paymentStatus: 'REFUND_REQUIRED' } : {}),
          cancellationReason: cancellationReason || 'Customer requested cancellation',
        },
      });
      if (claimed.count !== 1) return null;
      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          oldStatus: order.status,
          newStatus: 'CANCELLED',
          changedByUserId: authUser.userId,
          notes: `Cancelled. Reason: ${cancellationReason || 'Not specified'}`,
        },
      });
      return tx.order.findUnique({ where: { id }, include: { customer: { include: { user: true } } } });
    });
    if (!updatedOrder) return NextResponse.json({ success: false, message: 'Pickup state changed; refresh before cancelling.' }, { status: 409 });

    if (order.agentId) {
      await db.agent.update({
        where: { id: order.agentId },
        data: { status: 'AVAILABLE' },
      });
    }

    await db.auditLog.create({
      data: {
        userId: authUser.userId || null,
        action: 'ORDER_CANCELLED',
        oldValue: `Order ${order.orderNumber} (${order.status})`,
        newValue: `CANCELLED: ${cancellationReason}`,
      },
    });

    broadcaster.broadcast('ORDER_UPDATED', updatedOrder);

    return NextResponse.json({
      success: true,
      message: order.paymentStatus === 'CAPTURED'
        ? 'Order cancelled. Its captured payment is flagged for admin refund review.'
        : 'Order cancelled successfully.',
      data: updatedOrder,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
