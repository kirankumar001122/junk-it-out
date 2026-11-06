import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/middleware';
import { getOrCreateAgentWallet } from '@/lib/agentWallet';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser || authUser.role !== 'AGENT' || !authUser.agentId) {
    return NextResponse.json(
      { success: false, message: 'Authenticated agent access is required.' },
      { status: 401 },
    );
  }

  try {
    const wallet = await getOrCreateAgentWallet(authUser.agentId);
    const transactions = await db.agentWalletTransaction.findMany({
      where: { agentId: authUser.agentId },
      include: {
        order: { select: { id: true, orderNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({
      success: true,
      data: {
        wallet: {
          id: wallet.id,
          agentId: wallet.agentId,
          balance: wallet.balance,
          updatedAt: wallet.updatedAt,
        },
        transactions: transactions.map((tx) => ({
          id: tx.id,
          walletId: tx.walletId,
          type: tx.type,
          amount: tx.amount,
          balanceAfter: tx.balanceAfter,
          status: tx.status,
          referenceId: tx.referenceId,
          orderId: tx.orderId,
          orderNumber: tx.order?.orderNumber || null,
          reason: tx.reason,
          createdAt: tx.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    console.error('Agent wallet lookup failed:', error);
    return NextResponse.json(
      { success: false, message: 'Unable to load agent wallet details.' },
      { status: 500 },
    );
  }
}
