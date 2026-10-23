import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, isAdminRole } from '@/lib/auth/middleware';
import { errorResponse } from '@/lib/utils/apiResponse';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return errorResponse('UNAUTHORIZED', 'Authentication required.', 401);
    }
    if (!isAdminRole(authUser)) {
      return errorResponse('FORBIDDEN', 'Admin access required.', 403);
    }

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

    const csvContent = [headers.join(','), ...rows.map((r) => r.map((cell) => `"${cell}"`).join(','))].join('\n');

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
