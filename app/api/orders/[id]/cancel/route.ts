import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { broadcaster } from '@/lib/realtime';
import { getAuthUser, isAdminRole } from '@/lib/auth/middleware';
import { isCustomerOrderOwner } from '@/lib/orderAccess';
import { validateStatusTransition } from '@/lib/validations/schemas';
import { errorResponse } from '@/lib/utils/apiResponse';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return errorResponse('UNAUTHORIZED', 'Authentication required.', 401);
    }

    const { id } = await params;
    const { cancellationReason, userId } = await req.json().catch(() => ({}));

    const order = await db.order.findUnique({
      where: { id },
      include: { customer: { include: { user: true } }, agent: true },
    });

    if (!order) {
      return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
    }

    const isAdmin = isAdminRole(authUser);
    const isOwner = authUser.role === 'CUSTOMER' && isCustomerOrderOwner(order, authUser);

    if (!isAdmin && !isOwner) {
      return errorResponse('FORBIDDEN', 'You are not authorized to cancel this order.', 403);
    }

    if (order.status === 'CANCELLED' || !validateStatusTransition(order.status, 'CANCELLED')) {
      return errorResponse('INVALID_STATUS_TRANSITION', `Cannot cancel order with status ${order.status}.`, 400);
    }

    const updatedOrder = await db.order.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancellationReason: cancellationReason || 'Customer requested cancellation',
        statusHistory: {
          create: {
            oldStatus: order.status,
            newStatus: 'CANCELLED',
            changedByUserId: userId || null,
            notes: `Cancelled. Reason: ${cancellationReason || 'Not specified'}`,
          },
        },
      },
      include: { customer: { include: { user: true } } },
    });

    if (order.agentId) {
      await db.agent.update({
        where: { id: order.agentId },
        data: { status: 'AVAILABLE' },
      });
    }

    await db.auditLog.create({
      data: {
        userId: userId || null,
        action: 'ORDER_CANCELLED',
        oldValue: `Order ${order.orderNumber} (${order.status})`,
        newValue: `CANCELLED: ${cancellationReason}`,
      },
    });

    broadcaster.broadcast('ORDER_UPDATED', updatedOrder);

    return NextResponse.json({
      success: true,
      message: 'Order cancelled successfully',
      data: updatedOrder,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
