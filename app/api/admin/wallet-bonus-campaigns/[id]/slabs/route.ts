import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminAuthorizationStatus, getAuthUser, requireAdminUser } from '@/lib/auth/middleware';
import { validateWalletBonusSlab } from '@/lib/walletBonus';

async function authorized(req: NextRequest) {
  const user = await getAuthUser(req);
  return { user: requireAdminUser(user), status: getAdminAuthorizationStatus(user) };
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { user, status } = await authorized(req);
  if (!user) return NextResponse.json({ success: false, message: 'Admin access is required.' }, { status });
  const { id } = await context.params;
  try {
    const campaign = await db.walletBonusCampaign.findUnique({ where: { id }, select: { id: true } });
    if (!campaign) return NextResponse.json({ success: false, message: 'Campaign not found.' }, { status: 404 });
    const slab = await db.walletBonusSlab.create({ data: { campaignId: id, ...validateWalletBonusSlab(await req.json()) } });
    return NextResponse.json({ success: true, data: slab }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : 'Invalid slab configuration.' }, { status: 400 });
  }
}
