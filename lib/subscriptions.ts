import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { roundCurrency } from '@/lib/wallet';
import {
  dispatchCustomerWalletNotification,
  dispatchSubscriptionNotification,
} from '@/lib/services/walletNotification';

export const BILLING_PERIODS = {
  WEEKLY: 'WEEKLY',
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
} as const;

export type BillingPeriod = (typeof BILLING_PERIODS)[keyof typeof BILLING_PERIODS];

export interface DefaultOfferDefinition {
  name: string;
  description: string;
  billingPeriod: BillingPeriod;
  durationMonths: number;
  durationDays: number;
  price: number;
  pickupLimit: number;
  benefits: string[];
  displayOrder: number;
}

export const DEFAULT_SUBSCRIPTION_PLANS: DefaultOfferDefinition[] = [
  {
    name: 'Weekly Green Pass',
    description: 'Weekly convenience pass for regular doorstep scrap clearance.',
    billingPeriod: 'WEEKLY',
    durationMonths: 0,
    durationDays: 7,
    price: 99,
    pickupLimit: 1,
    benefits: [
      '1 Free doorstep pickup per week',
      'Zero base pickup fee waived',
      'Priority agent dispatch',
      'Dedicated WhatsApp support',
    ],
    displayOrder: 1,
  },
  {
    name: 'Monthly Standard',
    description: 'Full monthly household recycling pass with flexible doorstep pickups.',
    billingPeriod: 'MONTHLY',
    durationMonths: 1,
    durationDays: 30,
    price: 199,
    pickupLimit: 4,
    benefits: [
      '4 Free doorstep pickups per month',
      'Zero minimum scrap charge',
      'Priority agent dispatch',
      'Direct customer support',
    ],
    displayOrder: 2,
  },
  {
    name: 'Quarterly Premium',
    description: 'Three months of unlimited scrap management and VIP doorstep service.',
    billingPeriod: 'QUARTERLY',
    durationMonths: 3,
    durationDays: 90,
    price: 299,
    pickupLimit: 12,
    benefits: [
      '12 Free doorstep pickups (4/month)',
      'Zero minimum scrap charge',
      'Priority agent dispatch',
      'Top scrap valuation rates',
      'Dedicated account support',
    ],
    displayOrder: 3,
  },
];

export function calculateSubscriptionExpiry(
  startDate: Date,
  offer: { durationDays?: number | null; durationMonths?: number | null; billingPeriod?: string | null },
): Date {
  const result = new Date(startDate);
  if (typeof offer.durationDays === 'number' && offer.durationDays > 0) {
    result.setDate(result.getDate() + offer.durationDays);
    return result;
  }

  const months = typeof offer.durationMonths === 'number' && offer.durationMonths > 0 ? offer.durationMonths : 1;
  result.setMonth(result.getMonth() + months);
  return result;
}

export interface PurchaseWithWalletInput {
  customerId: string;
  offerId: string;
}

export async function purchaseSubscriptionWithWallet(
  tx: Prisma.TransactionClient,
  input: PurchaseWithWalletInput,
) {
  const offer = await tx.subscriptionOffer.findFirst({
    where: { id: input.offerId, active: true },
  });

  if (!offer) {
    throw new Error('Subscription offer not found or is currently inactive.');
  }

  const price = roundCurrency(offer.price);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('Subscription offer has an invalid price.');
  }

  // Row-level lock on customer wallet
  const wallet = await tx.customerWallet.upsert({
    where: { customerId: input.customerId },
    update: {},
    create: { customerId: input.customerId },
  });

  await tx.$queryRaw`SELECT "id" FROM "CustomerWallet" WHERE "id" = ${wallet.id} FOR UPDATE`;
  const lockedWallet = await tx.customerWallet.findUnique({
    where: { id: wallet.id },
  });

  if (!lockedWallet || lockedWallet.balance < price) {
    throw new Error('Insufficient customer wallet balance to complete subscription purchase.');
  }

  // Chain startDate to current active subscription if one exists
  const latestActive = await tx.customerSubscription.findFirst({
    where: {
      customerId: input.customerId,
      status: 'ACTIVE',
      expiryDate: { gt: new Date() },
    },
    orderBy: { expiryDate: 'desc' },
  });

  const startDate = latestActive ? latestActive.expiryDate : new Date();
  const expiryDate = calculateSubscriptionExpiry(startDate, offer);

  const payment = await tx.subscriptionPayment.create({
    data: {
      customerId: input.customerId,
      offerId: offer.id,
      amount: price,
      paymentMethod: 'WALLET',
      status: 'SUCCESS',
    },
  });

  const subscription = await tx.customerSubscription.create({
    data: {
      customerId: input.customerId,
      offerId: offer.id,
      paymentId: payment.id,
      startDate,
      expiryDate,
      status: 'ACTIVE',
      pickupsAllowed: offer.pickupLimit || 4,
      pickupsUsed: 0,
      autoRenew: false,
    },
    include: { offer: true },
  });

  const nextBalance = roundCurrency(lockedWallet.balance - price);
  const updatedWallet = await tx.customerWallet.update({
    where: { id: lockedWallet.id },
    data: { balance: nextBalance },
  });

  const walletTx = await tx.walletTransaction.create({
    data: {
      walletId: updatedWallet.id,
      customerId: input.customerId,
      type: 'WALLET_DEBIT',
      amount: price,
      balanceAfter: nextBalance,
      status: 'SUCCESS',
      referenceId: `sub:${subscription.id}`,
      reason: `Subscription plan: ${offer.name} (${offer.billingPeriod || 'MONTHLY'})`,
    },
  });

  await tx.subscriptionPayment.update({
    where: { id: payment.id },
    data: { walletTransactionId: walletTx.id },
  });

  await dispatchSubscriptionNotification(tx, {
    customerId: input.customerId,
    type: 'SUBSCRIPTION_PURCHASE',
    planName: offer.name,
    price,
    expiryDate,
    pickupsAllowed: offer.pickupLimit || 4,
  });

  await dispatchCustomerWalletNotification(tx, {
    customerId: input.customerId,
    type: 'WALLET_DEBIT',
    amount: price,
    balanceAfter: nextBalance,
    reason: `Subscription plan: ${offer.name} (${offer.billingPeriod || 'MONTHLY'})`,
    referenceId: `sub:${subscription.id}`,
  });

  return { subscription, payment, wallet: updatedWallet };
}

export interface EntitlementCheckResult {
  eligible: boolean;
  reason?: 'NO_ACTIVE_SUBSCRIPTION' | 'LIMIT_EXCEEDED' | 'SUBSCRIPTION_EXPIRED';
  subscription?: any;
  remainingPickups?: number;
}

export async function consumeSubscriptionPickupEntitlement(
  tx: Prisma.TransactionClient,
  input: { customerId: string; orderId?: string },
): Promise<EntitlementCheckResult> {
  const now = new Date();
  const activeSub = await tx.customerSubscription.findFirst({
    where: {
      customerId: input.customerId,
      status: 'ACTIVE',
      startDate: { lte: now },
      expiryDate: { gt: now },
    },
    include: { offer: true },
    orderBy: { expiryDate: 'asc' },
  });

  if (!activeSub) {
    return { eligible: false, reason: 'NO_ACTIVE_SUBSCRIPTION' };
  }

  // Row-level lock to prevent concurrency race when consuming entitlement
  await tx.$queryRaw`SELECT "id" FROM "CustomerSubscription" WHERE "id" = ${activeSub.id} FOR UPDATE`;
  const lockedSub = await tx.customerSubscription.findUnique({
    where: { id: activeSub.id },
    include: { offer: true },
  });

  if (!lockedSub || lockedSub.status !== 'ACTIVE' || lockedSub.expiryDate <= now || lockedSub.startDate > now) {
    return { eligible: false, reason: 'SUBSCRIPTION_EXPIRED' };
  }

  const limit = lockedSub.pickupsAllowed;
  if (limit > 0 && lockedSub.pickupsUsed >= limit) {
    return {
      eligible: false,
      reason: 'LIMIT_EXCEEDED',
      subscription: lockedSub,
      remainingPickups: 0,
    };
  }

  const updatedSub = await tx.customerSubscription.update({
    where: { id: lockedSub.id },
    data: { pickupsUsed: { increment: 1 } },
  });

  if (input.orderId) {
    await tx.order.update({
      where: { id: input.orderId },
      data: { subscriptionId: lockedSub.id },
    });
  }

  const remaining = limit > 0 ? Math.max(0, limit - updatedSub.pickupsUsed) : 999;
  return {
    eligible: true,
    subscription: updatedSub,
    remainingPickups: remaining,
  };
}

export async function cancelCustomerSubscription(
  tx: Prisma.TransactionClient,
  input: { subscriptionId: string; customerId?: string; reason?: string },
) {
  const sub = await tx.customerSubscription.findUnique({
    where: { id: input.subscriptionId },
    include: { offer: true },
  });

  if (!sub) {
    throw new Error('Subscription not found.');
  }

  if (input.customerId && sub.customerId !== input.customerId) {
    throw new Error('Unauthorized to cancel this subscription.');
  }

  if (sub.status === 'CANCELLED') {
    return sub;
  }

  const updatedSub = await tx.customerSubscription.update({
    where: { id: input.subscriptionId },
    data: {
      status: 'CANCELLED',
      autoRenew: false,
      cancelledAt: new Date(),
      cancellationReason: input.reason || 'Customer requested cancellation.',
    },
    include: { offer: true },
  });

  await dispatchSubscriptionNotification(tx, {
    customerId: sub.customerId,
    type: 'SUBSCRIPTION_CANCEL',
    planName: sub.offer?.name || updatedSub.offer?.name || 'Subscription Plan',
    reason: input.reason || 'Customer requested cancellation.',
  });

  return updatedSub;
}

