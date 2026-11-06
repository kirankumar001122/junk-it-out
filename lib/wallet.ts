import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';

export const walletTransactionTypes = {
  topup: 'TOPUP',
  manualCredit: 'MANUAL_CREDIT',
  manualDebit: 'MANUAL_DEBIT',
  walletDebit: 'WALLET_DEBIT',
} as const;

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function parseBenefits(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export async function getOrCreateWallet(customerId: string) {
  return db.customerWallet.upsert({
    where: { customerId },
    update: {},
    create: { customerId },
  });
}

export async function applyWalletAdjustment(
  tx: Prisma.TransactionClient,
  input: {
    customerId: string;
    amount: number;
    type: 'MANUAL_CREDIT' | 'MANUAL_DEBIT';
    adminId: string;
    reason: string;
    referenceId?: string;
  },
) {
  const amount = roundCurrency(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Wallet adjustment amount must be greater than zero.');
  }
  const wallet = await tx.customerWallet.upsert({
    where: { customerId: input.customerId },
    update: {},
    create: { customerId: input.customerId },
  });

  await tx.$queryRaw`SELECT "id" FROM "CustomerWallet" WHERE "id" = ${wallet.id} FOR UPDATE`;
  const lockedWallet = await tx.customerWallet.findUnique({ where: { id: wallet.id } });
  if (!lockedWallet) throw new Error('Customer wallet was not found.');

  const nextBalance =
    input.type === walletTransactionTypes.manualDebit
      ? roundCurrency(lockedWallet.balance - amount)
      : roundCurrency(lockedWallet.balance + amount);
  if (nextBalance < 0) throw new Error('Wallet balance cannot become negative.');

  const updatedWallet = await tx.customerWallet.update({
    where: { id: lockedWallet.id },
    data: { balance: nextBalance },
  });
  const transaction = await tx.walletTransaction.create({
    data: {
      walletId: updatedWallet.id,
      customerId: input.customerId,
      type: input.type,
      amount,
      balanceAfter: nextBalance,
      status: 'SUCCESS',
      referenceId: input.referenceId,
      reason: input.reason,
      adminId: input.adminId,
    },
  });
  return { wallet: updatedWallet, transaction };
}
