import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ success: false, message: 'Authentication is required.' }, { status: 401 });
    }
    if (authUser.role !== 'SUPER_ADMIN') {
      return NextResponse.json({
        success: false,
        message: 'Super admin authorization required for database schema operations.',
      }, { status: 403 });
    }

    // 1. Read-only Schema Inspection (Runtime DDL is removed for security)
    const columnCheck: any[] = await db.$queryRawUnsafe(`
      SELECT table_name, column_name, is_nullable, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'Complaint' AND column_name = 'orderId';
    `);

    const isNullable = columnCheck[0]?.is_nullable === 'YES';

    const [complaintCount, orderCount, customerCount, userCount] = await Promise.all([
      db.complaint.count(),
      db.order.count(),
      db.customer.count(),
      db.user.count(),
    ]);

    await db.auditLog.create({
      data: {
        userId: authUser.userId,
        userName: authUser.name,
        action: 'SCHEMA_STATUS_INSPECTED',
        oldValue: null,
        newValue: `Complaint.orderId nullable: ${isNullable}. Runtime DDL execution retired; use version-controlled Prisma migrations.`,
      },
    }).catch(() => null);

    return NextResponse.json({
      success: true,
      message: 'Schema inspection complete. Runtime DDL execution is disabled; schema migrations are managed via version-controlled Prisma migrations.',
      details: {
        targetTable: 'Complaint',
        targetColumn: 'orderId',
        initialNullable: isNullable,
        syncExecuted: false,
        isNullable,
        migrationStrategy: 'PRISMA_MIGRATIONS',
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
