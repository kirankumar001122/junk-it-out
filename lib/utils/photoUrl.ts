/**
 * Ensures photo URLs pointing to Vercel private blob storage or local server-only uploads
 * are formatted securely for rendering in <img src="..." /> through the authenticated view route.
 */
export function getSecurePhotoUrl(url: string | null | undefined, orderId?: string): string {
  if (!url || typeof url !== 'string' || !url.trim()) return '';
  const trimmed = url.trim();

  // If already pointing to the view route, append orderId if missing and provided
  if (trimmed.startsWith('/api/upload/view')) {
    if (orderId && !trimmed.includes('orderId=')) {
      const separator = trimmed.includes('?') ? '&' : '?';
      return `${trimmed}${separator}orderId=${encodeURIComponent(orderId)}`;
    }
    return trimmed;
  }

  if (trimmed.startsWith('data:')) {
    return trimmed;
  }

  // Check if it's a local upload path, standalone filename, or Vercel Blob URL
  const isLocalUpload = trimmed.startsWith('/uploads/') || trimmed.startsWith('uploads/');
  const isImageFilename = /^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(trimmed);
  const isBlobUrl = trimmed.startsWith('http') && trimmed.includes('blob.vercel-storage.com');

  if (isLocalUpload || isImageFilename || isBlobUrl) {
    const baseTarget = trimmed.startsWith('/') || trimmed.startsWith('http') ? trimmed : `/uploads/${trimmed}`;
    const orderQuery = orderId ? `&orderId=${encodeURIComponent(orderId)}` : '';
    return `/api/upload/view?url=${encodeURIComponent(baseTarget)}${orderQuery}`;
  }

  // If it's a full http(s) URL on localhost or our app domain pointing to /uploads/
  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const parsed = new URL(trimmed);
      if (parsed.pathname.startsWith('/uploads/')) {
        const orderQuery = orderId ? `&orderId=${encodeURIComponent(orderId)}` : '';
        return `/api/upload/view?url=${encodeURIComponent(parsed.pathname)}${orderQuery}`;
      }
    }
  } catch {
    // Ignore URL parse error
  }

  return trimmed;
}
