import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const auditLogs = await db.auditLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 100,
    });
    return NextResponse.json({ success: true, data: auditLogs });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
