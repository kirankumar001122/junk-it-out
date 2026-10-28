import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { broadcaster } from '@/lib/realtime';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

const SAFE_HYDRATED_ORDER_INCLUDE = {
  agent: {
    include: {
      user: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
    },
  },
  customer: {
    include: {
      user: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
    },
  },
  address: true,
  items: {
    include: {
      category: true,
    },
  },
};

function formatOrderResponse(
  orderData: any,
  fallback: { id: string; orderNumber: string; agentId?: string | null; status: string }
) {
  if (!orderData) {
    return {
      id: fallback.id,
      orderId: fallback.id,
      orderNumber: fallback.orderNumber,
      agentId: fallback.agentId,
      status: fallback.status,
    };
  }
  return {
    ...orderData,
    orderId: orderData.id ?? fallback.id,
  };
}

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
      include: { user: true },
    });

    if (!agent) {
      return errorResponse('AGENT_NOT_FOUND', 'Agent profile not found.', 404);
    }

    if (agent.status !== 'AVAILABLE') {
      return errorResponse(
        'AGENT_NOT_AVAILABLE',
        'Agent is currently offline or unavailable for new pickups.',
        400
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

    // 5. Service Area Matching Check
    // If the order is already assigned to this agent by dispatcher/system, bypass area eligibility check
    if (order.agentId !== agentId) {
      const orderAreaName = order.address?.area;
      if (agent.serviceAreas && agent.serviceAreas.trim() !== '' && agent.serviceAreas.toLowerCase() !== 'all' && orderAreaName) {
        const normalizedArea = orderAreaName.toLowerCase();
        const agentAreas = agent.serviceAreas.toLowerCase().split(',').map((a) => a.trim());
        const isEligible = agentAreas.some((area) => normalizedArea.includes(area) || area.includes(normalizedArea));

        if (!isEligible) {
          return errorResponse(
            'OUT_OF_SERVICE_AREA',
            'Order service area is not covered by your agent profile.',
            403
          );
        }
      }
    }

    // 6. Atomic Conditional Update (Race-Condition Prevention)
    const oldStatus = order.status;
    const newStatus = 'AGENT_ACCEPTED';

    const txSuccess = await db.$transaction(async (tx) => {
      const updateResult = await tx.order.updateMany({
        where: {
          id: order.id,
          OR: [
            { agentId: null, status: { in: ['BOOKING_RECEIVED', 'AGENT_BEING_ASSIGNED', 'AGENT_ASSIGNED'] } },
            { agentId: agentId, status: { in: ['BOOKING_RECEIVED', 'AGENT_BEING_ASSIGNED', 'AGENT_ASSIGNED'] } },
          ],
        },
        data: {
          agentId: agentId,
          status: 'AGENT_ACCEPTED',
        },
      });

      if (updateResult.count === 0) {
        return false;
      }

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          oldStatus,
          newStatus,
          changedByUserId: authUser.userId || null,
          notes: `Pickup accepted by field agent ${agent.user.name} (${agent.vehicleNumber}).`,
        },
      });

      await tx.agent.update({
        where: { id: agentId },
        data: { status: 'ASSIGNED' },
      });

      return true;
    });

    if (!txSuccess) {
      // Another concurrent request updated the order first. Re-verify state.
      const recheckOrder = await db.order.findUnique({
        where: { id: order.id },
        include: SAFE_HYDRATED_ORDER_INCLUDE,
      });
      if (recheckOrder?.agentId === agentId) {
        return successResponse(
          formatOrderResponse(recheckOrder, {
            id: order.id,
            orderNumber: order.orderNumber,
            agentId: agentId,
            status: recheckOrder.status,
          })
        );
      }
      return errorResponse(
        'CONFLICT',
        'Pickup has already been assigned to another agent.',
        409
      );
    }

    // Fetch updated order for broadcasting
    const updatedOrder = await db.order.findUnique({
      where: { id: order.id },
      include: SAFE_HYDRATED_ORDER_INCLUDE,
    });

    if (updatedOrder) {
      broadcaster.broadcast('ORDER_UPDATED', updatedOrder);
      broadcaster.broadcast('ORDER_ACCEPTED', { orderId: order.id, agentId });

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
