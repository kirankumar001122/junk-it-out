import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requireAdminUser } from '@/lib/auth/middleware';

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser || !requireAdminUser(authUser)) {
      return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });
    }

    const { agentId } = await req.json().catch(() => ({}));
    if (!agentId || typeof agentId !== 'string') {
      return NextResponse.json({ success: false, message: 'Agent ID is required.' }, { status: 400 });
    }

    const agent = await db.agent.findUnique({
      where: { id: agentId },
      include: { user: true },
    });

    if (!agent) {
      return NextResponse.json({ success: false, message: 'Agent not found.' }, { status: 404 });
    }

    // Persistently invalidate agent session by incrementing tokenVersion and setting offline status
    const updatedAgent = await db.agent.update({
      where: { id: agent.id },
      data: {
        status: 'OFFLINE',
        tokenVersion: { increment: 1 } as any,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Agent ${agent.user?.name || agent.id} has been forced out of the Agent Portal.`,
      data: {
        id: updatedAgent.id,
        status: updatedAgent.status,
      },
    });
  } catch (error: any) {
    console.error('Force exit agent error:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to force exit agent.' }, { status: 500 });
  }
}
