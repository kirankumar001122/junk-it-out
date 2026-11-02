/**
 * API fetch helper for standalone Admin Dashboard application.
 * Prepends process.env.NEXT_PUBLIC_API_BASE_URL (if configured)
 * and attaches credentials: 'include' for cross-subdomain cookie transmission.
 */

export function getConfiguredBackendUrl(candidateUrl?: string): string {
  const raw = candidateUrl !== undefined ? candidateUrl : process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!raw || typeof raw !== 'string' || !raw.trim()) {
    throw new Error('NEXT_PUBLIC_API_BASE_URL is required.');
  }

  const trimmed = raw.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('NEXT_PUBLIC_API_BASE_URL must be a valid URL.');
  }

  if (parsed.username || parsed.password) {
    throw new Error('Backend URL must not contain credentials and must use HTTPS.');
  }

  const isDev = process.env.NODE_ENV === 'development';
  const isLocalhost =
    parsed.hostname === 'localhost' ||
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname === '::1';

  if (isDev) {
    if (!isLocalhost) {
      throw new Error('Backend URL must point to localhost during development.');
    }
  } else {
    if (parsed.protocol !== 'https:' && !isLocalhost) {
      throw new Error('Backend URL must use HTTPS.');
    }
  }

  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

export function getApiUrl(path: string): string {
  if (path.startsWith('//') || path.startsWith('\\\\')) {
    throw new Error('Protocol-relative URLs are not allowed.');
  }

  if (/^https?:\/\//i.test(path)) {
    const url = new URL(path);
    const validOrigin = getConfiguredBackendUrl(url.origin);
    const cleanPath = url.pathname.endsWith('/') && url.pathname.length > 1
      ? url.pathname.slice(0, -1)
      : url.pathname;
    return `${validOrigin}${cleanPath}${url.search}`;
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path)) {
    throw new Error('Invalid URL protocol. Only HTTP and HTTPS are allowed.');
  }

  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const normalizedPath = cleanPath.replace(/^\/+/, '/');

  const isDev = process.env.NODE_ENV === 'development';
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  const fallback = isDev ? 'http://localhost:3000' : 'https://www.junkitout.in';
  const baseUrl = getConfiguredBackendUrl(configured || fallback);

  if (typeof window !== 'undefined') {
    return normalizedPath;
  }

  return `${baseUrl}${normalizedPath}`;
}

export async function adminFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const url = getApiUrl(path);
  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const headers = {
    ...defaultHeaders,
    ...(options.headers as Record<string, string> || {}),
  };

  return fetch(url, {
    ...options,
    credentials: 'include',
    headers,
  });
}
