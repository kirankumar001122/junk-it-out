export const DISPUTE_STATUSES = [
  'OPEN',
  'UNDER_REVIEW',
  'AWAITING_CUSTOMER',
  'RESOLVED',
  'REJECTED',
] as const;

export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

export const PERMITTED_DISPUTE_TRANSITIONS: Record<DisputeStatus, readonly DisputeStatus[]> = {
  OPEN: ['UNDER_REVIEW', 'REJECTED'],
  UNDER_REVIEW: ['AWAITING_CUSTOMER', 'RESOLVED', 'REJECTED'],
  AWAITING_CUSTOMER: ['UNDER_REVIEW', 'RESOLVED', 'REJECTED'],
  RESOLVED: ['UNDER_REVIEW'], // Admin can reopen if dispute was settled prematurely
  REJECTED: ['UNDER_REVIEW'], // Admin can reopen if fresh evidence is presented
};

export function isValidDisputeStatus(status: string): status is DisputeStatus {
  return (DISPUTE_STATUSES as readonly string[]).includes(status);
}

export function validateDisputeTransition(
  currentStatus: string,
  nextStatus: string
): { valid: boolean; error?: string } {
  const normalizedCurrent = (currentStatus || '').toUpperCase().trim();
  const normalizedNext = (nextStatus || '').toUpperCase().trim();

  // Handle legacy mappings safely if historical complaints have 'PENDING' or 'IN_PROGRESS'
  const mappedCurrent: DisputeStatus =
    normalizedCurrent === 'PENDING' || normalizedCurrent === 'IN_PROGRESS'
      ? 'UNDER_REVIEW'
      : normalizedCurrent === 'DISMISSED'
      ? 'REJECTED'
      : (normalizedCurrent as DisputeStatus);

  if (!isValidDisputeStatus(mappedCurrent)) {
    return {
      valid: false,
      error: `Invalid current dispute status "${currentStatus}". Must be one of: ${DISPUTE_STATUSES.join(', ')}`,
    };
  }

  if (!isValidDisputeStatus(normalizedNext)) {
    return {
      valid: false,
      error: `Invalid target dispute status "${nextStatus}". Permitted statuses are: ${DISPUTE_STATUSES.join(', ')}`,
    };
  }

  if (mappedCurrent === normalizedNext) {
    return { valid: true };
  }

  const allowed = PERMITTED_DISPUTE_TRANSITIONS[mappedCurrent];
  if (!allowed || !allowed.includes(normalizedNext)) {
    return {
      valid: false,
      error: `Illegal status transition from "${mappedCurrent}" to "${normalizedNext}". Permitted next statuses from "${mappedCurrent}" are: ${allowed ? allowed.join(', ') : 'None'}.`,
    };
  }

  return { valid: true };
}

