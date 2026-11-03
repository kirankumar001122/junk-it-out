export const ACTIVE_AGENT_CONTACT_STATUSES = new Set([
  'AGENT_ASSIGNED',
  'AGENT_ACCEPTED',
  'AGENT_ON_WAY',
  'AGENT_ARRIVED',
  'WEIGHING',
  'WEIGHING_WASTE',
  'WASTE_VERIFICATION',
]);

export const TERMINAL_PICKUP_STATUSES = new Set([
  'PICKUP_COMPLETED',
  'SETTLEMENT_DONE',
  'SETTLEMENT_COMPLETED',
  'COMPLETED',
  'CANCELLED',
]);

export function normalizeOrderStatus(status: unknown): string {
  return typeof status === 'string'
    ? status.trim().toUpperCase().replace(/[\s-]+/g, '_')
    : '';
}

export function isPickupCompletedStatus(status: unknown): boolean {
  const norm = normalizeOrderStatus(status);
  return (
    norm === 'PICKUP_COMPLETED' ||
    norm === 'SETTLEMENT_DONE' ||
    norm === 'SETTLEMENT_COMPLETED' ||
    norm === 'COMPLETED'
  );
}

/**
 * Determines whether a customer is permitted to view the agent's phone number
 * and use the Call Agent functionality.
 *
 * Contact is strictly restricted to active in-progress pickup stages
 * (AGENT_ASSIGNED, AGENT_ACCEPTED, AGENT_ON_WAY, AGENT_ARRIVED, WEIGHING/WEIGHING_WASTE).
 * Once the pickup reaches PICKUP_COMPLETED, SETTLEMENT_DONE, or any later terminal status,
 * customer access to agent contact details is completely revoked.
 */
export function canCustomerContactAgent(status: unknown): boolean {
  const norm = normalizeOrderStatus(status);
  if (TERMINAL_PICKUP_STATUSES.has(norm)) {
    return false;
  }
  return ACTIVE_AGENT_CONTACT_STATUSES.has(norm);
}

export function shouldHideAgentContact(status: unknown): boolean {
  return !canCustomerContactAgent(status);
}
