import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ success: false, message: 'Authentication required.' }, { status: 401 });
    }
    if (!['ADMIN', 'SUPER_ADMIN'].includes(authUser.role)) {
      return NextResponse.json({ success: false, message: 'Admin authorization required.' }, { status: 403 });
    }

    const columnCheck = await db.$queryRaw<Array<{
      table_name: string;
      column_name: string;
      is_nullable: string;
      data_type: string;
    }>>`
      SELECT table_name, column_name, is_nullable, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'Complaint' AND column_name = 'orderId';
    `;

    const initialNullable = columnCheck[0]?.is_nullable === 'YES';

    const [complaintCount, orderCount, customerCount, userCount] = await Promise.all([
      db.complaint.count(),
      db.order.count(),
      db.customer.count(),
      db.user.count(),
    ]);

    return NextResponse.json({
      success: true,
      message: 'Complaint schema diagnostic complete. No schema changes were made.',
      details: {
        targetTable: 'Complaint',
        targetColumn: 'orderId',
        initialNullable,
        syncExecuted: false,
        isNullable: initialNullable,
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
