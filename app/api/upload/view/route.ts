import { NextRequest, NextResponse } from 'next/server';
import { get } from '@vercel/blob';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { db } from '@/lib/db';
import { getAuthUser, isAdminRole } from '@/lib/auth/middleware';
import { isCustomerOrderOwner, isAgentOrderAssigned } from '@/lib/orderAccess';

const PRIVATE_CACHE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
} as const;

function extractFilename(targetUrl: string): string | null {
  try {
    let pathname = targetUrl.split('?')[0];
    if (pathname.startsWith('http://') || pathname.startsWith('https://')) {
      pathname = new URL(targetUrl).pathname;
    }
    const filename = path.basename(pathname);
    return /^waste-photo-[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(filename) ? filename : null;
  } catch {
    return null;
  }
}

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
    const orderIdParam = searchParams.get('orderId')?.trim();

    if (!targetUrl) {
      return NextResponse.json(
        { success: false, message: 'Missing url parameter.' },
        { status: 400, headers: PRIVATE_CACHE_HEADERS }
      );
    }

    const filename = extractFilename(targetUrl);
    if (!filename) {
      return NextResponse.json(
        { success: false, message: 'Invalid photo URL.' },
        { status: 400, headers: PRIVATE_CACHE_HEADERS }
      );
    }

    // 1. Enforce Authentication
    const authUser = await getAuthUser(req);
    if (!authUser || !authUser.userId) {
      return NextResponse.json(
        { success: false, message: 'Authentication is required to view photos.' },
        { status: 401, headers: PRIVATE_CACHE_HEADERS }
      );
    }

    // 2. Authorize Access
    const isAdmin = isAdminRole(authUser) || authUser.role === 'ADMIN' || authUser.role === 'SUPER_ADMIN';
    const isDirectUploader = Boolean(authUser.userId && filename.includes(`u_${authUser.userId}`));

    let isAuthorized = isAdmin || isDirectUploader;

    if (!isAuthorized) {
      if (orderIdParam) {
        // Explicit order ID supplied: verify order exists and contains the requested photo
        const order = await db.order.findUnique({
          where: { id: orderIdParam },
          select: {
            id: true,
            customerId: true,
            agentId: true,
            wastePhotos: true,
            customer: { select: { userId: true } },
            agent: { select: { userId: true } },
            weightRecords: { select: { scalePhotoUrl: true } },
          },
        });

        if (!order) {
          return NextResponse.json(
            { success: false, message: 'Order not found.' },
            { status: 404, headers: PRIVATE_CACHE_HEADERS }
          );
        }

        // Verify photo actually belongs to this order to prevent IDOR
        const photoInWastePhotos =
          typeof order.wastePhotos === 'string' && order.wastePhotos.includes(filename);
        const photoInWeightRecords =
          Array.isArray(order.weightRecords) &&
          order.weightRecords.some((wr) => wr.scalePhotoUrl && wr.scalePhotoUrl.includes(filename));

        if (!photoInWastePhotos && !photoInWeightRecords) {
          return NextResponse.json(
            { success: false, message: 'Photo does not belong to the specified order.' },
            { status: 403, headers: PRIVATE_CACHE_HEADERS }
          );
        }

        const isCustomer = isCustomerOrderOwner(order, authUser);
        const isAgent =
          isAgentOrderAssigned(order, authUser) ||
          Boolean(authUser.userId && order.agent?.userId === authUser.userId);

        if (isCustomer || isAgent) {
          isAuthorized = true;
        }
      } else {
        // No orderId parameter supplied: query database for owning order or complaint
        const matchingOrder = await db.order.findFirst({
          where: {
            OR: [
              { wastePhotos: { contains: filename } },
              { weightRecords: { some: { scalePhotoUrl: { contains: filename } } } },
            ],
          },
          select: {
            id: true,
            customerId: true,
            agentId: true,
            customer: { select: { userId: true } },
            agent: { select: { userId: true } },
          },
        });

        if (matchingOrder) {
          const isCustomer = isCustomerOrderOwner(matchingOrder, authUser);
          const isAgent =
            isAgentOrderAssigned(matchingOrder, authUser) ||
            Boolean(authUser.userId && matchingOrder.agent?.userId === authUser.userId);

          if (isCustomer || isAgent) {
            isAuthorized = true;
          }
        } else {
          // Check if photo is associated with a customer complaint
          const matchingComplaint = await db.complaint.findFirst({
            where: { photoUrl: { contains: filename } },
            select: {
              customerId: true,
              order: { select: { agentId: true, agent: { select: { userId: true } } } },
            },
          });

          if (matchingComplaint) {
            const isCustomer =
              Boolean(authUser.customerId && authUser.customerId === matchingComplaint.customerId);
            const isAgent = Boolean(
              matchingComplaint.order &&
                (isAgentOrderAssigned(matchingComplaint.order, authUser) ||
                  (authUser.userId && matchingComplaint.order.agent?.userId === authUser.userId))
            );

            if (isCustomer || isAgent) {
              isAuthorized = true;
            }
          }
        }
      }

      if (!isAuthorized) {
        return NextResponse.json(
          { success: false, message: 'You are not authorized to view this photo.' },
          { status: 403, headers: PRIVATE_CACHE_HEADERS }
        );
      }
    }

    // 3. Handle Vercel Blob private storage URLs or pathnames
    if (isValidBlobTarget(targetUrl)) {
      const token = process.env.BLOB_READ_WRITE_TOKEN;
      if (!token) {
        console.error('[BLOB_VIEW_ERROR] Missing BLOB_READ_WRITE_TOKEN environment variable.');
        return NextResponse.json(
          { success: false, message: 'Storage configuration error.' },
          { status: 500, headers: PRIVATE_CACHE_HEADERS }
        );
      }

      const result = await get(targetUrl, { access: 'private' });

      if (!result || result.statusCode !== 200 || !result.stream) {
        return NextResponse.json(
          { success: false, message: 'Photo not found.' },
          { status: 404, headers: PRIVATE_CACHE_HEADERS }
        );
      }

      const contentType = result.blob.contentType || 'image/jpeg';
      const responseHeaders = new Headers();
      responseHeaders.set('Content-Type', contentType);
      responseHeaders.set('Cache-Control', 'private, no-store');
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
    if (targetUrl.startsWith('/uploads/') || targetUrl.startsWith('uploads/') || filename === targetUrl) {
      let uploadDir = path.resolve(process.cwd(), 'storage', 'uploads');
      let filePath = path.resolve(uploadDir, filename);

      if (!existsSync(filePath)) {
        const legacyDir = path.resolve(process.cwd(), 'public', 'uploads');
        const legacyPath = path.resolve(legacyDir, filename);
        if (legacyPath.startsWith(legacyDir) && existsSync(legacyPath)) {
          uploadDir = legacyDir;
          filePath = legacyPath;
        }
      }

      if (!filePath.startsWith(uploadDir)) {
        return NextResponse.json(
          { success: false, message: 'Access denied.' },
          { status: 403, headers: PRIVATE_CACHE_HEADERS }
        );
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
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      } catch {
        return NextResponse.json(
          { success: false, message: 'Local photo file not found.' },
          { status: 404, headers: PRIVATE_CACHE_HEADERS }
        );
      }
    }

    return NextResponse.json(
      { success: false, message: 'Invalid photo URL.' },
      { status: 400, headers: PRIVATE_CACHE_HEADERS }
    );
  } catch (error: any) {
    console.error('Error serving private photo:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to serve photo.' },
      { status: 500, headers: PRIVATE_CACHE_HEADERS }
    );
  }
}
