import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { parseBenefits } from '@/lib/wallet';

function isAdmin(role?: string) {
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const authUser = await getAuthUser(req);
  if (!authUser || !isAdmin(authUser.role)) return NextResponse.json({ success: false, message: 'Administrator access is required.' }, { status: 403 });
  try {
    const { id } = await context.params;
    const body = await req.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const billingPeriod =
      typeof body.billingPeriod === 'string' && ['WEEKLY', 'MONTHLY', 'QUARTERLY'].includes(body.billingPeriod.toUpperCase())
        ? body.billingPeriod.toUpperCase()
        : 'MONTHLY';
    const durationMonths = Number.isInteger(Number(body.durationMonths)) ? Number(body.durationMonths) : (billingPeriod === 'WEEKLY' ? 0 : billingPeriod === 'QUARTERLY' ? 3 : 1);
    const durationDays = Number.isInteger(Number(body.durationDays)) && Number(body.durationDays) > 0
      ? Number(body.durationDays)
      : (billingPeriod === 'WEEKLY' ? 7 : billingPeriod === 'QUARTERLY' ? 90 : 30);
    const pickupLimit = Number.isInteger(Number(body.pickupLimit)) && Number(body.pickupLimit) >= 0
      ? Number(body.pickupLimit)
      : (billingPeriod === 'WEEKLY' ? 1 : billingPeriod === 'QUARTERLY' ? 12 : 4);
    const price = Number(body.price);
    const benefits = Array.isArray(body.benefits)
      ? body.benefits.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim())
      : typeof body.benefits === 'string'
        ? body.benefits.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
        : [];
    if (!name || !description || durationDays <= 0 || durationDays > 3650 || !Number.isFinite(price) || price <= 0 || price > 1000000) {
      return NextResponse.json({ success: false, message: 'Valid name, description, positive price, and duration are required.' }, { status: 400 });
    }
    const offer = await db.subscriptionOffer.update({
      where: { id },
      data: {
        name,
        description,
        billingPeriod,
        durationMonths,
        durationDays,
        pickupLimit,
        price,
        benefitsJson: JSON.stringify(benefits),
        active: body.active !== false,
        displayOrder: Number.isInteger(Number(body.displayOrder)) ? Number(body.displayOrder) : 0,
      } as any,
    });
    return NextResponse.json({ success: true, data: { ...offer, benefits: parseBenefits(offer.benefitsJson) } });
  } catch (error) {
    console.error('Subscription offer update failed:', error);
    return NextResponse.json({ success: false, message: 'Unable to update subscription offer.' }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const authUser = await getAuthUser(req);
  if (!authUser || !isAdmin(authUser.role)) return NextResponse.json({ success: false, message: 'Administrator access is required.' }, { status: 403 });
  try {
    const { id } = await context.params;
    const purchaseCount = await db.subscriptionPayment.count({ where: { offerId: id } });
    if (purchaseCount > 0) {
      const archived = await db.subscriptionOffer.update({ where: { id }, data: { active: false } });
      return NextResponse.json({ success: true, archived: true, data: archived });
    }
    await db.subscriptionOffer.delete({ where: { id } });
    return NextResponse.json({ success: true, deleted: true });
  } catch (error) {
    console.error('Subscription offer deletion failed:', error);
    return NextResponse.json({ success: false, message: 'Unable to delete subscription offer.' }, { status: 400 });
  }
}
