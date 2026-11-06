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
    const durationMonths = Number(body.durationMonths);
    const price = Number(body.price);
    const benefits = Array.isArray(body.benefits) ? body.benefits.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim()) : [];
    if (!name || !description || !Number.isInteger(durationMonths) || durationMonths <= 0 || durationMonths > 120 || !Number.isFinite(price) || price <= 0 || price > 1000000) {
      return NextResponse.json({ success: false, message: 'Valid name, description, positive price, and duration are required.' }, { status: 400 });
    }
    const offer = await db.subscriptionOffer.update({
      where: { id },
      data: {
        name,
        description,
        durationMonths,
        price,
        benefitsJson: JSON.stringify(benefits),
        active: body.active !== false,
        displayOrder: Number.isInteger(Number(body.displayOrder)) ? Number(body.displayOrder) : 0,
      },
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
