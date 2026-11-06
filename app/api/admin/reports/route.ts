import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminAuthorizationStatus, getAuthUser } from '@/lib/auth/middleware';

const BATCH_SIZE = 500;
const MAX_EXPORT_LIMIT = 50000;

const headers = [
  'Order Number',
  'Date',
  'Customer Name',
  'Phone',
  'Area',
  'Status',
  'Estimated Total',
  'Final Amount',
  'Agent Name',
];

const csvCell = (value: unknown) => {
  const text = String(value ?? '');
  const safeText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
};

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  const authorizationStatus = getAdminAuthorizationStatus(authUser);
  if (authorizationStatus === 401) {
    return NextResponse.json(
      { success: false, message: 'Authentication is required.' },
      { status: 401 },
    );
  }
  if (authorizationStatus === 403) {
    return NextResponse.json(
      { success: false, message: 'Admin access required.' },
      { status: 403 },
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const limitParam = searchParams.get('limit');
    const statusParam = searchParams.get('status');
    const startDateParam = searchParams.get('startDate') || searchParams.get('from');
    const endDateParam = searchParams.get('endDate') || searchParams.get('to');
    const formatParam = searchParams.get('format');
    const isJsonRequest = formatParam === 'json' || req.headers.get('accept')?.includes('application/json');

    let maxRows: number | null = null;
    if (limitParam !== null) {
      const parsed = parseInt(limitParam, 10);
      if (isNaN(parsed) || parsed < 1 || parsed > MAX_EXPORT_LIMIT) {
        return NextResponse.json(
          { success: false, message: `Limit parameter must be an integer between 1 and ${MAX_EXPORT_LIMIT}.` },
          { status: 400 },
        );
      }
      maxRows = parsed;
    }

    const where: {
      status?: string;
      createdAt?: { gte?: Date; lte?: Date };
    } = {};

    if (statusParam && statusParam !== 'ALL') {
      where.status = statusParam;
    }

    if (startDateParam || endDateParam) {
      where.createdAt = {};
      if (startDateParam) {
        const d = new Date(startDateParam);
        if (isNaN(d.getTime())) {
          return NextResponse.json(
            { success: false, message: 'Invalid startDate format.' },
            { status: 400 },
          );
        }
        where.createdAt.gte = d;
      }
      if (endDateParam) {
        const d = new Date(endDateParam);
        if (isNaN(d.getTime())) {
          return NextResponse.json(
            { success: false, message: 'Invalid endDate format.' },
            { status: 400 },
          );
        }
        where.createdAt.lte = d;
      }
    }

    // JSON report response branch for Reports page consumption
    if (isJsonRequest) {
      const orders = await db.order.findMany({
        where,
        select: {
          id: true,
          orderNumber: true,
          createdAt: true,
          status: true,
          estimatedTotal: true,
          finalAmount: true,
          customer: { select: { user: { select: { name: true, phone: true } } } },
          agent: { select: { user: { select: { name: true } } } },
          address: { select: { area: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: maxRows !== null ? Math.min(maxRows, 500) : 100,
      });

      let totalEst = 0;
      let totalFinal = 0;
      let completedCount = 0;
      let activePipeline = 0;
      const statusCounts: Record<string, number> = {
        BOOKING_RECEIVED: 0,
        AGENT_ASSIGNED: 0,
        PICKUP_COMPLETED: 0,
        CANCELLED: 0,
      };

      for (const o of orders) {
        totalEst += Number(o.estimatedTotal) || 0;
        totalFinal += Number(o.finalAmount) || 0;
        const st = o.status || 'BOOKING_RECEIVED';
        statusCounts[st] = (statusCounts[st] || 0) + 1;

        if (st === 'PICKUP_COMPLETED') {
          completedCount++;
        } else if (['BOOKING_RECEIVED', 'AGENT_ASSIGNED', 'COLLECTING', 'ARRIVED'].includes(st)) {
          activePipeline++;
        }
      }

      return NextResponse.json({
        success: true,
        data: {
          orders,
          metrics: {
            totalOrders: orders.length,
            totalVolume: Math.round(totalFinal > 0 ? totalFinal : totalEst),
            completedCount,
            activePipeline,
            statusCounts,
          },
        },
      });
    }

    // Default CSV streaming export branch
    const csvLines: string[] = [headers.map(csvCell).join(',')];
    let cursorId: string | undefined;
    let totalExported = 0;

    while (true) {
      const takeSize = maxRows !== null
        ? Math.min(BATCH_SIZE, maxRows - totalExported)
        : BATCH_SIZE;

      if (takeSize <= 0) break;

      const batch = await db.order.findMany({
        where,
        select: {
          id: true,
          orderNumber: true,
          createdAt: true,
          status: true,
          estimatedTotal: true,
          finalAmount: true,
          customer: { select: { user: { select: { name: true, phone: true } } } },
          agent: { select: { user: { select: { name: true } } } },
          address: { select: { area: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: takeSize,
        ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
      });

      if (batch.length === 0) break;

      for (const order of batch) {
        csvLines.push([
          order.orderNumber,
          new Date(order.createdAt).toLocaleString(),
          order.customer?.user?.name ?? 'N/A',
          order.customer?.user?.phone ?? 'N/A',
          order.address?.area || 'N/A',
          order.status,
          order.estimatedTotal,
          order.finalAmount,
          order.agent?.user?.name ?? 'Unassigned',
        ].map(csvCell).join(','));
      }

      totalExported += batch.length;
      cursorId = batch[batch.length - 1].id;
      if (batch.length < takeSize) break;
    }

    return new Response(csvLines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename=junkitout_orders_report_${Date.now()}.csv`,
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'Failed to generate the orders report.' },
      { status: 500 },
    );
  }
}
