import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminAuthorizationStatus, getAuthUser, requireAdminUser } from '@/lib/auth/middleware';
import { validateWalletBonusSlab } from '@/lib/walletBonus';

async function authorized(req: NextRequest) {
  const user = await getAuthUser(req);
  return { user: requireAdminUser(user), status: getAdminAuthorizationStatus(user) };
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string; slabId: string }> }) {
  const { user, status } = await authorized(req);
  if (!user) return NextResponse.json({ success: false, message: 'Admin access is required.' }, { status });
  const { id, slabId } = await context.params;
  try {
    const existing = await db.walletBonusSlab.findFirst({ where: { id: slabId, campaignId: id } });
    if (!existing) return NextResponse.json({ success: false, message: 'Slab not found.' }, { status: 404 });
    const slab = await db.walletBonusSlab.update({ where: { id: slabId }, data: validateWalletBonusSlab(await req.json()) });
    return NextResponse.json({ success: true, data: slab });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : 'Invalid slab configuration.' }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string; slabId: string }> }) {
  const { user, status } = await authorized(req);
  if (!user) return NextResponse.json({ success: false, message: 'Admin access is required.' }, { status });
  const { id, slabId } = await context.params;
  const existing = await db.walletBonusSlab.findFirst({ where: { id: slabId, campaignId: id } });
  if (!existing) return NextResponse.json({ success: false, message: 'Slab not found.' }, { status: 404 });
  await db.walletBonusSlab.delete({ where: { id: slabId } });
  return NextResponse.json({ success: true });
}
