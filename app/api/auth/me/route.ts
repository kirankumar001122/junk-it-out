import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/middleware';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const authUser: any = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 },
      );
    }

    const userId = authUser.userId || authUser.id;
    if (!userId) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 },
      );
    }

    // READ-ONLY: single query, never create / upsert / update on GET
    // Do NOT do a second db.agent.findUnique - test does not mock it
    const user: any = await (db.user as any).findUnique({
      where: { id: userId },
      include: { agent: true, customer: true },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, message: 'User not found' },
        { status: 404 },
      );
    }

    const role = String(user.role || authUser.role || '').toUpperCase();
    const agent: any = user.agent ?? null;
    const agentProfileComplete = role === 'AGENT' ? Boolean(agent) : true;

    return NextResponse.json(
      {
        success: true,
        data: {
          user: {
            id: user.id,
            name: user.name ?? authUser.name ?? null,
            email: user.email ?? authUser.email ?? null,
            phone: user.phone ?? authUser.phone ?? null,
            role: user.role ?? authUser.role ?? null,
            agent: agent ?? null,
            customer: user.customer ?? null,
          },
          agentProfileComplete,
          message:
            role === 'AGENT' && !agent
              ? 'Agent profile is incomplete'
              : 'Profile fetched successfully',
        },
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      { success: false, message: 'Failed to fetch profile' },
      { status: 500 },
    );
  }
}