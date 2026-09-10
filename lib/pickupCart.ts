export type PickupCartItem = { categoryId: string; quantity: number };

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
    ? items.map((item) => item.categoryId === categoryId ? { ...item, quantity: Math.min(500, item.quantity + 1) } : item)
    : [...items, { categoryId, quantity: 5 }];
  window.sessionStorage.setItem(CART_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(CART_EVENT));
  return next;
}

export function updatePickupCartQuantity(categoryId: string, quantity: number) {
  const safeQuantity = Math.max(1, Math.min(500, Math.round(Number(quantity) || 1)));
  const next = readPickupCart().map((item) => item.categoryId === categoryId ? { ...item, quantity: safeQuantity } : item);
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

export function clearPickupCart() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(CART_KEY);
  window.dispatchEvent(new Event(CART_EVENT));
}

export const pickupCartEvent = CART_EVENT;
