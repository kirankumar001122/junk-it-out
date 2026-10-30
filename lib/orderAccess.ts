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
