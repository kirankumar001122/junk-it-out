import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { parseBenefits } from '@/lib/wallet';

export async function GET() {
  try {
    const offers = await db.subscriptionOffer.findMany({
      where: { active: true },
      orderBy: [{ displayOrder: 'asc' }, { price: 'asc' }],
    });
    return NextResponse.json({
      success: true,
      data: offers.map((offer) => ({ ...offer, benefits: parseBenefits(offer.benefitsJson) })),
    });
  } catch (error) {
    console.error('Subscription offers lookup failed:', error);
    return NextResponse.json({ success: false, message: 'Unable to load subscription offers.' }, { status: 500 });
  }
}
