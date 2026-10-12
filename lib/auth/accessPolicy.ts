export function isAdminPrincipal(role: string | null | undefined): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}

export function isVerifiedCustomerPrincipal(role: string | null | undefined, customerId: string | null | undefined): customerId is string {
  return role === 'CUSTOMER' && Boolean(customerId);
}

export function isCustomerOrderOwner(
  principal: { customerId?: string | null; userId?: string | null },
  order: { customerId: string; customer?: { userId: string } | null }
): boolean {
  return Boolean((principal.customerId && order.customerId === principal.customerId) ||
    (principal.userId && order.customer?.userId === principal.userId));
}

export function isAssignedAgent(agentId: string | null | undefined, orderAgentId: string | null | undefined): boolean {
  return Boolean(agentId && orderAgentId && agentId === orderAgentId);
}
