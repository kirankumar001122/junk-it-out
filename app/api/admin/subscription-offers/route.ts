import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { parseBenefits } from '@/lib/wallet';

function isAdmin(role?: string) {
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}

function validateOffer(body: Record<string, unknown>) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const durationMonths = Number(body.durationMonths);
  const price = Number(body.price);
  const displayOrder = Number.isInteger(Number(body.displayOrder)) ? Number(body.displayOrder) : 0;
  const benefits = Array.isArray(body.benefits)
    ? body.benefits.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim())
    : typeof body.benefits === 'string'
      ? body.benefits.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
      : [];
  if (!name || !description || !Number.isInteger(durationMonths) || durationMonths <= 0 || durationMonths > 120 || !Number.isFinite(price) || price <= 0 || price > 1000000) {
    return null;
  }
  return { name, description, durationMonths, price, displayOrder, benefitsJson: JSON.stringify(benefits), active: body.active !== false };
}

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser || !isAdmin(authUser.role)) return NextResponse.json({ success: false, message: 'Administrator access is required.' }, { status: 403 });
  try {
    const offers = await db.subscriptionOffer.findMany({ orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }] });
    return NextResponse.json({ success: true, data: offers.map((offer) => ({ ...offer, benefits: parseBenefits(offer.benefitsJson) })) });
  } catch (error) {
    console.error('Admin subscription offer lookup failed:', error);
    return NextResponse.json({ success: false, message: 'Unable to load subscription offers.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser || !isAdmin(authUser.role)) return NextResponse.json({ success: false, message: 'Administrator access is required.' }, { status: 403 });
  try {
    const data = validateOffer(await req.json());
    if (!data) return NextResponse.json({ success: false, message: 'Valid name, description, positive price, and duration are required.' }, { status: 400 });
    const offer = await db.subscriptionOffer.create({ data });
    return NextResponse.json({ success: true, data: { ...offer, benefits: parseBenefits(offer.benefitsJson) } }, { status: 201 });
  } catch (error) {
    console.error('Subscription offer creation failed:', error);
    return NextResponse.json({ success: false, message: 'Unable to create subscription offer.' }, { status: 400 });
  }
}
