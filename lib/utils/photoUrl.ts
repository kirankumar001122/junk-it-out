/**
 * Ensures photo URLs pointing to Vercel private blob storage or local uploads
 * are formatted securely for rendering in <img src="..." />.
 */
export function getSecurePhotoUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('/api/upload/view') || url.startsWith('data:')) {
    return url;
  }
  if (url.startsWith('http') && url.includes('blob.vercel-storage.com')) {
    return `/api/upload/view?url=${encodeURIComponent(url)}`;
  }
  return url;
}
