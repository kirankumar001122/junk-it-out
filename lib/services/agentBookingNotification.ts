import type { Prisma } from '@prisma/client';

export type AgentBookingAssignment = {
  orderId: string;
  orderNumber: string;
  agentId: string;
  agentUserId: string;
  status: string;
};

export type AgentPickupOffer = {
  notificationId?: string;
  orderId: string;
  orderNumber: string;
  agentId: string;
  agentUserId: string;
  agentPhone: string;
  pickupAddress: string;
  latitude: number;
  longitude: number;
  mapsLink: string;
};

export function getAgentBookingNotificationId(orderId: string, agentId: string) {
  return `agent-booking-assignment-${orderId}-${agentId}`;
}

export function buildAgentBookingNotificationData(assignment: AgentBookingAssignment) {
  return {
    id: getAgentBookingNotificationId(assignment.orderId, assignment.agentId),
    userId: assignment.agentUserId,
    orderId: assignment.orderId,
    type: 'AGENT_BOOKING_ASSIGNED',
    recipient: `agent:${assignment.agentId}`,
    content: `Pickup order ${assignment.orderNumber} has been assigned to you.`,
    status: 'QUEUED',
    provider: 'IN_APP',
    deliveryStatus: 'queued',
    statusDescription: 'Queued for agent realtime delivery.',
  };
}

/**
 * Persist one in-app assignment notification per booking. The deterministic
 * primary key makes concurrent/retried assignment handlers idempotent without
 * requiring a schema migration.
 */
export async function persistAgentBookingNotificationOnce(
  tx: Pick<Prisma.TransactionClient, 'notification'>,
  assignment: AgentBookingAssignment,
) {
  const result = await tx.notification.createMany({
    data: [buildAgentBookingNotificationData(assignment)],
    skipDuplicates: true,
  });

  return result.count === 1;
}

export function broadcastAgentBookingNotification(
  assignment: AgentBookingAssignment,
  created: boolean,
  broadcast: (event: string, payload: unknown) => void,
) {
  if (!created) return false;

  broadcast('AGENT_BOOKING_ASSIGNED', {
    notificationId: getAgentBookingNotificationId(assignment.orderId, assignment.agentId),
    orderId: assignment.orderId,
    orderNumber: assignment.orderNumber,
    agentId: assignment.agentId,
    status: assignment.status,
  });
  return true;
}

export function getAgentPickupNotificationId(orderId: string, _agentId: string) {
  // One pickup can only be offered to one agent, even when concurrent
  // dispatch attempts calculate different candidates.
  return `agent-pickup-available-${orderId}`;
}

export function buildAgentPickupNotificationData(offer: AgentPickupOffer) {
  return {
    id: getAgentPickupNotificationId(offer.orderId, offer.agentId),
    userId: offer.agentUserId,
    orderId: offer.orderId,
    type: 'AGENT_PICKUP_AVAILABLE',
    recipient: offer.agentPhone,
    content: `Pickup ${offer.orderNumber} is available at ${offer.pickupAddress} (${offer.latitude}, ${offer.longitude}). Map: ${offer.mapsLink}`,
    status: 'QUEUED',
    provider: 'FAST2SMS',
    deliveryStatus: 'queued',
    statusDescription: 'Queued for Fast2SMS WhatsApp delivery.',
  };
}

export async function persistAgentPickupNotificationsOnce(
  tx: Pick<Prisma.TransactionClient, 'notification'>,
  offers: AgentPickupOffer[],
) {
  if (offers.length === 0) return 0;
  const result = await tx.notification.createMany({
    data: offers.map(buildAgentPickupNotificationData),
    skipDuplicates: true,
  });
  return result.count;
}

export type AgentPickupDeliveryResult = {
  success: boolean;
  requestId?: string;
};

/** Delivery state is persisted separately from job creation so failed sends can be retried. */
export async function deliverAgentPickupNotifications(
  offers: AgentPickupOffer[],
  dependencies: {
    claim: (notificationId: string) => Promise<boolean>;
    send: (offer: AgentPickupOffer) => Promise<AgentPickupDeliveryResult>;
    markSent: (notificationId: string, requestId?: string) => Promise<void>;
    markFailed: (notificationId: string) => Promise<void>;
  },
) {
  for (const offer of offers) {
    const notificationId = offer.notificationId || getAgentPickupNotificationId(offer.orderId, offer.agentId);
    if (!(await dependencies.claim(notificationId))) continue;

    try {
      const result = await dependencies.send(offer);
      if (result.success) {
        await dependencies.markSent(notificationId, result.requestId);
      } else {
        await dependencies.markFailed(notificationId);
      }
    } catch {
      await dependencies.markFailed(notificationId);
    }
  }
}
