/**
 * API fetch helper for standalone Admin Dashboard application.
 * Prepends process.env.NEXT_PUBLIC_API_BASE_URL (if configured)
 * and attaches credentials: 'include' for cross-subdomain cookie transmission.
 */

export function getApiUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  if (typeof window !== 'undefined') {
    return cleanPath;
  }

  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || 'https://www.junkitout.in';
  const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${cleanBase}${cleanPath}`;
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
