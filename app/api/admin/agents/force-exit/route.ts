import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminAuthorizationStatus, getAuthUser } from '@/lib/auth/middleware';

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const authorizationStatus = getAdminAuthorizationStatus(authUser);
    if (authorizationStatus === 401) {
      return NextResponse.json({ success: false, message: 'Authentication is required.' }, { status: 401 });
    }
    if (authorizationStatus === 403) {
      return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });
    }

    const { agentId } = await req.json().catch(() => ({}));
    if (!agentId || typeof agentId !== 'string') {
      return NextResponse.json({ success: false, message: 'Agent ID is required.' }, { status: 400 });
    }

    const agent = await db.agent.findUnique({
      where: { id: agentId.trim() },
      include: { user: { select: { id: true, name: true, phone: true } } },
    });

    if (!agent) {
      return NextResponse.json({ success: false, message: 'Agent not found.' }, { status: 404 });
    }

    const oldStatus = agent.status;
    const oldTokenVersion = (agent as any).tokenVersion ?? 1;

    // Persistently invalidate agent session by incrementing tokenVersion and setting offline status
    const updatedAgent = await db.agent.update({
      where: { id: agent.id },
      data: {
        status: 'OFFLINE',
        tokenVersion: { increment: 1 } as any,
      },
    });

    if (agent.userId) {
      await db.user.update({
        where: { id: agent.userId },
        data: { tokenVersion: { increment: 1 } },
      }).catch(() => null);
    }

    // Immutable audit log for destructive force-exit session revocation
    await db.auditLog.create({
      data: {
        userId: authUser?.userId || null,
        userName: authUser?.name || 'Admin Operations',
        action: 'AGENT_FORCE_EXIT',
        oldValue: `Agent ${agent.user?.name || agent.id} (${agent.user?.phone || 'N/A'}) - Status: ${oldStatus}, TokenVersion: ${oldTokenVersion}`,
        newValue: `Agent forced offline - Status: OFFLINE, TokenVersion: ${oldTokenVersion + 1}`,
      },
    }).catch(() => null);

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
