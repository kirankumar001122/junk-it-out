import { db } from '@/lib/db';
import { fromPaise, roundCurrency, toPaise } from '@/lib/wallet';

export const WALLET_BONUS_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED', 'ARCHIVED'] as const;
export const WALLET_BONUS_TYPES = ['PERCENTAGE', 'FIXED'] as const;

export type WalletBonusQuote = {
  rechargeAmount: number;
  campaignId: string | null;
  campaignName: string | null;
  bonusType: string | null;
  bonusPercentage: number;
  bonusAmount: number;
  maximumBonusAmount: number | null;
  bonusExpiryDays: number;
  totalCredit: number;
};

const isValidWindow = (campaign: { campaignStartDate: Date; campaignEndDate: Date; status: string; isActive: boolean }, now: Date) =>
  campaign.status === 'ACTIVE' &&
  campaign.isActive &&
  campaign.campaignStartDate <= now &&
  campaign.campaignEndDate >= now;

export async function calculateWalletBonusQuote(amount: number, now = new Date()): Promise<WalletBonusQuote> {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Recharge amount must be greater than zero.');
  const rechargeAmountPaise = toPaise(amount);
  const rechargeAmount = fromPaise(rechargeAmountPaise);

  const campaigns = await db.walletBonusCampaign.findMany({
    where: {
      status: 'ACTIVE',
      isActive: true,
      minimumRechargeAmount: { lte: rechargeAmount },
      campaignStartDate: { lte: now },
      campaignEndDate: { gte: now },
    },
    include: { slabs: { orderBy: { minimumAmount: 'desc' } } },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    take: 20,
  });
  const campaign = campaigns.find((candidate) => isValidWindow(candidate, now));
  if (!campaign) {
    return { rechargeAmount, campaignId: null, campaignName: null, bonusType: null, bonusPercentage: 0, bonusAmount: 0, maximumBonusAmount: null, bonusExpiryDays: 0, totalCredit: rechargeAmount };
  }

  const slab = campaign.slabs.find((candidate) =>
    rechargeAmount >= candidate.minimumAmount &&
    (candidate.maximumAmount === null || rechargeAmount <= candidate.maximumAmount)
  );
  const percentage = slab?.bonusPercentage ?? campaign.bonusPercentage ?? 0;
  const fixed = slab?.fixedBonusAmount ?? (campaign.bonusType === 'FIXED' ? campaign.bonusPercentage ?? 0 : 0);
  let bonusPaise = fixed !== null && fixed !== undefined
    ? toPaise(fixed)
    : Math.round(rechargeAmountPaise * percentage / 100);
  const cap = slab?.maximumBonusAmount ?? campaign.maximumBonusAmount;
  if (cap !== null && cap !== undefined) bonusPaise = Math.min(bonusPaise, toPaise(cap));
  bonusPaise = Math.max(0, bonusPaise);
  const bonus = fromPaise(bonusPaise);
  return {
    rechargeAmount,
    campaignId: campaign.id,
    campaignName: campaign.campaignName,
    bonusType: campaign.bonusType,
    bonusPercentage: roundCurrency(percentage),
    bonusAmount: bonus,
    maximumBonusAmount: cap ?? null,
    bonusExpiryDays: campaign.bonusExpiryDays,
    totalCredit: fromPaise(rechargeAmountPaise + bonusPaise),
  };
}

export function validateWalletBonusSlab(input: Record<string, unknown>) {
  const minimumAmount = Number(input.minimumAmount);
  const maximumAmount = input.maximumAmount === '' || input.maximumAmount === undefined ? null : Number(input.maximumAmount);
  const bonusPercentage = input.bonusPercentage === '' || input.bonusPercentage === undefined ? null : Number(input.bonusPercentage);
  const fixedBonusAmount = input.fixedBonusAmount === '' || input.fixedBonusAmount === undefined ? null : Number(input.fixedBonusAmount);
  const maximumBonusAmount = input.maximumBonusAmount === '' || input.maximumBonusAmount === undefined ? null : Number(input.maximumBonusAmount);
  if (!Number.isFinite(minimumAmount) || minimumAmount < 0 ||
      (maximumAmount !== null && (!Number.isFinite(maximumAmount) || maximumAmount < minimumAmount)) ||
      (bonusPercentage !== null && (!Number.isFinite(bonusPercentage) || bonusPercentage < 0 || bonusPercentage > 100)) ||
      (fixedBonusAmount !== null && (!Number.isFinite(fixedBonusAmount) || fixedBonusAmount < 0)) ||
      (maximumBonusAmount !== null && (!Number.isFinite(maximumBonusAmount) || maximumBonusAmount < 0)) ||
      (bonusPercentage === null && fixedBonusAmount === null) ||
      (bonusPercentage !== null && fixedBonusAmount !== null)) {
    throw new Error('Invalid slab configuration.');
  }
  return {
    minimumAmount: roundCurrency(minimumAmount),
    maximumAmount: maximumAmount === null ? null : roundCurrency(maximumAmount),
    bonusPercentage: bonusPercentage === null ? null : roundCurrency(bonusPercentage),
    fixedBonusAmount: fixedBonusAmount === null ? null : roundCurrency(fixedBonusAmount),
    maximumBonusAmount: maximumBonusAmount === null ? null : roundCurrency(maximumBonusAmount),
  };
}

export function validateWalletBonusCampaign(input: Record<string, unknown>) {
  const campaignName = typeof input.campaignName === 'string' ? input.campaignName.trim() : '';
  const start = new Date(String(input.campaignStartDate || ''));
  const end = new Date(String(input.campaignEndDate || ''));
  const status = typeof input.status === 'string' ? input.status : 'DRAFT';
  const bonusType = typeof input.bonusType === 'string' ? input.bonusType : 'PERCENTAGE';
  const minimum = Number(input.minimumRechargeAmount);
  const bonusPercentage = input.bonusPercentage === '' || input.bonusPercentage === undefined ? null : Number(input.bonusPercentage);
  const maximumBonusAmount = input.maximumBonusAmount === '' || input.maximumBonusAmount === undefined ? null : Number(input.maximumBonusAmount);
  const bonusExpiryDays = Number(input.bonusExpiryDays ?? 0);
  if (!campaignName || !WALLET_BONUS_STATUSES.includes(status as typeof WALLET_BONUS_STATUSES[number]) || !WALLET_BONUS_TYPES.includes(bonusType as typeof WALLET_BONUS_TYPES[number])) {
    throw new Error('Campaign name, status, and bonus type are required.');
  }
  if (!Number.isFinite(minimum) || minimum < 0 || !Number.isFinite(bonusExpiryDays) || bonusExpiryDays < 0 || !Number.isInteger(bonusExpiryDays) || end <= start) {
    throw new Error('Campaign amounts, dates, and expiry days are invalid.');
  }
  if (bonusPercentage !== null && (!Number.isFinite(bonusPercentage) || bonusPercentage < 0 || bonusPercentage > 100)) {
    throw new Error('Bonus percentage must be between 0 and 100.');
  }
  if (maximumBonusAmount !== null && (!Number.isFinite(maximumBonusAmount) || maximumBonusAmount < 0)) {
    throw new Error('Maximum bonus amount is invalid.');
  }
  return {
    campaignName,
    description: typeof input.description === 'string' ? input.description.trim() : '',
    bonusType,
    bonusPercentage,
    minimumRechargeAmount: roundCurrency(minimum),
    maximumBonusAmount: maximumBonusAmount === null ? null : roundCurrency(maximumBonusAmount),
    campaignStartDate: start,
    campaignEndDate: end,
    bonusExpiryDays,
    status,
    isActive: status === 'ACTIVE' && input.isActive === true,
    priority: Number.isInteger(Number(input.priority)) ? Number(input.priority) : 0,
  };
}
