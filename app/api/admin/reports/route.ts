import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, isAdminRole } from '@/lib/auth/middleware';

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
  if (!authUser) {
    return NextResponse.json({ success: false, message: 'Authentication required.' }, { status: 401 });
  }
  if (!isAdminRole(authUser)) {
    return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const limitParam = searchParams.get('limit');
    const statusParam = searchParams.get('status');
    const startDateParam = searchParams.get('startDate') || searchParams.get('from');
    const endDateParam = searchParams.get('endDate') || searchParams.get('to');

    const maxRows = limitParam
      ? Math.min(Math.max(1, parseInt(limitParam, 10) || MAX_EXPORT_LIMIT), MAX_EXPORT_LIMIT)
      : null;

    const where: any = {};
    if (statusParam) {
      where.status = statusParam;
    }
    if (startDateParam || endDateParam) {
      where.createdAt = {};
      if (startDateParam) where.createdAt.gte = new Date(startDateParam);
      if (endDateParam) where.createdAt.lte = new Date(endDateParam);
    }

    const csvLines: string[] = [headers.map(csvCell).join(',')];
    let cursorId: string | undefined = undefined;
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
          customer: {
            select: {
              user: {
                select: { name: true, phone: true },
              },
            },
          },
          agent: {
            select: {
              user: {
                select: { name: true },
              },
            },
          },
          address: {
            select: { area: true },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: takeSize,
        ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
      });

      if (batch.length === 0) break;

      for (const o of batch) {
        const row = [
          o.orderNumber,
          new Date(o.createdAt).toLocaleString(),
          o.customer?.user?.name ?? 'N/A',
          o.customer?.user?.phone ?? 'N/A',
          o.address?.area || 'N/A',
          o.status,
          o.estimatedTotal,
          o.finalAmount,
          o.agent ? o.agent.user?.name ?? 'Unassigned' : 'Unassigned',
        ];
        csvLines.push(row.map(csvCell).join(','));
      }

      totalExported += batch.length;
      cursorId = batch[batch.length - 1].id;

      if (batch.length < takeSize) break;
    }

    const csvContent = csvLines.join('\n');

    return new Response(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename=junkitout_orders_report_${Date.now()}.csv`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: 'An unexpected error occurred. Please try again.' }, { status: 500 });
  }
}
