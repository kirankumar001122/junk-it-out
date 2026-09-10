import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { broadcaster } from '@/lib/realtime';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { cancellationReason, userId } = await req.json();

    const order = await db.order.findUnique({
      where: { id },
      include: { customer: { include: { user: true } }, agent: true },
    });

    if (!order) {
      return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
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
