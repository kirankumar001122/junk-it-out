const customerEvents = new Set([
  'AGENT_ASSIGNED', 'ORDER_UPDATED', 'ORDER_ACCEPTED', 'ORDER_ASSIGNED',
  'AGENT_STARTED', 'AGENT_ARRIVED', 'ORDER_COMPLETED', 'WEIGHING_STARTED',
]);
const agentEvents = new Set([
  'ORDER_UPDATED', 'ORDER_ACCEPTED', 'ORDER_ASSIGNED', 'AGENT_STARTED',
  'AGENT_ARRIVED', 'ORDER_COMPLETED', 'WEIGHING_STARTED', 'AGENT_LOCATION_UPDATED',
]);

export function canReceiveCustomerEvent(event: string): boolean {
  return customerEvents.has(event);
}

export function canReceiveAgentEvent(event: string): boolean {
  return agentEvents.has(event) || event === 'NEW_PICKUP_AVAILABLE';
}

export function isAgentPickupTarget(agentId: string, targets: unknown): boolean {
  return Array.isArray(targets) && targets.includes(agentId);
}
