import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { getOrCreateAgentWallet } from '@/lib/agentWallet';

function isAuthorizedAdmin(role?: string) {
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const authUser = await getAuthUser(req);
  if (!authUser || !isAuthorizedAdmin(authUser.role)) {
    return NextResponse.json(
      { success: false, message: 'Administrator access is required.' },
      { status: 403 },
    );
  }

  try {
    const { agentId } = await params;
    const agent = await db.agent.findUnique({
      where: { id: agentId },
      include: {
        user: { select: { id: true, name: true, phone: true, email: true } },
      },
    });

    if (!agent) {
      return NextResponse.json(
        { success: false, message: 'Agent not found.' },
        { status: 404 },
      );
    }

    const wallet = await getOrCreateAgentWallet(agentId);
    const transactions = await db.agentWalletTransaction.findMany({
      where: { agentId },
      include: {
        admin: { select: { id: true, name: true } },
        order: { select: { id: true, orderNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({
      success: true,
      data: {
        agent,
        wallet,
        transactions,
      },
    });
  } catch (error) {
    console.error('Admin single agent wallet lookup failed:', error);
    return NextResponse.json(
      { success: false, message: 'Unable to load agent wallet details.' },
      { status: 500 },
    );
  }
}
