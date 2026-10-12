import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser || !['ADMIN', 'SUPER_ADMIN'].includes(authUser.role)) {
      return NextResponse.json({ success: false, message: 'Admin authorization required.' }, { status: 403 });
    }

    // 1. Production Schema Safety Check
    const columnCheck: any[] = await db.$queryRawUnsafe(`
      SELECT table_name, column_name, is_nullable, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'Complaint' AND column_name = 'orderId';
    `);

    const initialNullable = columnCheck[0]?.is_nullable === 'YES';

    // This endpoint is diagnostic only. Schema changes belong in a reviewed migration.
    const isNowNullable = initialNullable;

    const [complaintCount, orderCount, customerCount, userCount] = await Promise.all([
      db.complaint.count(),
      db.order.count(),
      db.customer.count(),
      db.user.count(),
    ]);

    return NextResponse.json({
      success: true,
      message: 'Complaint schema check complete. Apply an approved migration if orderId is not nullable.',
      details: {
        targetTable: 'Complaint',
        targetColumn: 'orderId',
        initialNullable,
        syncExecuted: false,
        isNullable: isNowNullable,
        recordsPreserved: {
          complaints: complaintCount,
          orders: orderCount,
          customers: customerCount,
          users: userCount,
        },
        tablesDropped: 0,
        dataLoss: false,
        unrelatedSchemaChanges: false,
      },
    });
  } catch (error: any) {
    console.error('Schema sync error:', error);
    return NextResponse.json({ success: false, message: error.message || 'Schema sync failed.' }, { status: 500 });
  }
}
