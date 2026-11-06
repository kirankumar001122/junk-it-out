import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';

function isAuthorizedAdmin(role?: string) {
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser || !isAuthorizedAdmin(authUser.role)) {
    return NextResponse.json(
      { success: false, message: 'Administrator access is required.' },
      { status: 403 },
    );
  }

  try {
    const params = req.nextUrl.searchParams;
    const agentId = params.get('agentId') || undefined;
    const search = params.get('search')?.trim() || undefined;
    const type = params.get('type') || undefined;
    const status = params.get('status') || undefined;

    const fromDate = params.get('from') ? new Date(params.get('from')!) : undefined;
    const toDate = params.get('to') ? new Date(`${params.get('to')}T23:59:59.999Z`) : undefined;

    const [transactions, wallets] = await Promise.all([
      db.agentWalletTransaction.findMany({
        where: {
          agentId,
          type,
          status,
          createdAt: {
            gte: fromDate,
            lte: toDate,
          },
          agent: search
            ? {
                user: {
                  OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { phone: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } },
                  ],
                },
              }
            : undefined,
        },
        include: {
          agent: {
            include: {
              user: { select: { id: true, name: true, phone: true, email: true } },
            },
          },
          admin: { select: { id: true, name: true } },
          order: { select: { id: true, orderNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      db.agentWallet.findMany({
        where: agentId ? { agentId } : undefined,
        include: {
          agent: {
            include: {
              user: { select: { id: true, name: true, phone: true, email: true } },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 200,
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        wallets,
        transactions,
      },
    });
  } catch (error) {
    console.error('Admin agent wallet lookup failed:', error);
    return NextResponse.json(
      { success: false, message: 'Unable to load agent wallet management data.' },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser || !isAuthorizedAdmin(authUser.role) || !authUser.userId) {
    return NextResponse.json(
      { success: false, message: 'Administrator access is required.' },
      { status: 403 },
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const agentId = typeof body.agentId === 'string' ? body.agentId : '';
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

    const { applyAgentWalletAdjustment, agentWalletTransactionTypes } = await import('@/lib/agentWallet');

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

