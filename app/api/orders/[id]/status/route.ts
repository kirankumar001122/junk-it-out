import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requireAdminUser } from '@/lib/auth/middleware';
import { broadcaster } from '@/lib/realtime';
import { validateStatusTransition } from '@/lib/validations/schemas';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const authUser = await getAuthUser(req as any);
    if (!requireAdminUser(authUser)) {
      return NextResponse.json({ success: false, message: 'Admin access is required.' }, { status: 403 });
    }
    const { newStatus, userId, notes } = await req.json();

    const order = await db.order.findUnique({
      where: { id },
      include: { customer: { include: { user: true } }, agent: { include: { user: true } } },
    });

    if (!order) {
      return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
    }

    const oldStatus = order.status;

    if (!newStatus || typeof newStatus !== 'string') {
      return NextResponse.json({ success: false, message: 'Status is required.' }, { status: 400 });
    }

    if (!validateStatusTransition(oldStatus, newStatus)) {
      return NextResponse.json({ success: false, message: `Invalid status transition from ${oldStatus} to ${newStatus}.` }, { status: 400 });
    }

    // Idempotency check: if status is already the same, return order directly
    if (oldStatus === newStatus) {
      return NextResponse.json({ success: true, message: 'Status already updated', data: order });
    }

    const updatedOrder = await db.order.update({
      where: { id },
      data: {
        status: newStatus,
        statusHistory: {
          create: {
            oldStatus,
            newStatus,
            changedByUserId: authUser.userId,
            notes: notes || `Status changed from ${oldStatus} to ${newStatus}`,
          },
        },
        notifications: {
          create: {
            userId: order.customer.userId,
            type: 'WHATSAPP',
            recipient: order.customer.user.phone,
            content: `Pickup ${order.orderNumber} update: Status is now ${newStatus.replace(/_/g, ' ')}.`,
            status: 'SENT',
          },
        },
      },
      include: {
        customer: { include: { user: true } },
        agent: { include: { user: true } },
        address: true,
        items: { include: { category: true } },
        statusHistory: true,
        weightRecords: true,
      },
    });

    // Update agent status if applicable
    if (order.agentId) {
      let agentState = 'ASSIGNED';
      if (newStatus === 'AGENT_ON_WAY') agentState = 'EN_ROUTE';
      if (newStatus === 'AGENT_ARRIVED') agentState = 'ARRIVED';
      if (newStatus === 'WEIGHING') agentState = 'WEIGHING';
      if (newStatus === 'PICKUP_COMPLETED' || newStatus === 'SETTLEMENT_COMPLETED') agentState = 'AVAILABLE';

      await db.agent.update({
        where: { id: order.agentId },
        data: { status: agentState },
      });
    }

    broadcaster.broadcast('ORDER_UPDATED', updatedOrder);

    return NextResponse.json({
      success: true,
      message: `Order status updated to ${newStatus}`,
      data: updatedOrder,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
