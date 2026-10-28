import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requireAdminUser } from '@/lib/auth/middleware';
import { broadcaster } from '@/lib/realtime';
import { validateStatusTransition } from '@/lib/validations/schemas';
import { transitionOrder } from '@/lib/services/orderLifecycle';
import { runBackgroundTask } from '@/lib/utils/backgroundTask';

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

    const effectiveStatus = newStatus === 'COMPLETED' ? 'PICKUP_COMPLETED' : newStatus;

    if (!validateStatusTransition(oldStatus, effectiveStatus)) {
      return NextResponse.json({ success: false, message: `Invalid status transition from ${oldStatus} to ${effectiveStatus}.` }, { status: 400 });
    }

    // Idempotency check: if status is already the same, return order directly
    if (oldStatus === effectiveStatus) {
      return NextResponse.json({ success: true, message: 'Status already updated', data: order });
    }

    let agentState = 'ASSIGNED';
    if (effectiveStatus === 'AGENT_ON_WAY') agentState = 'EN_ROUTE';
    if (effectiveStatus === 'AGENT_ARRIVED') agentState = 'ARRIVED';
    if (effectiveStatus === 'WEIGHING') agentState = 'WEIGHING';
    if (effectiveStatus === 'PICKUP_COMPLETED' || effectiveStatus === 'SETTLEMENT_COMPLETED') agentState = 'AVAILABLE';

    const transition = await transitionOrder<any>({
      orderId: id,
      expectedStatus: oldStatus,
      newStatus: effectiveStatus,
      changedByUserId: authUser.userId,
      notes: notes || `Status changed from ${oldStatus} to ${effectiveStatus}`,
      include: {
        customer: { include: { user: true } },
        agent: { include: { user: true } },
        address: true,
        items: { include: { category: true } },
        statusHistory: true,
        weightRecords: true,
      },
      afterHistory: async (tx) => {
        if (order.agentId) {
          await tx.agent.update({
            where: { id: order.agentId },
            data: { status: agentState },
          });
        }
      },
    });

    if (!transition.changed || !transition.order) {
      return NextResponse.json({ success: false, message: 'Order state changed concurrently; please refresh.' }, { status: 409 });
    }

    const updatedOrder = transition.order;

    broadcaster.broadcast('ORDER_UPDATED', updatedOrder);

    runBackgroundTask(async () => {
      try {
        const customerUserId = updatedOrder.customer?.userId || order.customer?.userId;
        const customerPhone = updatedOrder.customer?.user?.phone || order.customer?.user?.phone;
        if (!customerUserId || !customerPhone) return;

        await db.notification.create({
          data: {
            userId: customerUserId,
            orderId: id,
            type: 'WHATSAPP',
            recipient: customerPhone,
            content: `Pickup ${order.orderNumber} update: Status is now ${newStatus.replace(/_/g, ' ')}.`,
            status: 'SENT',
          },
        });
      } catch (notifErr: any) {
        console.warn('[STATUS NOTIFICATION NOTICE] Safe notification error:', notifErr?.message);
      }
    });

    return NextResponse.json({
      success: true,
      message: `Order status updated to ${newStatus}`,
      data: updatedOrder,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
