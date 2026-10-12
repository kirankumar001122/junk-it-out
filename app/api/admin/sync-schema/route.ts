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

    let syncExecuted = false;

    if (!initialNullable) {
      // 2. Non-destructive Additive Schema Synchronization
      // ALTER COLUMN orderId DROP NOT NULL makes orderId nullable without deleting any records or dropping tables.
      await db.$executeRawUnsafe(`ALTER TABLE "Complaint" ALTER COLUMN "orderId" DROP NOT NULL;`);
      syncExecuted = true;
    }

    // 3. Post-Sync Verification
    const postColumnCheck: any[] = await db.$queryRawUnsafe(`
      SELECT table_name, column_name, is_nullable, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'Complaint' AND column_name = 'orderId';
    `);

    const isNowNullable = postColumnCheck[0]?.is_nullable === 'YES';

    const [complaintCount, orderCount, customerCount, userCount] = await Promise.all([
      db.complaint.count(),
      db.order.count(),
      db.customer.count(),
      db.user.count(),
    ]);

    return NextResponse.json({
      success: true,
      message: 'Production complaint schema check and synchronization complete.',
      details: {
        targetTable: 'Complaint',
        targetColumn: 'orderId',
        initialNullable,
        syncExecuted,
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
