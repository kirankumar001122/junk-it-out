export const CUSTOMER_WASTE_CATEGORY_NAMES = [
  'E-Waste',
  'Household Dry Waste',
  'Paper & Cardboard',
  'Plastic Waste',
] as const;

export const DEFAULT_CATEGORY_IMAGES: Record<string, string> = {
  'E-Waste': '/categories/e-waste.webp',
  'Household Dry Waste': '/categories/household-waste.webp',
  'Household Junk': '/categories/household-waste.webp',
  'Paper & Cardboard': '/categories/paper-carboard.jpg',
  'Plastic Waste': '/categories/plastic-waste.jpg',
};

const LEGACY_MISSING_IMAGE_MAP: Record<string, string> = {
  '/categories/e-waste-card.png': '/categories/e-waste.webp',
  '/categories/household-junk-card.png': '/categories/household-waste.webp',
  '/categories/paper-cardboard-card.png': '/categories/paper-carboard.jpg',
  '/categories/plastic-waste-card.png': '/categories/plastic-waste.jpg',
};

const INTERNAL_TEST_CATEGORY_NAMES = new Set<string>([
  'Unauthorized Category Test',
]);

export function isCustomerWasteCategory(category: { name?: string | null; active?: boolean }) {
  const trimmedName = category?.name?.trim() || '';
  if (!trimmedName || INTERNAL_TEST_CATEGORY_NAMES.has(trimmedName)) {
    return false;
  }
  if (category?.active === false) {
    return false;
  }
  return true;
}

export function getMaterialImageUrl(category?: {
  name?: string | null;
  imageUrl?: string | null;
  category?: string | null;
}): string {
  const customImage = category?.imageUrl?.trim();
  if (customImage) {
    if (LEGACY_MISSING_IMAGE_MAP[customImage]) {
      return LEGACY_MISSING_IMAGE_MAP[customImage];
    }
    return customImage;
  }
  const name = category?.name?.trim() || '';
  if (DEFAULT_CATEGORY_IMAGES[name]) {
    return DEFAULT_CATEGORY_IMAGES[name];
  }
  const catType = category?.category?.trim() || '';
  if (DEFAULT_CATEGORY_IMAGES[catType]) {
    return DEFAULT_CATEGORY_IMAGES[catType];
  }
  const lower = `${name} ${catType}`.toLowerCase();
  if (lower.includes('e-waste') || lower.includes('electronic') || lower.includes('appliance')) {
    return '/categories/e-waste.webp';
  }
  if (lower.includes('paper') || lower.includes('cardboard') || lower.includes('book')) {
    return '/categories/paper-carboard.jpg';
  }
  if (lower.includes('plastic') || lower.includes('bottle') || lower.includes('pet')) {
    return '/categories/plastic-waste.jpg';
  }
  return '/categories/household-waste.webp';
}

export const WASTE_CATEGORIES_SYNC_CHANNEL = 'jio_waste_categories_sync';
export const WASTE_CATEGORIES_SYNC_STORAGE_KEY = 'jio_waste_categories_updated_at';

export function broadcastWasteCategoriesChanged(): void {
  if (typeof window === 'undefined') return;
  const now = String(Date.now());
  try {
    localStorage.setItem(WASTE_CATEGORIES_SYNC_STORAGE_KEY, now);
  } catch {
    // ignore storage errors
  }
  try {
    window.dispatchEvent(new CustomEvent(WASTE_CATEGORIES_SYNC_CHANNEL, { detail: { updatedAt: now } }));
  } catch {
    // ignore
  }
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel(WASTE_CATEGORIES_SYNC_CHANNEL);
      bc.postMessage({ type: 'WASTE_CATEGORIES_UPDATED', updatedAt: now });
      bc.close();
    }
  } catch {
    // ignore
  }
}

export function subscribeWasteCategoriesChanged(onUpdate: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleStorage = (e: StorageEvent) => {
    if (e.key === WASTE_CATEGORIES_SYNC_STORAGE_KEY) {
      onUpdate();
    }
  };
  const handleCustom = () => {
    onUpdate();
  };
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      onUpdate();
    }
  };

  window.addEventListener('storage', handleStorage);
  window.addEventListener(WASTE_CATEGORIES_SYNC_CHANNEL, handleCustom);
  window.addEventListener('focus', handleCustom);
  document.addEventListener('visibilitychange', handleVisibility);

  let bc: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel(WASTE_CATEGORIES_SYNC_CHANNEL);
      bc.onmessage = () => {
        onUpdate();
      };
    }
  } catch {
    // ignore
  }

  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(WASTE_CATEGORIES_SYNC_CHANNEL, handleCustom);
    window.removeEventListener('focus', handleCustom);
    document.removeEventListener('visibilitychange', handleVisibility);
    try {
      bc?.close();
    } catch {
      // ignore
    }
  };
}
