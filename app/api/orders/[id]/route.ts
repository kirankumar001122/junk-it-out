import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import {
  getOrderIdentifierWhere,
  isCustomerOrderOwner,
  isAgentOrderAssigned,
  isOrderOpenForAssignment,
} from '@/lib/orderAccess';
import { isAgentEligibleForServiceArea } from '@/lib/services/agentService';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rawParams = await params;
    const rawId = rawParams?.id;
    const id = typeof rawId === 'string' ? decodeURIComponent(rawId).trim() : '';

    if (!id) {
      return errorResponse('INVALID_ORDER_ID', 'A valid order identifier is required.', 400);
    }

    const authUser = await getAuthUser(req);

    // Role-based Ownership Authorization Check
    if (!authUser) {
      return errorResponse('UNAUTHORIZED', 'Authentication is required to view order details.', 401);
    }

    const orderWhere = id.toUpperCase() !== id && id.toLowerCase().startsWith('jio-')
      ? { OR: [{ id }, { orderNumber: id }, { orderNumber: id.toUpperCase() }] }
      : getOrderIdentifierWhere(id);

    const order = authUser.role === 'AGENT'
      ? await db.order.findFirst({
          where: orderWhere,
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
          where: orderWhere,
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
            settlement: {
              select: {
                totalWeightKg: true,
                amount: true,
                status: true,
              },
            },
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
      const isAssignedAgent = isAgentOrderAssigned(order, authUser);
      const isUnassignedOpen = isOrderOpenForAssignment(order);
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
    console.error('Fetch order detail error:', {
      code: err?.code || 'UNKNOWN',
      name: err?.name || 'Error',
    });
    const errorMessage = String(err?.message || '');
    const databaseUnavailable =
      errorMessage.includes('Can\'t reach database server') ||
      errorMessage.includes('Authentication failed against database server') ||
      errorMessage.includes('P1001') ||
      errorMessage.includes('P1000') ||
      errorMessage.includes('[YOUR-PASSWORD]');

    return errorResponse(
      databaseUnavailable ? 'DATABASE_UNAVAILABLE' : 'INTERNAL_SERVER_ERROR',
      databaseUnavailable
        ? 'Order tracking is temporarily unavailable because the database is unreachable. Please try again shortly.'
        : 'Failed to retrieve order details.',
      databaseUnavailable ? 503 : 500
    );
  }
}
