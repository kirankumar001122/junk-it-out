/**
 * Shared order hydration and response formatting utilities.
 * Centralizes the Prisma include graph and standard DTO mapping for agent/order APIs.
 */

export const SAFE_HYDRATED_ORDER_INCLUDE = {
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
} as const;

export function formatOrderResponse(
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

