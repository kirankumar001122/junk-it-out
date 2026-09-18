export function validatePhone(phone: string): { valid: boolean; normalized: string; error?: string } {
  if (!phone || typeof phone !== 'string') {
    return { valid: false, normalized: '', error: 'Phone number is required.' };
  }
  const clean = phone.replace(/[\s-]/g, '');
  if (!/^\+?[0-9]{10,13}$/.test(clean)) {
    return { valid: false, normalized: '', error: 'Invalid phone number format. Must be 10 to 12 digits.' };
  }
  const normalized = clean.startsWith('+') ? clean : `+91${clean.replace(/^0+/, '')}`;
  return { valid: true, normalized };
}

export function validateCoordinates(lat: any, lng: any): boolean {
  const latitude = Number(lat);
  const longitude = Number(lng);
  return (
    !isNaN(latitude) &&
    !isNaN(longitude) &&
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
    if (typeof item.estimatedWeight !== 'number' || item.estimatedWeight <= 0) {
      return { valid: false, error: 'Estimated weight must be a positive number.' };
    }
  }

  if (body.photos !== undefined && body.photos !== null && !Array.isArray(body.photos)) {
    return { valid: false, error: 'Photos must be an array of image URLs.' };
  }

  if (body.pickupType === 'SCHEDULED' && (!body.scheduledSlot || typeof body.scheduledSlot !== 'string')) {
    return { valid: false, error: 'A valid date and time slot must be selected for scheduled pickups.' };
  }

  return { valid: true };
}

const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  BOOKING_RECEIVED: ['AGENT_BEING_ASSIGNED', 'AGENT_ASSIGNED', 'AGENT_ACCEPTED', 'CANCELLED'],
  AGENT_BEING_ASSIGNED: ['AGENT_ASSIGNED', 'CANCELLED'],
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
  if (currentStatus === targetStatus) return true;
  const allowed = ALLOWED_STATUS_TRANSITIONS[currentStatus];
  return allowed ? allowed.includes(targetStatus) : false;
}
