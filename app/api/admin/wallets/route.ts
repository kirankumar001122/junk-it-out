import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { applyWalletAdjustment } from '@/lib/wallet';

function isAuthorizedAdmin(role?: string) {
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser || !isAuthorizedAdmin(authUser.role)) {
    return NextResponse.json({ success: false, message: 'Administrator access is required.' }, { status: 403 });
  }

  try {
    const params = req.nextUrl.searchParams;
    const customerId = params.get('customerId') || undefined;
    const search = params.get('search')?.trim() || undefined;
    const type = params.get('type') || undefined;
    const status = params.get('status') || undefined;
    const transactions = await db.walletTransaction.findMany({
      where: {
        customerId,
        type,
        status,
        createdAt: {
          gte: params.get('from') ? new Date(params.get('from')!) : undefined,
          lte: params.get('to') ? new Date(`${params.get('to')}T23:59:59.999Z`) : undefined,
        },
        customer: search
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
      include: { customer: { include: { user: { select: { name: true, phone: true, email: true } } } }, admin: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const wallets = await db.customerWallet.findMany({
      where: customerId ? { customerId } : undefined,
      include: { customer: { include: { user: { select: { name: true, phone: true, email: true } } } } },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
    return NextResponse.json({ success: true, data: { wallets, transactions } });
  } catch (error) {
    console.error('Admin wallet lookup failed:', error);
    return NextResponse.json({ success: false, message: 'Unable to load wallet management data.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser || !isAuthorizedAdmin(authUser.role) || !authUser.userId) {
    return NextResponse.json({ success: false, message: 'Administrator access is required.' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const customerId = typeof body.customerId === 'string' ? body.customerId : '';
    const amount = Number(body.amount);
    const type = body.type === 'MANUAL_DEBIT' ? 'MANUAL_DEBIT' : body.type === 'MANUAL_CREDIT' ? 'MANUAL_CREDIT' : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!customerId || !type || !Number.isFinite(amount) || amount <= 0 || amount > 1000000 || !reason) {
      return NextResponse.json({ success: false, message: 'Customer, valid amount, adjustment type, and reason are required.' }, { status: 400 });
    }

    const customer = await db.customer.findUnique({ where: { id: customerId }, select: { id: true } });
    if (!customer) return NextResponse.json({ success: false, message: 'Customer not found.' }, { status: 404 });
    const result = await db.$transaction((tx) =>
      applyWalletAdjustment(tx, {
        customerId,
        amount,
        type,
        adminId: authUser.userId!,
        reason,
        referenceId: `admin-adjustment-${Date.now()}`,
      }),
    );
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Admin wallet adjustment failed:', error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : 'Wallet adjustment failed.' }, { status: 400 });
  }
}
