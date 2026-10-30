import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import {
  executeAgentAcceptTransaction,
  isAgentEligibleForServiceArea,
} from '@/lib/services/agentService';
import { getAuthUser } from '@/lib/auth/middleware';
import { broadcaster } from '@/lib/realtime';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { SAFE_HYDRATED_ORDER_INCLUDE, formatOrderResponse } from '@/lib/orders/orderFormat';
import {
  broadcastAgentBookingNotification,
  persistAgentBookingNotificationOnce,
} from '@/lib/services/agentBookingNotification';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authUser = await getAuthUser(req);

    // 1. Authenticate JWT & Require AGENT role
    if (!authUser) {
      return errorResponse('UNAUTHORIZED', 'Authentication is required.', 401);
    }
    if (authUser.role !== 'AGENT' || !authUser.agentId) {
      return errorResponse('FORBIDDEN', 'Only field agents can accept pickup assignments.', 403);
    }

    const agentId = authUser.agentId;

    // 2. Load Agent Profile & Check Availability Status
    const agent = await db.agent.findUnique({
      where: { id: agentId },
      include: { user: { select: { id: true, name: true, phone: true } } },
    });

    if (!agent) {
      return errorResponse('AGENT_NOT_FOUND', 'Agent profile not found.', 404);
    }

    if (agent.status === 'SUSPENDED' || agent.status === 'DEACTIVATED') {
      return errorResponse(
        'FORBIDDEN',
        'Agent account is inactive or suspended. Please contact the administrator.',
        403
      );
    }

    // 3. Load Order & Address for Service Area Matching
    const order = await db.order.findFirst({
      where: {
        OR: [{ id }, { orderNumber: id }],
      },
      include: {
        address: true,
      },
    });

    if (!order) {
      return errorResponse('ORDER_NOT_FOUND', `Order #${id} not found.`, 404);
    }

    if (agent.status === 'OFFLINE') {
      return errorResponse(
        'AGENT_NOT_AVAILABLE',
        'Agent is currently offline or unavailable for new pickups.',
        400
      );
    }

    const isOwnOrder = order.agentId === agentId;
    const canAcceptOrReaccept =
      isOwnOrder &&
      ['BOOKING_RECEIVED', 'AGENT_BEING_ASSIGNED', 'AGENT_ASSIGNED', 'AGENT_ACCEPTED'].includes(order.status);

    if (agent.status !== 'AVAILABLE' && !canAcceptOrReaccept) {
      if (agent.status === 'ASSIGNED') {
        return errorResponse(
          'AGENT_HAS_ACTIVE_ORDER',
          'Finish or cancel the active pickup before accepting another assignment.',
          409
        );
      }
      return errorResponse(
        'AGENT_NOT_AVAILABLE',
        'Agent is currently offline or unavailable for new pickups.',
        400
      );
    }

    // 4. Check Order State & Idempotency / Conflict
    if (
      order.agentId === agentId &&
      !['BOOKING_RECEIVED', 'AGENT_BEING_ASSIGNED', 'AGENT_ASSIGNED'].includes(order.status)
    ) {
      // Idempotent retry: Order is already accepted or beyond by this exact agent
      const hydratedOrder = await db.order.findUnique({
        where: { id: order.id },
        include: SAFE_HYDRATED_ORDER_INCLUDE,
      });
      return successResponse(
        formatOrderResponse(hydratedOrder, {
          id: order.id,
          orderNumber: order.orderNumber,
          agentId: order.agentId,
          status: order.status,
        })
      );
    }

    if (order.agentId !== null && order.agentId !== agentId) {
      // Conflict: Order has already been accepted/assigned to another agent
      return errorResponse(
        'CONFLICT',
        'Pickup has already been assigned to another agent.',
        409
      );
    }

    if (['CANCELLED', 'PICKUP_COMPLETED', 'SETTLEMENT_COMPLETED'].includes(order.status)) {
      return errorResponse('ORDER_UNAVAILABLE', 'This pickup is no longer available for acceptance.', 400);
    }

    if (order.financialDirection === 'CUSTOMER_PAYS' && order.paymentStatus !== 'CAPTURED') {
      return errorResponse('PAYMENT_NOT_CAPTURED', 'This pickup is not available until payment is confirmed.', 409);
    }

    // 5. Active Order in Progress Check (Pre-check)
    if (!isOwnOrder) {
      const activeOrder = await db.order.findFirst({
        where: {
          agentId,
          status: { in: ['AGENT_ASSIGNED', 'AGENT_ACCEPTED', 'AGENT_ON_WAY', 'AGENT_ARRIVED', 'WASTE_VERIFICATION', 'WEIGHING'] },
        },
        select: { id: true },
      });
      if (activeOrder && activeOrder.id !== order.id) {
        return errorResponse(
          'AGENT_HAS_ACTIVE_ORDER',
          'Finish or cancel the active pickup before accepting another assignment.',
          409
        );
      }
    }

    // 6. Service Area Status & Eligibility Check
    // If the order is already assigned to this agent by dispatcher/system, bypass area eligibility check
    if (order.agentId !== agentId) {
      const orderAreaName = order.address?.area;

      // Verify that the service area itself is ACTIVE in the database
      if (orderAreaName && typeof db.serviceArea?.findFirst === 'function') {
        const areaRecord = await db.serviceArea.findFirst({
          where: {
            OR: [
              { name: { equals: orderAreaName, mode: 'insensitive' } },
              { id: { equals: orderAreaName, mode: 'insensitive' } },
              { name: { contains: orderAreaName, mode: 'insensitive' } },
            ],
          },
          select: { status: true },
        }).catch(() => null);

        if (areaRecord && areaRecord.status !== 'ACTIVE') {
          return errorResponse(
            'SERVICE_AREA_INACTIVE',
            'Service area is currently inactive or suspended.',
            400
          );
        }
      }

      // Verify agent eligibility for the service area
      if (!isAgentEligibleForServiceArea(agent.serviceAreas, orderAreaName)) {
        return errorResponse(
          'OUT_OF_SERVICE_AREA',
          'Order service area is not covered by your agent profile.',
          403
        );
      }
    }

    // 7. Atomic Conditional Update (Race-Condition Prevention)
    // Update status to AGENT_ACCEPTED if order is unassigned or assigned to this agent in AGENT_ASSIGNED state
    const assignment = await executeAgentAcceptTransaction(db, {
      order,
      agentId,
      agentName: agent.user.name,
      vehicleNumber: agent.vehicleNumber,
      agentUserId: agent.userId,
      userId: authUser.userId,
    });
    const notificationCreated = assignment.notificationCreated;

    if (!assignment.changed) {
      if (assignment.reason === 'agentSuspended') {
        return errorResponse('FORBIDDEN', 'Agent account is inactive or suspended. Please contact the administrator.', 403);
      }
      if (assignment.reason === 'agentUnavailable') {
        return errorResponse('AGENT_NOT_AVAILABLE', 'Agent is currently offline or unavailable for new pickups.', 400);
      }
      if (assignment.reason === 'activeAssignment') {
        return errorResponse('AGENT_HAS_ACTIVE_ORDER', 'Finish or cancel the active pickup before accepting another assignment.', 409);
      }
      if (assignment.alreadyAssignedToAgent) {
        return successResponse(
          formatOrderResponse(assignment.order, {
            id: order.id,
            orderNumber: order.orderNumber,
            agentId,
            status: assignment.order?.status ?? order.status,
          })
        );
      }
      return errorResponse(
        'CONFLICT',
        'Pickup has already been assigned to another agent.',
        409
      );
    }

    // 7. Post-Acceptance Realtime Event Broadcasting
    const newStatus = 'AGENT_ACCEPTED';
    const updatedOrder = assignment.order;

    if (updatedOrder) {
      broadcaster.broadcast('ORDER_UPDATED', updatedOrder);
      broadcaster.broadcast('ORDER_ACCEPTED', { orderId: order.id, agentId });
      if (notificationCreated) {
        broadcastAgentBookingNotification({
          orderId: order.id,
          orderNumber: order.orderNumber,
          agentId,
          agentUserId: agent.userId,
          status: newStatus,
        }, notificationCreated, (event, payload) => broadcaster.broadcast(event, payload));
      }

      // Phase 4: Dispatch AGENT_ASSIGNED event for authenticated Customer SSE stream
      try {
        const agentAssignedPayload = {
          type: 'AGENT_ASSIGNED',
          orderId: updatedOrder.id,
          orderNumber: updatedOrder.orderNumber,
          customerId: updatedOrder.customerId,
          userId: updatedOrder.customer?.userId,
          agentId: agentId,
          agentName: agent.user.name,
          vehicleNumber: agent.vehicleNumber,
          status: 'AGENT_ACCEPTED',
          assignedAt: new Date().toISOString(),
        };

        broadcaster.broadcast('AGENT_ASSIGNED', agentAssignedPayload);
      } catch (dispatchErr) {
        console.warn('[CUSTOMER DISPATCH ERROR] Safe notification dispatch notice:', dispatchErr);
      }
    }

    return successResponse(
      formatOrderResponse(updatedOrder, {
        id: order.id,
        orderNumber: order.orderNumber,
        agentId: agentId,
        status: newStatus,
      })
    );
  } catch (err: any) {
    console.error('Accept order error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to accept pickup order.', 500);
  }
}
