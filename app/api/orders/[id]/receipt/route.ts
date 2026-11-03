import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { errorResponse } from '@/lib/utils/apiResponse';
import { getOrderIdentifierWhere, isCustomerOrderOwner } from '@/lib/orderAccess';
import { generateReceiptPdfBytes, getReceiptFilename, isReceiptEligible } from '@/lib/receiptPdf';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authUser = await getAuthUser(req);

    if (!authUser) {
      return errorResponse('UNAUTHORIZED', 'Authentication is required to download receipt.', 401);
    }

    const order = await db.order.findFirst({
      where: getOrderIdentifierWhere(id),
      include: {
        customer: {
          include: {
            user: { select: { id: true, name: true, phone: true, email: true } },
          },
        },
        agent: {
          include: {
            user: { select: { id: true, name: true, phone: true, email: true } },
          },
        },
        address: true,
        items: { include: { category: true } },
        payments: { orderBy: { createdAt: 'desc' } },
        invoices: { orderBy: { createdAt: 'desc' } },
        settlement: {
          select: {
            totalWeightKg: true,
            amount: true,
            status: true,
          },
        },
      },
    });

    if (!order) {
      return errorResponse('ORDER_NOT_FOUND', `Order #${id} not found.`, 404);
    }

    // Role-based authorization
    if (authUser.role === 'CUSTOMER') {
      if (!isCustomerOrderOwner(order, authUser)) {
        return errorResponse('FORBIDDEN', 'You are not authorized to download this receipt.', 403);
      }
    } else if (authUser.role === 'AGENT') {
      const isAssignedAgent = authUser.agentId && order.agentId === authUser.agentId;
      if (!isAssignedAgent) {
        return errorResponse('FORBIDDEN', 'You are not assigned to this order.', 403);
      }
    }

    if (!isReceiptEligible(order)) {
      return errorResponse('RECEIPT_NOT_AVAILABLE', 'Receipt is not yet available for this order.', 400);
    }

    const pdfBytes = generateReceiptPdfBytes(order);
    const filename = getReceiptFilename(order);

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (err: any) {
    console.error('Download receipt API error:', {
      message: err?.message || 'Unknown error',
      code: err?.code || 'UNKNOWN',
    });
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to generate receipt PDF.', 500);
  }
}

