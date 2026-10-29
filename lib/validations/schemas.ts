export function validatePhone(phone: string): { valid: boolean; normalized: string; error?: string } {
  if (!phone || typeof phone !== 'string') {
    return { valid: false, normalized: '', error: 'Phone number is required.' };
  }
  const clean = phone.replace(/[\s-]/g, '');

  if (/^[6-9]\d{9}$/.test(clean)) {
    return { valid: true, normalized: `+91${clean}` };
  }
  if (/^91[6-9]\d{9}$/.test(clean)) {
    return { valid: true, normalized: `+91${clean.slice(2)}` };
  }
  if (/^\+91[6-9]\d{9}$/.test(clean)) {
    return { valid: true, normalized: clean };
  }

  return {
    valid: false,
    normalized: '',
    error: 'Invalid Indian phone number format. Must be a 10-digit mobile number, or prefixed with 91 / +91.',
  };
}

export function validateCoordinates(lat: any, lng: any): boolean {
  if (
    lat === null ||
    lat === undefined ||
    lng === null ||
    lng === undefined ||
    lat === '' ||
    lng === '' ||
    (typeof lat !== 'number' && typeof lat !== 'string') ||
    (typeof lng !== 'number' && typeof lng !== 'string')
  ) {
    return false;
  }

  const latitude = Number(lat);
  const longitude = Number(lng);
  return (
    !isNaN(latitude) &&
    !isNaN(longitude) &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export function validateCreateOrderInput(body: any): { valid: boolean; error?: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid request body.' };
  }

  if (!body.address || typeof body.address !== 'object') {
    return { valid: false, error: 'Pickup address details are required.' };
  }

  const { houseNo, street, area, lat, lng } = body.address;
  const effectiveHouseNo = houseNo || body.address.formattedAddress || area;
  const effectiveStreet = street || body.address.formattedAddress || area;
  if (!effectiveHouseNo || !effectiveStreet || !area) {
    return { valid: false, error: 'Pickup area or address is required in address.' };
  }

  if (!validateCoordinates(lat, lng)) {
    return { valid: false, error: 'Valid latitude and longitude coordinates are required for pickup.' };
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return { valid: false, error: 'At least one waste category item must be selected.' };
  }

  for (const item of body.items) {
    if (!item.categoryId || typeof item.categoryId !== 'string') {
      return { valid: false, error: 'Each waste item must specify a valid categoryId.' };
    }
    if (
      typeof item.estimatedWeight !== 'number' ||
      !Number.isFinite(item.estimatedWeight) ||
      item.estimatedWeight <= 0
    ) {
      return { valid: false, error: 'Estimated weight must be a positive number.' };
    }
  }

  if (body.photos !== undefined && body.photos !== null && !Array.isArray(body.photos)) {
    return { valid: false, error: 'Photos must be an array of image URLs.' };
  }

  if (body.pickupType !== undefined && !['ASAP', 'SCHEDULED'].includes(body.pickupType)) {
    return { valid: false, error: 'Pickup type must be ASAP or SCHEDULED.' };
  }

  if (body.pickupType === 'SCHEDULED' && (!body.scheduledSlot || typeof body.scheduledSlot !== 'string')) {
    return { valid: false, error: 'A valid date and time slot must be selected for scheduled pickups.' };
  }

  return { valid: true };
}

export function calculateTotalBookingWeight(
  items: Array<{ estimatedWeight: number }>
): number {
  return items.reduce((total, item) => total + item.estimatedWeight, 0);
}

const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  BOOKING_RECEIVED: ['AGENT_BEING_ASSIGNED', 'AGENT_ASSIGNED', 'AGENT_ACCEPTED', 'CANCELLED'],
  AGENT_BEING_ASSIGNED: ['AGENT_ASSIGNED', 'AGENT_ACCEPTED', 'CANCELLED'],
  AGENT_ASSIGNED: ['AGENT_ACCEPTED', 'AGENT_ON_WAY', 'CANCELLED'],
  AGENT_ACCEPTED: ['AGENT_ON_WAY', 'CANCELLED'],
  AGENT_ON_WAY: ['AGENT_ARRIVED', 'CANCELLED'],
  AGENT_ARRIVED: ['WASTE_VERIFICATION', 'WEIGHING', 'CANCELLED'],
  WASTE_VERIFICATION: ['WEIGHING', 'CANCELLED'],
  WEIGHING: ['PICKUP_COMPLETED', 'CANCELLED'],
  PICKUP_COMPLETED: ['SETTLEMENT_COMPLETED'],
  SETTLEMENT_COMPLETED: [],
  CANCELLED: [],
};

export function validateStatusTransition(currentStatus: string, targetStatus: string): boolean {
  const normCurrent = currentStatus === 'COMPLETED' ? 'PICKUP_COMPLETED' : currentStatus;
  const normTarget = targetStatus === 'COMPLETED' ? 'PICKUP_COMPLETED' : targetStatus;
  if (normCurrent === normTarget) return true;
  const allowed = ALLOWED_STATUS_TRANSITIONS[normCurrent];
  return allowed ? allowed.includes(normTarget) : false;
}


export function validateActualWeightsInput(
  actualWeights: any,
  orderItems?: Array<{ id: string; categoryId: string }>
): { valid: boolean; error?: string } {
  if (!Array.isArray(actualWeights) || actualWeights.length === 0) {
    return { valid: false, error: 'Itemized actual weights array is required.' };
  }

  const matchedItemIds = new Set<string>();

  for (const itemInput of actualWeights) {
    if (!itemInput || typeof itemInput !== 'object') {
      return { valid: false, error: 'Each actual weight item must be an object.' };
    }

    if (
      typeof itemInput.actualWeight !== 'number' ||
      !Number.isFinite(itemInput.actualWeight) ||
      itemInput.actualWeight <= 0
    ) {
      return { valid: false, error: 'Each actual weight must be a positive number for a valid order item.' };
    }

    if (orderItems) {
      const dbItem = orderItems.find(
        (i) =>
          (itemInput.itemId && i.id === itemInput.itemId) ||
          i.categoryId === itemInput.categoryId ||
          i.id === itemInput.categoryId
      );
      if (!dbItem) {
        return { valid: false, error: 'Weight submitted for an item that is not in this order.' };
      }
      if (matchedItemIds.has(dbItem.id)) {
        return { valid: false, error: 'Each order item may only have one actual weight entry.' };
      }
      matchedItemIds.add(dbItem.id);
    }
  }

  return { valid: true };
}
