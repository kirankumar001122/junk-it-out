export function getOrderIdentifierWhere(identifier: string) {
  return {
    OR: [{ id: identifier }, { orderNumber: identifier }],
  };
}

export function isCustomerOrderOwner(
  order: {
    customerId: string;
    customer?: { userId?: string | null } | null;
  },
  authUser: { customerId?: string | null; userId?: string | null },
) {
  return Boolean(
    (authUser.customerId && order.customerId === authUser.customerId) ||
      (authUser.userId && order.customer?.userId === authUser.userId),
  );
}

export function isAgentOrderAssigned(
  order: { agentId?: string | null },
  authUser: { agentId?: string | null },
): boolean {
  return Boolean(authUser.agentId && order.agentId === authUser.agentId);
}

export function isOrderOpenForAssignment(order: {
  agentId?: string | null;
  status?: string | null;
}): boolean {
  return (
    order.agentId === null &&
    (order.status === 'BOOKING_RECEIVED' || order.status === 'AGENT_BEING_ASSIGNED')
  );
}
