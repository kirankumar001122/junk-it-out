import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/middleware';

const PRIVATE_CACHE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
} as const;

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ filename: string }> }
) {
  const { filename } = await context.params;

  if (!filename || !/^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(filename)) {
    return NextResponse.json(
      { success: false, message: 'Invalid photo filename.' },
      { status: 400, headers: PRIVATE_CACHE_HEADERS }
    );
  }

  const isPublicMaterialPhoto = filename.startsWith('material-photo-');
  if (!isPublicMaterialPhoto) {
    // 1. Enforce authentication on direct legacy upload URLs for private photos
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json(
        { success: false, message: 'Authentication is required to access private photos.' },
        { status: 401, headers: PRIVATE_CACHE_HEADERS }
      );
    }
  }

  // 2. Redirect to the view route
  const targetUrl = new URL(`/api/upload/view?url=${encodeURIComponent(`/uploads/${filename}`)}`, req.url);
  return NextResponse.redirect(targetUrl, {
    status: 307,
    headers: isPublicMaterialPhoto
      ? {
          'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
          'X-Content-Type-Options': 'nosniff',
        }
      : PRIVATE_CACHE_HEADERS,
  });
}
