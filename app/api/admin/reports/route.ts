import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requireAdminUser } from '@/lib/auth/middleware';
import { toSafeCsvCell } from '@/lib/reports/csv';

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!requireAdminUser(authUser)) {
    return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });
  }
  try {
    const orders = await db.order.findMany({
      include: {
        customer: { include: { user: true } },
        agent: { include: { user: true } },
        address: true,
        items: { include: { category: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const headers = ['Order Number', 'Date', 'Customer Name', 'Phone', 'Area', 'Status', 'Estimated Total', 'Final Amount', 'Agent Name'];
    const rows = orders.map((o) => [
      o.orderNumber,
      new Date(o.createdAt).toLocaleString(),
      o.customer.user.name,
      o.customer.user.phone,
      o.address?.area || 'N/A',
      o.status,
      o.estimatedTotal,
      o.finalAmount,
      o.agent ? o.agent.user.name : 'Unassigned',
    ]);

    const csvContent = [headers.map(toSafeCsvCell).join(','), ...rows.map((r) => r.map(toSafeCsvCell).join(','))].join('\n');

    return new Response(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename=junkitout_orders_report_${Date.now()}.csv`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
