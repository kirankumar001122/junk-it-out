const COMPLETED_PICKUP_STATUSES = new Set(['PICKUP_COMPLETED', 'SETTLEMENT_COMPLETED']);

export function normalizeOrderStatus(status: unknown) {
  return typeof status === 'string'
    ? status.trim().toUpperCase().replace(/[\s-]+/g, '_')
    : '';
}

export function isPickupCompletedStatus(status: unknown) {
  return COMPLETED_PICKUP_STATUSES.has(normalizeOrderStatus(status));
}
