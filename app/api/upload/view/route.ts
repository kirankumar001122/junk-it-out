import { NextRequest, NextResponse } from 'next/server';
import { get } from '@vercel/blob';
import { readFile } from 'fs/promises';
import path from 'path';

function isValidBlobTarget(targetUrl: string): boolean {
  try {
    const parsed = new URL(targetUrl);
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('.blob.vercel-storage.com');
  } catch {
    return /^(\/)?waste-photo-[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(targetUrl);
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const targetUrl = searchParams.get('url')?.trim();

    if (!targetUrl) {
      return NextResponse.json({ success: false, message: 'Missing url parameter.' }, { status: 400 });
    }

    // 1. Handle Vercel Blob private storage URLs or pathnames
    if (isValidBlobTarget(targetUrl)) {
      const token = process.env.BLOB_READ_WRITE_TOKEN;
      if (!token) {
        console.error('[BLOB_VIEW_ERROR] Missing BLOB_READ_WRITE_TOKEN environment variable.');
        return NextResponse.json({ success: false, message: 'Storage configuration error.' }, { status: 500 });
      }

      const result = await get(targetUrl, { access: 'private' });

      if (!result || result.statusCode !== 200 || !result.stream) {
        return NextResponse.json({ success: false, message: 'Photo not found.' }, { status: 404 });
      }

      const contentType = result.blob.contentType || 'image/jpeg';
      const responseHeaders = new Headers();
      responseHeaders.set('Content-Type', contentType);
      responseHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');
      responseHeaders.set('X-Content-Type-Options', 'nosniff');
      if (result.blob.size) {
        responseHeaders.set('Content-Length', String(result.blob.size));
      }

      return new Response(result.stream, {
        status: 200,
        headers: responseHeaders,
      });
    }

    // 2. Handle local filesystem uploads fallback (e.g. /uploads/waste-photo-...)
    if (targetUrl.startsWith('/uploads/') || targetUrl.startsWith('uploads/')) {
      const filename = path.basename(targetUrl);
      if (!/^waste-photo-[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(filename)) {
        return NextResponse.json({ success: false, message: 'Invalid photo filename.' }, { status: 400 });
      }

      const uploadDir = path.resolve(process.cwd(), 'public', 'uploads');
      const filePath = path.resolve(uploadDir, filename);

      if (!filePath.startsWith(uploadDir)) {
        return NextResponse.json({ success: false, message: 'Access denied.' }, { status: 403 });
      }

      try {
        const fileBuffer = await readFile(filePath);
        const ext = path.extname(filePath).toLowerCase();
        let mimeType = 'image/jpeg';
        if (ext === '.png') mimeType = 'image/png';
        if (ext === '.webp') mimeType = 'image/webp';

        return new Response(fileBuffer, {
          status: 200,
          headers: {
            'Content-Type': mimeType,
            'Cache-Control': 'public, max-age=31536000, immutable',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      } catch {
        return NextResponse.json({ success: false, message: 'Local photo file not found.' }, { status: 404 });
      }
    }

    return NextResponse.json({ success: false, message: 'Invalid photo URL.' }, { status: 400 });
  } catch (error: any) {
    console.error('Error serving private photo:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to serve photo.' },
      { status: 500 }
    );
  }
}
