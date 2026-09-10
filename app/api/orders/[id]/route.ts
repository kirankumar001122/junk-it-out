import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authUser = await getAuthUser(req);

    const order = await db.order.findFirst({
      where: {
        OR: [{ id }, { orderNumber: id }],
      },
      include: {
        customer: { include: { user: true } },
        agent: { include: { user: true } },
        address: true,
        items: { include: { category: true } },
        statusHistory: { orderBy: { timestamp: 'desc' } },
        payments: true,
        invoices: true,
        weightRecords: { orderBy: { createdAt: 'desc' }, take: 1 },
        settlement: true,
      },
    });

    if (!order) {
      return errorResponse('ORDER_NOT_FOUND', `Order #${id} not found.`, 404);
    }

    // Role-based Ownership Authorization Check
    if (!authUser) {
      return errorResponse('UNAUTHORIZED', 'Authentication is required to view order details.', 401);
    }

    if (authUser.role === 'CUSTOMER') {
      const isOwnerCustomer = authUser.customerId && order.customerId === authUser.customerId;
      const isOwnerUser = authUser.userId && order.customer?.userId === authUser.userId;
      if (!isOwnerCustomer && !isOwnerUser) {
        return errorResponse('FORBIDDEN', 'You are not authorized to view details for this order.', 403);
      }
    } else if (authUser.role === 'AGENT') {
      const isAssignedAgent = authUser.agentId && order.agentId === authUser.agentId;
      const isUnassignedOpen = order.status === 'BOOKING_RECEIVED';
      if (!isAssignedAgent && !isUnassignedOpen) {
        return errorResponse('FORBIDDEN', 'Order is not assigned to your agent profile.', 403);
      }
    }

    return successResponse(order);
  } catch (err: any) {
    console.error('Fetch order detail error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to retrieve order details.', 500);
  }
}
