let cachedCategories: any[] | null = null;
let cacheExpiry = 0;
export const WASTE_CATEGORIES_CACHE_TTL_MS = 60_000;

export function getCachedWasteCategories(): any[] | null {
  if (cachedCategories && Date.now() < cacheExpiry) {
    return cachedCategories;
  }
  if (cachedCategories && Date.now() >= cacheExpiry) {
    cachedCategories = null;
  }
  return null;
}

export function setCachedWasteCategories(categories: any[], ttlMs: number = WASTE_CATEGORIES_CACHE_TTL_MS): void {
  if (!Array.isArray(categories)) {
    return;
  }
  const now = Date.now();
  const existing = (cachedCategories && now < cacheExpiry && Array.isArray(cachedCategories))
    ? cachedCategories
    : [];
  const map = new Map<string, any>();
  for (const c of existing) {
    if (c?.id) map.set(c.id, c);
  }
  for (const c of categories) {
    if (c?.id) map.set(c.id, c);
  }
  cachedCategories = Array.from(map.values());
  cacheExpiry = now + ttlMs;
}

export function invalidateCategoriesCache(): void {
  cachedCategories = null;
  cacheExpiry = 0;
}
