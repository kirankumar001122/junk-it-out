import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { applyAgentWalletAdjustment, agentWalletTransactionTypes } from '@/lib/agentWallet';

function isAuthorizedAdmin(role?: string) {
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const authUser = await getAuthUser(req);
  if (!authUser || !isAuthorizedAdmin(authUser.role) || !authUser.userId) {
    return NextResponse.json(
      { success: false, message: 'Administrator access is required.' },
      { status: 403 },
    );
  }

  try {
    const { agentId } = await params;
    const body = await req.json().catch(() => ({}));
    const amount = Number(body.amount);
    const rawType = typeof body.type === 'string' ? body.type.trim().toUpperCase() : '';
    const rawDirection = typeof body.direction === 'string' ? body.direction.trim().toUpperCase() : undefined;
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

    if (!agentId || !Number.isFinite(amount) || amount <= 0 || amount > 1000000 || !reason) {
      return NextResponse.json(
        {
          success: false,
          message: 'Valid agent ID, positive amount, and mandatory reason are required.',
        },
        { status: 400 },
      );
    }

    // Determine type and direction
    let type: string = agentWalletTransactionTypes.manualAdjustment;
    let direction: 'CREDIT' | 'DEBIT' = 'CREDIT';

    if (rawType === 'MANUAL_DEBIT' || rawType === 'DEBIT' || rawDirection === 'DEBIT') {
      type = agentWalletTransactionTypes.manualAdjustment;
      direction = 'DEBIT';
    } else if (rawType === 'REFUND') {
      type = agentWalletTransactionTypes.refund;
      direction = 'CREDIT';
    } else if (rawType === 'CREDIT' || rawType === 'MANUAL_CREDIT') {
      type = agentWalletTransactionTypes.manualAdjustment;
      direction = 'CREDIT';
    }

    const agent = await db.agent.findUnique({
      where: { id: agentId },
      select: { id: true },
    });

    if (!agent) {
      return NextResponse.json(
        { success: false, message: 'Agent not found.' },
        { status: 404 },
      );
    }

    const referenceId = `admin-agent-adj-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const result = await db.$transaction((tx) =>
      applyAgentWalletAdjustment(tx, {
        agentId,
        amount,
        type,
        direction,
        adminId: authUser.userId!,
        reason,
        referenceId,
      }),
    );

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Admin agent wallet adjustment failed:', error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Agent wallet adjustment failed.',
      },
      { status: 400 },
    );
  }
}
