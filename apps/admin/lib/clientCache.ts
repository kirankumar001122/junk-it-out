'use client';

import { adminFetch } from './api';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const clientCache = new Map<string, CacheEntry<any>>();
const inFlightRequests = new Map<string, Promise<any>>();

// Default TTLs for frequently reused datasets
export const DEFAULT_CLIENT_CACHE_TTLS: Record<string, number> = {
  '/api/admin/agents': 15_000,          // 15 seconds
  '/api/waste-categories': 30_000,      // 30 seconds
  '/api/service-areas': 30_000,         // 30 seconds
  '/api/admin/settings': 30_000,        // 30 seconds
};

function getTtlForPath(path: string, customTtlMs?: number): number {
  if (customTtlMs !== undefined) return customTtlMs;
  for (const [prefix, ttl] of Object.entries(DEFAULT_CLIENT_CACHE_TTLS)) {
    if (path.startsWith(prefix)) return ttl;
  }
  return 15_000;
}

/**
 * Fetch and cache JSON data from an admin API endpoint.
 * Deduplicates in-flight requests and serves cached data within TTL.
 */
export async function cachedAdminFetch<T = any>(
  path: string,
  options?: {
    forceRefresh?: boolean;
    ttlMs?: number;
    requestInit?: RequestInit;
  }
): Promise<T> {
  const forceRefresh = options?.forceRefresh ?? false;
  const ttlMs = getTtlForPath(path, options?.ttlMs);
  const cacheKey = path;

  // 1. Return fresh cached data if available and not forced to refresh
  if (!forceRefresh) {
    const entry = clientCache.get(cacheKey);
    if (entry && Date.now() < entry.expiresAt) {
      return entry.data as T;
    }
  }

  // 2. Deduplicate in-flight requests to prevent double-fetching on component mount
  if (inFlightRequests.has(cacheKey) && !forceRefresh) {
    return inFlightRequests.get(cacheKey) as Promise<T>;
  }

  const fetchPromise = (async () => {
    try {
      const res = await adminFetch(path, options?.requestInit);
      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }
      const data = await res.json();

      // Only cache successful JSON payloads
      if (data && (data.success !== false)) {
        clientCache.set(cacheKey, {
          data,
          expiresAt: Date.now() + ttlMs,
        });
      }

      return data as T;
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, fetchPromise);
  return fetchPromise;
}

/**
 * Invalidate client cache entries matching a prefix or pattern.
 * If no prefix is provided, clears the entire client cache.
 */
export function invalidateClientCache(prefixOrKey?: string): void {
  if (!prefixOrKey) {
    clientCache.clear();
    return;
  }

  for (const key of clientCache.keys()) {
    if (key.includes(prefixOrKey) || key.startsWith(prefixOrKey)) {
      clientCache.delete(key);
    }
  }
}
