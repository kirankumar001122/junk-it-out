import { NextRequest, NextResponse } from 'next/server';
import { get } from '@vercel/blob';
import { readFile } from 'fs/promises';
import path from 'path';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const targetUrl = searchParams.get('url');

    if (!targetUrl) {
      return NextResponse.json({ success: false, message: 'Missing url parameter.' }, { status: 400 });
    }

    // 1. Handle Vercel Blob private storage URLs or pathnames
    if (targetUrl.startsWith('http') || targetUrl.includes('blob.vercel-storage.com') || !targetUrl.startsWith('/')) {
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
      if (result.blob.size) {
        responseHeaders.set('Content-Length', String(result.blob.size));
      }

      return new Response(result.stream, {
        status: 200,
        headers: responseHeaders,
      });
    }

    // 2. Handle local filesystem uploads fallback (e.g. /uploads/waste-photo-...)
    if (targetUrl.startsWith('/uploads/')) {
      const sanitizedPath = path.normalize(targetUrl).replace(/^(\.\.[\/\\])+/, '');
      const filePath = path.join(process.cwd(), 'public', sanitizedPath);

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
      { success: false, message: error?.message || 'Failed to serve photo.' },
      { status: 500 }
    );
  }
}
