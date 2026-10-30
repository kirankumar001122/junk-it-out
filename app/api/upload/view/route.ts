import { NextRequest, NextResponse } from 'next/server';
import { get } from '@vercel/blob';
import { readFile } from 'fs/promises';
import path from 'path';
import { getAuthUser } from '@/lib/auth/middleware';
import { db } from '@/lib/db';

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
    // 1. Mandatory authentication check (SEC-03)
    const authUser = await getAuthUser(req);
    if (!authUser || !authUser.userId) {
      return NextResponse.json(
        { success: false, message: 'Authentication is required to view private media.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const targetUrl = searchParams.get('url')?.trim();

    if (!targetUrl) {
      return NextResponse.json({ success: false, message: 'Missing url parameter.' }, { status: 400 });
    }

    // Extract base filename (ignoring query strings and leading paths)
    let filename = '';
    try {
      if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
        filename = path.basename(new URL(targetUrl).pathname);
      } else {
        filename = path.basename(targetUrl.split('?')[0]);
      }
    } catch {
      filename = path.basename(targetUrl);
    }

    // 2. Resource ownership authorization (SEC-03)
    const isAdmin = authUser.role === 'ADMIN' || authUser.role === 'SUPER_ADMIN';
    const isDirectUploader = filename.includes(`u_${authUser.userId}`);

    let isAuthorized = isAdmin || isDirectUploader;

    if (!isAuthorized) {
      // Check Order ownership or assignment
      const orderIdParam = searchParams.get('orderId')?.trim();
      let order: { customerId: string; customer: { userId: string } | null; agentId: string | null } | null = null;

      if (orderIdParam) {
        const foundOrder = await db.order.findUnique({
          where: { id: orderIdParam },
          select: {
            id: true,
            customerId: true,
            customer: { select: { userId: true } },
            agentId: true,
            wastePhotos: true,
            weightRecords: { select: { scalePhotoUrl: true } },
          },
        });
        if (
          foundOrder &&
          (foundOrder.wastePhotos.includes(filename) ||
            foundOrder.weightRecords.some((wr) => wr.scalePhotoUrl && wr.scalePhotoUrl.includes(filename)))
        ) {
          order = foundOrder;
        }
      }

      if (!order) {
        order = await db.order.findFirst({
          where: {
            OR: [
              { wastePhotos: { contains: filename } },
              { weightRecords: { some: { scalePhotoUrl: { contains: filename } } } },
            ],
          },
          select: {
            customerId: true,
            customer: { select: { userId: true } },
            agentId: true,
          },
        });
      }

      if (order) {
        if (authUser.role === 'CUSTOMER') {
          if (
            (authUser.customerId && order.customerId === authUser.customerId) ||
            (order.customer && order.customer.userId === authUser.userId)
          ) {
            isAuthorized = true;
          }
        } else if (authUser.role === 'AGENT') {
          if (authUser.agentId && order.agentId === authUser.agentId) {
            isAuthorized = true;
          }
        }
      }

      // Check Complaint ownership or assignment (if not yet authorized)
      if (!isAuthorized) {
        const complaint = await db.complaint.findFirst({
          where: { photoUrl: { contains: filename } },
          select: {
            customerId: true,
            customer: { select: { userId: true } },
            order: { select: { agentId: true } },
          },
        });

        if (complaint) {
          if (authUser.role === 'CUSTOMER') {
            if (
              (authUser.customerId && complaint.customerId === authUser.customerId) ||
              (complaint.customer && complaint.customer.userId === authUser.userId)
            ) {
              isAuthorized = true;
            }
          } else if (authUser.role === 'AGENT') {
            if (authUser.agentId && complaint.order?.agentId === authUser.agentId) {
              isAuthorized = true;
            }
          }
        }
      }
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { success: false, message: 'You are not authorized to view this photograph.' },
        { status: 403 }
      );
    }

    // 3. Handle Vercel Blob private storage URLs or pathnames
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
      // Prevent public caching of private media (SEC-03)
      responseHeaders.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');
      responseHeaders.set('Pragma', 'no-cache');
      responseHeaders.set('Expires', '0');
      responseHeaders.set('X-Content-Type-Options', 'nosniff');
      if (result.blob.size) {
        responseHeaders.set('Content-Length', String(result.blob.size));
      }

      return new Response(result.stream, {
        status: 200,
        headers: responseHeaders,
      });
    }

    // 4. Handle local filesystem uploads fallback (e.g. /uploads/waste-photo-...)
    if (targetUrl.startsWith('/uploads/') || targetUrl.startsWith('uploads/')) {
      const localFilename = path.basename(targetUrl);
      if (!/^waste-photo-[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(localFilename)) {
        return NextResponse.json({ success: false, message: 'Invalid photo filename.' }, { status: 400 });
      }

      const uploadDir = path.resolve(process.cwd(), 'public', 'uploads');
      const filePath = path.resolve(uploadDir, localFilename);

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
            // Prevent public caching of private media (SEC-03)
            'Cache-Control': 'private, no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
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
