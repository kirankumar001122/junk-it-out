import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { isOrderPaymentGateSatisfied } from '@/lib/payments/policy';
import { LEGACY_ADDRESS_SELECT } from '@/lib/services/customerService';
import { readWithFormattedAddressFallback } from '@/lib/orders/readWithFormattedAddressFallback';
import type { Prisma } from '@prisma/client';
import { isAssignedAgent, isCustomerOrderOwner } from '@/lib/auth/accessPolicy';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return errorResponse('UNAUTHORIZED', 'Authentication is required to view order details.', 401);
    }

    const orderQuery = {
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
    } satisfies Prisma.OrderFindFirstArgs;

    const order = await readWithFormattedAddressFallback(
      () => db.order.findFirst(orderQuery),
      () => db.order.findFirst({
        ...orderQuery,
        include: {
          ...orderQuery.include,
          address: { select: LEGACY_ADDRESS_SELECT },
        },
      }),
      (legacyOrder) => legacyOrder
        ? {
            ...legacyOrder,
            address: legacyOrder.address
              ? { ...legacyOrder.address, formattedAddress: null }
              : null,
          }
        : legacyOrder
    );

    if (!order) {
      return errorResponse('ORDER_NOT_FOUND', `Order #${id} not found.`, 404);
    }

    // Role-based Ownership Authorization Check
    if (authUser.role === 'CUSTOMER') {
      if (!isCustomerOrderOwner(authUser, order)) {
        return errorResponse('FORBIDDEN', 'You are not authorized to view details for this order.', 403);
      }
      if (!isOrderPaymentGateSatisfied(order)) {
        return errorResponse('ORDER_NOT_AVAILABLE', 'This pickup is available after payment is confirmed.', 403);
      }
    } else if (authUser.role === 'AGENT') {
      if (!isAssignedAgent(authUser.agentId, order.agentId)) {
        return errorResponse('FORBIDDEN', 'Order is not assigned to your agent profile.', 403);
      }
      if (!isOrderPaymentGateSatisfied(order)) {
        return errorResponse('ORDER_NOT_AVAILABLE', 'This pickup is available after payment is confirmed.', 403);
      }
    } else if (authUser.role !== 'ADMIN' && authUser.role !== 'SUPER_ADMIN') {
      return errorResponse('FORBIDDEN', 'You are not authorized to view order details.', 403);
    }

    return successResponse(order);
  } catch (err: any) {
    console.error('Fetch order detail error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to retrieve order details.', 500);
  }
}
