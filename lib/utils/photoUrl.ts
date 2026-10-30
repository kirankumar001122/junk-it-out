/**
 * Ensures photo URLs pointing to Vercel private blob storage or local server-only uploads
 * are formatted securely for rendering in <img src="..." /> through the authenticated view route.
 */
export function getSecurePhotoUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('/api/upload/view') || url.startsWith('data:')) {
    return url;
  }
  if (
    url.startsWith('/uploads/') ||
    url.startsWith('uploads/') ||
    /^waste-photo-[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(url) ||
    (url.startsWith('http') && url.includes('blob.vercel-storage.com'))
  ) {
    return `/api/upload/view?url=${encodeURIComponent(url)}`;
  }
  return url;
}
