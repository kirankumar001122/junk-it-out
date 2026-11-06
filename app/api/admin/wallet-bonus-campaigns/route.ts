import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminAuthorizationStatus, getAuthUser, requireAdminUser } from '@/lib/auth/middleware';
import { validateWalletBonusCampaign } from '@/lib/walletBonus';

async function admin(req: NextRequest) {
  const user = await getAuthUser(req);
  return { user: requireAdminUser(user), status: getAdminAuthorizationStatus(user) };
}

export async function GET(req: NextRequest) {
  const { user, status } = await admin(req);
  if (!user) return NextResponse.json({ success: false, message: 'Admin access is required.' }, { status });
  const campaigns = await db.walletBonusCampaign.findMany({
    include: { slabs: { orderBy: { minimumAmount: 'asc' } }, _count: { select: { transactions: true } } },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
  });
  return NextResponse.json({ success: true, data: campaigns });
}

export async function POST(req: NextRequest) {
  const { user, status } = await admin(req);
  if (!user) return NextResponse.json({ success: false, message: 'Admin access is required.' }, { status });
  try {
    const data = validateWalletBonusCampaign(await req.json());
    const campaign = await db.walletBonusCampaign.create({ data: { ...data, createdBy: user.userId || null } });
    return NextResponse.json({ success: true, data: campaign }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : 'Invalid campaign.' }, { status: 400 });
  }
}
