import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { getOrderIdentifierWhere, isCustomerOrderOwner } from '@/lib/orderAccess';
import { isAgentEligibleForServiceArea } from '@/lib/services/agentService';

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
            financialDirection: true,
            paymentStatus: true,
            customer: {
              select: {
                user: { select: { name: true, phone: true } },
              },
            },
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
            customer: {
              include: {
                user: { select: { id: true, name: true, phone: true, email: true } },
              },
            },
            agent: {
              include: {
                user: { select: { id: true, name: true, phone: true, email: true } },
              },
            },
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
      const customerUserId = order.customer && 'userId' in order.customer && typeof order.customer.userId === 'string'
        ? order.customer.userId
        : null;
      if (!isCustomerOrderOwner({
        customerId: order.customerId,
        customer: { userId: customerUserId },
      }, authUser)) {
        return errorResponse('FORBIDDEN', 'You are not authorized to view details for this order.', 403);
      }
    } else if (authUser.role === 'AGENT') {
      const isAssignedAgent = Boolean(authUser.agentId && order.agentId === authUser.agentId);
      const isUnassignedOpen =
        order.agentId === null &&
        (order.status === 'BOOKING_RECEIVED' || order.status === 'AGENT_BEING_ASSIGNED');
      if (!isAssignedAgent && !isUnassignedOpen) {
        return errorResponse('FORBIDDEN', 'Order is not assigned to your agent profile.', 403);
      }

      if (!isAssignedAgent) {

        const agent = authUser.agentId
          ? await db.agent.findUnique({
              where: { id: authUser.agentId },
              select: { id: true, status: true, serviceAreas: true },
            })
          : null;
        if (!agent || agent.status !== 'AVAILABLE') {
          return errorResponse('FORBIDDEN', 'Only available agents may view open pickup details.', 403);
        }

        const activeOrder = await db.order.findFirst({
          where: {
            agentId: agent.id,
            status: { in: ['AGENT_ASSIGNED', 'AGENT_ACCEPTED', 'AGENT_ON_WAY', 'AGENT_ARRIVED', 'WASTE_VERIFICATION', 'WEIGHING'] },
          },
          select: { id: true },
        });
        if (activeOrder) {
          return errorResponse('FORBIDDEN', 'An active pickup is already assigned to your agent profile.', 403);
        }

        if (order.financialDirection === 'CUSTOMER_PAYS' && order.paymentStatus !== 'CAPTURED') {
          return errorResponse('FORBIDDEN', 'Pickup details are not available until customer payment is confirmed.', 403);
        }

        if (!isAgentEligibleForServiceArea(agent.serviceAreas, order.address?.area)) {
          return errorResponse('FORBIDDEN', 'Order service area is not covered by your agent profile.', 403);
        }

        return successResponse({
          id: order.id,
          orderNumber: order.orderNumber,
          agentId: order.agentId,
          status: order.status,
          address: { area: order.address?.area ?? null },
          items: order.items.map((item) => ({
            id: item.id,
            categoryId: item.categoryId,
            estimatedWeight: item.estimatedWeight,
            category: item.category,
          })),
        });
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
