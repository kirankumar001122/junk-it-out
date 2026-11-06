import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminAuthorizationStatus, getAuthUser, requireAdminUser } from '@/lib/auth/middleware';
import { validateWalletBonusCampaign } from '@/lib/walletBonus';

async function authorized(req: NextRequest) {
  const user = await getAuthUser(req);
  return { user: requireAdminUser(user), status: getAdminAuthorizationStatus(user) };
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { user, status } = await authorized(req);
  if (!user) return NextResponse.json({ success: false, message: 'Admin access is required.' }, { status });
  const { id } = await context.params;
  const campaign = await db.walletBonusCampaign.findUnique({ where: { id }, include: { slabs: true, transactions: { orderBy: { createdAt: 'desc' }, take: 100 } } });
  if (!campaign) return NextResponse.json({ success: false, message: 'Campaign not found.' }, { status: 404 });
  return NextResponse.json({ success: true, data: campaign });
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { user, status } = await authorized(req);
  if (!user) return NextResponse.json({ success: false, message: 'Admin access is required.' }, { status });
  try {
    const { id } = await context.params;
    const existing = await db.walletBonusCampaign.findUnique({ where: { id }, include: { _count: { select: { transactions: true } } } });
    if (!existing) return NextResponse.json({ success: false, message: 'Campaign not found.' }, { status: 404 });
    const data = validateWalletBonusCampaign(await req.json());
    const campaign = await db.walletBonusCampaign.update({ where: { id }, data: { ...data, isActive: existing._count.transactions > 0 ? existing.isActive && data.isActive : data.isActive } });
    return NextResponse.json({ success: true, data: campaign });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : 'Invalid campaign.' }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { user, status } = await authorized(req);
  if (!user) return NextResponse.json({ success: false, message: 'Admin access is required.' }, { status });
  const { id } = await context.params;
  const existing = await db.walletBonusCampaign.findUnique({ where: { id }, include: { _count: { select: { transactions: true } } } });
  if (!existing) return NextResponse.json({ success: false, message: 'Campaign not found.' }, { status: 404 });
  if (existing._count.transactions > 0) {
    const archived = await db.walletBonusCampaign.update({ where: { id }, data: { status: 'ARCHIVED', isActive: false } });
    return NextResponse.json({ success: true, data: archived, archived: true });
  }
  await db.walletBonusCampaign.delete({ where: { id } });
  return NextResponse.json({ success: true, archived: false });
}
