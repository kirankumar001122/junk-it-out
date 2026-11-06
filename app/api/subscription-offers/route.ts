import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { parseBenefits } from '@/lib/wallet';
import { DEFAULT_SUBSCRIPTION_PLANS } from '@/lib/subscriptions';

export async function GET() {
  try {
    let offers = await db.subscriptionOffer.findMany({
      where: { active: true },
      orderBy: [{ displayOrder: 'asc' }, { price: 'asc' }],
    });

    if (offers.length === 0) {
      // Initialize with standard plans
      for (const plan of DEFAULT_SUBSCRIPTION_PLANS) {
        await db.subscriptionOffer.upsert({
          where: { name_durationMonths: { name: plan.name, durationMonths: plan.durationMonths } },
          create: {
            name: plan.name,
            description: plan.description,
            billingPeriod: plan.billingPeriod,
            durationMonths: plan.durationMonths,
            durationDays: plan.durationDays,
            price: plan.price,
            pickupLimit: plan.pickupLimit,
            benefitsJson: JSON.stringify(plan.benefits),
            displayOrder: plan.displayOrder,
            active: true,
          },
          update: {},
        });
      }

      offers = await db.subscriptionOffer.findMany({
        where: { active: true },
        orderBy: [{ displayOrder: 'asc' }, { price: 'asc' }],
      });
    }

    return NextResponse.json({
      success: true,
      data: offers.map((offer) => ({
        ...offer,
        billingPeriod: offer.billingPeriod || (offer.durationMonths === 0 ? 'WEEKLY' : offer.durationMonths === 3 ? 'QUARTERLY' : 'MONTHLY'),
        pickupLimit: offer.pickupLimit || (offer.durationMonths === 0 ? 1 : offer.durationMonths === 3 ? 12 : 4),
        benefits: parseBenefits(offer.benefitsJson),
      })),
    });
  } catch (error) {
    console.error('Subscription offers lookup failed:', error);
    return NextResponse.json({ success: false, message: 'Unable to load subscription offers.' }, { status: 500 });
  }
}
