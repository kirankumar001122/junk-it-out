export function parseAddressCoordinate(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

export function getPreferredSavedAddress<T extends { isDefault?: boolean }>(addresses: T[]): T | null {
  return addresses.find((address) => address.isDefault) || null;
}

export function isCustomerStreamRole(role: string | null | undefined, userId: string | null | undefined): boolean {
  return role === 'CUSTOMER' && Boolean(userId);
}
