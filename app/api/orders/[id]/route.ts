import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { getOrderIdentifierWhere, isCustomerOrderOwner } from '@/lib/orderAccess';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authUser = await getAuthUser(req);

    // Role-based Ownership Authorization Check
    if (!authUser) {
      return errorResponse('UNAUTHORIZED', 'Authentication is required to view order details.', 401);
    }

    const order = authUser.role === 'AGENT'
      ? await db.order.findFirst({
          where: getOrderIdentifierWhere(id),
          select: {
            id: true,
            orderNumber: true,
            customerId: true,
            agentId: true,
            status: true,
            address: {
              select: {
                name: true,
                houseNo: true,
                street: true,
                area: true,
                lat: true,
                lng: true,
                pickupInstructions: true,
              },
            },
            items: {
              select: {
                id: true,
                categoryId: true,
                estimatedWeight: true,
                actualWeight: true,
                category: { select: { id: true, name: true } },
              },
            },
          },
        })
      : await db.order.findFirst({
          where: getOrderIdentifierWhere(id),
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

    if (authUser.role === 'CUSTOMER') {
      if (!isCustomerOrderOwner(order, authUser)) {
        return errorResponse('FORBIDDEN', 'You are not authorized to view details for this order.', 403);
      }
    } else if (authUser.role === 'AGENT') {
      const isAssignedAgent = authUser.agentId && order.agentId === authUser.agentId;
      const isUnassignedOpen = order.status === 'BOOKING_RECEIVED';
      if (!isAssignedAgent && !isUnassignedOpen) {
        return errorResponse('FORBIDDEN', 'Order is not assigned to your agent profile.', 403);
      }
    }

    const locations = order.agentId
      ? await db.agentLocation.findMany({
          where: { orderId: order.id, agentId: order.agentId },
          orderBy: { timestamp: 'desc' },
          take: 1,
        })
      : [];

    return successResponse({ ...order, locations });
  } catch (err: any) {
    console.error('Fetch order detail error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to retrieve order details.', 500);
  }
}
