let cachedCategories: any = null;
let cacheExpiry = 0;
export const WASTE_CATEGORIES_CACHE_TTL_MS = 60_000;

export function getCachedWasteCategories(): any | null {
  if (cachedCategories && Date.now() < cacheExpiry) {
    return cachedCategories;
  }
  return null;
}

export function setCachedWasteCategories(categories: any, ttlMs: number = WASTE_CATEGORIES_CACHE_TTL_MS): void {
  cachedCategories = categories;
  cacheExpiry = Date.now() + ttlMs;
}

export function invalidateCategoriesCache(): void {
  cachedCategories = null;
  cacheExpiry = 0;
}
