export type CartItem = { id: string; qty: number; [key: string]: any };

export function addToPickupCart(item: CartItem) {
  if (typeof window === 'undefined') return;
  const cart = readPickupCart();
  cart.push(item);
  localStorage.setItem('pickupCart', JSON.stringify(cart));
}

export function readPickupCart(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem('pickupCart') || '[]');
  } catch { return []; }
}

export function updatePickupCartQuantity(id: string, qty: number) {
  if (typeof window === 'undefined') return;
  let cart = readPickupCart();
  cart = cart.map(i => i.id === id ? { ...i, qty } : i);
  localStorage.setItem('pickupCart', JSON.stringify(cart));
  return cart;
}

export function clearPickupCart() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('pickupCart');
}
