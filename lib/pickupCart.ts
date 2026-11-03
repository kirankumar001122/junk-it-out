export type PickupCartItem = { categoryId: string; quantity: number };

export const ACTIVE_CUSTOMER_CATEGORIES = [
  'E-Waste',
  'Household Dry Waste',
  'Paper & Cardboard',
  'Plastic Waste',
] as const;

export function isCustomerPickupCategory(categoryName?: string | null): boolean {
  if (!categoryName) return false;
  return (ACTIVE_CUSTOMER_CATEGORIES as readonly string[]).includes(categoryName.trim());
}

const CART_KEY = 'junk-it-out-pickup-cart';
const CART_EVENT = 'junk-it-out-cart-updated';

export function readPickupCart(): PickupCartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const value = JSON.parse(window.sessionStorage.getItem(CART_KEY) || '[]');
    return Array.isArray(value) ? value.filter((item) => item?.categoryId) : [];
  } catch {
    return [];
  }
}

export function addToPickupCart(categoryId: string) {
  const items = readPickupCart();
  const existing = items.find((item) => item.categoryId === categoryId);
  const next = existing
    ? items.map((item) => (item.categoryId === categoryId ? { ...item, quantity: Math.min(500, item.quantity + 1) } : item))
    : [...items, { categoryId, quantity: 1 }];
  window.sessionStorage.setItem(CART_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(CART_EVENT));
  return next;
}

export function updatePickupCartQuantity(categoryId: string, quantity: number) {
  if (quantity <= 0) {
    return removeFromPickupCart(categoryId);
  }
  const safeQuantity = Math.max(1, Math.min(500, Math.round(Number(quantity) || 1)));
  const next = readPickupCart().map((item) => (item.categoryId === categoryId ? { ...item, quantity: safeQuantity } : item));
  window.sessionStorage.setItem(CART_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(CART_EVENT));
  return next;
}

export function removeFromPickupCart(categoryId: string) {
  const next = readPickupCart().filter((item) => item.categoryId !== categoryId);
  window.sessionStorage.setItem(CART_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(CART_EVENT));
  return next;
}

/**
 * Replaces the whole Pickup Cart with the given selection so that the cart
 * drawer always mirrors the materials and weights chosen on the booking page.
 * Writes (and notifies listeners) only when the contents actually change.
 */
export function replacePickupCart(items: PickupCartItem[]) {
  if (typeof window === 'undefined') return [];
  const next = items
    .filter((item) => item?.categoryId)
    .map((item) => ({
      categoryId: item.categoryId,
      quantity: Math.max(1, Math.min(500, Math.round(Number(item.quantity) || 1))),
    }));
  const current = readPickupCart();
  const same =
    current.length === next.length &&
    current.every((item, idx) => item.categoryId === next[idx].categoryId && item.quantity === next[idx].quantity);
  if (same) return current;
  window.sessionStorage.setItem(CART_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(CART_EVENT));
  return next;
}

export function clearPickupCart() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(CART_KEY);
  window.dispatchEvent(new Event(CART_EVENT));
}

export const pickupCartEvent = CART_EVENT;
