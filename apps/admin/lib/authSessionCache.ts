/**
 * In-memory server-side session cache for Admin Dashboard layout.
 *
 * Prevents redundant HTTP round trips to /api/auth/me during rapid
 * sidebar navigation while strictly preserving:
 * 1. Cryptographic token verification (first call always validates with /api/auth/me).
 * 2. Strict role check (ADMIN or SUPER_ADMIN).
 * 3. Session expiry (never caches past JWT exp claim).
 * 4. Immediate logout enforcement (cookie absence bypasses cache and redirects).
 */

interface CachedSession {
  user: any;
  expiresAt: number;
}

const MAX_CACHE_ENTRIES = 100;
const DEFAULT_TTL_MS = 30_000; // 30 seconds TTL

// Server-side in-memory map keyed by token string
const sessionCache = new Map<string, CachedSession>();

function extractJwtExpMs(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson);
    if (typeof payload.exp === 'number') {
      return payload.exp * 1000;
    }
  } catch {
    // Ignore parse errors; fallback to DEFAULT_TTL_MS
  }
  return null;
}

export function getCachedAdminSession(token: string): any | null {
  if (!token) return null;
  const entry = sessionCache.get(token);
  if (!entry) return null;

  if (Date.now() >= entry.expiresAt) {
    sessionCache.delete(token);
    return null;
  }

  return entry.user;
}

export function setCachedAdminSession(token: string, user: any, ttlMs: number = DEFAULT_TTL_MS): void {
  if (!token || !user) return;

  // Bound TTL by the real JWT expiration timestamp
  const jwtExpMs = extractJwtExpMs(token);
  let effectiveExpiresAt = Date.now() + ttlMs;
  if (jwtExpMs !== null) {
    effectiveExpiresAt = Math.min(effectiveExpiresAt, jwtExpMs);
  }

  // If already expired, do not cache
  if (effectiveExpiresAt <= Date.now()) return;

  // Prune oldest if at max capacity
  if (sessionCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = sessionCache.keys().next().value;
    if (oldestKey) sessionCache.delete(oldestKey);
  }

  sessionCache.set(token, {
    user,
    expiresAt: effectiveExpiresAt,
  });
}

export function invalidateAdminSessionCache(token?: string): void {
  if (token) {
    sessionCache.delete(token);
  } else {
    sessionCache.clear();
  }
}
