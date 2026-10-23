'use client';

type CacheEntry<T> = {
  value?: T;
  promise?: Promise<T>;
  expiresAt: number;
};

const entries = new Map<string, CacheEntry<unknown>>();

export function getCachedClientJson<T>(
  key: string,
  url: string,
  ttlMs: number,
  options?: RequestInit & { force?: boolean }
): Promise<T> {
  const now = Date.now();
  const existing = entries.get(key) as CacheEntry<T> | undefined;
  const force = options?.force === true;

  if (!force && existing && existing.value !== undefined && existing.expiresAt > now) {
    return Promise.resolve(existing.value);
  }

  if (!force && existing?.promise) {
    return existing.promise;
  }

  const { force: _force, ...requestOptions } = options || {};
  const promise = fetch(url, requestOptions)
    .then(async (response) => {
      const data = (await response.json()) as T;
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      entries.set(key, { value: data, expiresAt: Date.now() + ttlMs });
      return data;
    })
    .catch((error) => {
      entries.delete(key);
      throw error;
    });

  entries.set(key, {
    ...existing,
    promise,
    expiresAt: 0,
  });
  return promise;
}

export function invalidateCachedClientJson(key: string) {
  entries.delete(key);
}
