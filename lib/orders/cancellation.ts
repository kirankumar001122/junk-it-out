import { validateStatusTransition } from '@/lib/validations/schemas';

export const CANCELLABLE_ORDER_STATUSES = [
  'BOOKING_RECEIVED',
  'AGENT_BEING_ASSIGNED',
  'AGENT_ASSIGNED',
  'AGENT_ACCEPTED',
  'AGENT_ON_WAY',
  'AGENT_ARRIVED',
  'WASTE_VERIFICATION',
  'WEIGHING',
] as const;

export type CancellationRole = 'CUSTOMER' | 'AGENT' | 'ADMIN' | 'SUPER_ADMIN';

export function canCancelOrder(
  user: {
    userId: string;
    role: CancellationRole;
    customerId?: string | null;
    agentId?: string | null;
  },
  order: {
    customerId: string;
    agentId: string | null;
    status: string;
  },
) {
  if (
    !CANCELLABLE_ORDER_STATUSES.includes(
      order.status as (typeof CANCELLABLE_ORDER_STATUSES)[number],
    ) ||
    !validateStatusTransition(order.status, 'CANCELLED')
  ) {
    return false;
  }

  if (user.role === 'CUSTOMER') {
    return user.customerId === order.customerId;
  }

  if (user.role === 'AGENT') {
    return Boolean(user.agentId && user.agentId === order.agentId);
  }

  return user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
}
