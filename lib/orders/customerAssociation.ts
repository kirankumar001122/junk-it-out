export function getAuthenticatedOrderCustomerId(
  authUser: { userId: string; customerId?: string | null } | null | undefined,
  user: { id: string; role: string; customer?: { id: string } | null } | null | undefined
) {
  if (
    !authUser?.userId ||
    !authUser.customerId ||
    !user ||
    user.id !== authUser.userId ||
    user.role !== 'CUSTOMER' ||
    user.customer?.id !== authUser.customerId
  ) {
    throw new Error('Authenticated customer profile was not found.');
  }
  return user.customer.id;
}
