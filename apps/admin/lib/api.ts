/**
 * API fetch helper for standalone Admin Dashboard application.
 * Prepends process.env.NEXT_PUBLIC_API_BASE_URL (if configured)
 * and attaches credentials: 'include' for cross-subdomain cookie transmission.
 */

export function getApiUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || '';
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
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
