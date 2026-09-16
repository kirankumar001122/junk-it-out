/**
 * Format photo URLs for standalone Admin Dashboard application.
 * Prepend NEXT_PUBLIC_API_BASE_URL if pointing to backend view endpoints.
 */
export function getSecurePhotoUrl(url: string | null | undefined): string {
  if (!url) return '';
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || '';
  if (url.startsWith('/api/upload/view')) {
    return `${baseUrl}${url}`;
  }
  if (url.startsWith('data:')) {
    return url;
  }
  if (url.startsWith('http') && url.includes('blob.vercel-storage.com')) {
    return `${baseUrl}/api/upload/view?url=${encodeURIComponent(url)}`;
  }
  return url;
}
