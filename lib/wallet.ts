import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';

export const walletTransactionTypes = {
  topup: 'TOPUP',
  manualCredit: 'MANUAL_CREDIT',
  manualDebit: 'MANUAL_DEBIT',
  walletDebit: 'WALLET_DEBIT',
} as const;

export function toPaise(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Invalid monetary amount.');
  return Math.round(value * 100);
}

export function fromPaise(value: number): number {
  return value / 100;
}

type WalletTransactionClient = Prisma.TransactionClient;

export async function spendWalletPaise(
  tx: WalletTransactionClient,
  input: {
    customerId: string;
    amountPaise: number;
    referenceId: string;
    reason: string;
    insufficientMessage?: string;
  },
) {
  if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) throw new Error('Wallet debit amount must be greater than zero.');
  const existing = await tx.walletTransaction.findFirst({
    where: { customerId: input.customerId, referenceId: input.referenceId, type: walletTransactionTypes.walletDebit, status: 'SUCCESS' },
  });
  if (existing) return { alreadyProcessed: true, transaction: existing, allocations: [] };

  const wallet = await tx.customerWallet.upsert({
    where: { customerId: input.customerId },
    update: {},
    create: { customerId: input.customerId, balance: 0, balancePaise: 0, paidBalancePaise: 0 },
  });
  await tx.$queryRaw`SELECT "id" FROM "CustomerWallet" WHERE "id" = ${wallet.id} FOR UPDATE`;
  const lockedWallet = await tx.customerWallet.findUnique({ where: { id: wallet.id } });
  if (!lockedWallet) throw new Error('Customer wallet was not found.');
  const currentBalancePaise = typeof lockedWallet.balancePaise === 'number' ? lockedWallet.balancePaise : toPaise(lockedWallet.balance);
  if (currentBalancePaise < input.amountPaise) throw new Error(input.insufficientMessage || 'Insufficient wallet balance for this payment.');

  const grants = await tx.walletBonusGrant.findMany({
    where: { walletId: wallet.id, status: 'ACTIVE', remainingPaise: { gt: 0 }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  let remaining = input.amountPaise;
  const allocations: Array<{ grantId: string; consumedPaise: number }> = [];
  for (const grant of grants) {
    if (remaining <= 0) break;
    await tx.$queryRaw`SELECT "id" FROM "WalletBonusGrant" WHERE "id" = ${grant.id} FOR UPDATE`;
    const lockedGrant = await tx.walletBonusGrant.findUnique({ where: { id: grant.id } });
    if (!lockedGrant || lockedGrant.status !== 'ACTIVE' || lockedGrant.remainingPaise <= 0) continue;
    const consumedPaise = Math.min(remaining, lockedGrant.remainingPaise);
    allocations.push({ grantId: grant.id, consumedPaise });
    remaining -= consumedPaise;
  }

  const nextBalancePaise = currentBalancePaise - input.amountPaise;
  const promotionalConsumedPaise = allocations.reduce((sum, allocation) => sum + allocation.consumedPaise, 0);
  const paidDebitPaise = input.amountPaise - promotionalConsumedPaise;
  const currentPaidBalancePaise = typeof lockedWallet.paidBalancePaise === 'number'
    ? lockedWallet.paidBalancePaise
    : Math.max(0, currentBalancePaise - grants.reduce((sum, grant) => sum + grant.remainingPaise, 0));
  const nextPaidBalancePaise = currentPaidBalancePaise - paidDebitPaise;
  if (nextPaidBalancePaise < 0) throw new Error('Wallet paid balance is inconsistent.');
  const updatedWallet = await tx.customerWallet.update({
    where: { id: wallet.id },
    data: { balancePaise: nextBalancePaise, paidBalancePaise: nextPaidBalancePaise, balance: fromPaise(nextBalancePaise) },
  });
  const transaction = await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      customerId: input.customerId,
      type: walletTransactionTypes.walletDebit,
      amount: fromPaise(input.amountPaise),
      amountPaise: input.amountPaise,
      balanceAfter: updatedWallet.balance,
      balanceAfterPaise: nextBalancePaise,
      status: 'SUCCESS',
      referenceId: input.referenceId,
      reason: input.reason,
    },
  });
  for (const allocation of allocations) {
    await tx.walletBonusGrant.update({
      where: { id: allocation.grantId },
      data: {
        remainingPaise: { decrement: allocation.consumedPaise },
        status: lockedGrantRemainingAfter(allocations, allocation, grantRemaining(grants, allocation.grantId)) === 0 ? 'CONSUMED' : 'ACTIVE',
      },
    });
    await tx.walletBonusConsumption.create({
      data: { grantId: allocation.grantId, walletTransactionId: transaction.id, consumedPaise: allocation.consumedPaise },
    });
  }

  function grantRemaining(
    grants: Array<{ id: string; remainingPaise: number }>,
    grantId: string,
  ) {
    return grants.find((grant) => grant.id === grantId)?.remainingPaise ?? 0;
  }

  function lockedGrantRemainingAfter(
    allocations: Array<{ grantId: string; consumedPaise: number }>,
    allocation: { grantId: string; consumedPaise: number },
    originalRemaining: number,
  ) {
    return originalRemaining - allocations
      .filter((item) => item.grantId === allocation.grantId)
      .reduce((sum, item) => sum + item.consumedPaise, 0);
  }
  return { alreadyProcessed: false, wallet: updatedWallet, transaction, allocations };
}

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
  if (input.type === walletTransactionTypes.manualDebit) {
    const debit = await spendWalletPaise(tx, {
      customerId: input.customerId,
      amountPaise: toPaise(amount),
      referenceId: input.referenceId || `admin-debit:${input.customerId}:${Date.now()}`,
      reason: input.reason,
      insufficientMessage: 'Wallet balance cannot become negative.',
    });
    if (debit.alreadyProcessed) return { wallet: null, transaction: debit.transaction };
    const transaction = await tx.walletTransaction.update({
      where: { id: debit.transaction.id },
      data: { adminId: input.adminId, type: input.type },
    });
    return { wallet: debit.wallet, transaction };
  }

  const wallet = await tx.customerWallet.upsert({
    where: { customerId: input.customerId },
    update: {},
    create: { customerId: input.customerId },
  });

  await tx.$queryRaw`SELECT "id" FROM "CustomerWallet" WHERE "id" = ${wallet.id} FOR UPDATE`;
  const lockedWallet = await tx.customerWallet.findUnique({ where: { id: wallet.id } });
  if (!lockedWallet) throw new Error('Customer wallet was not found.');

  const nextBalance = roundCurrency(lockedWallet.balance + amount);
  if (nextBalance < 0) throw new Error('Wallet balance cannot become negative.');

  const updatedWallet = await tx.customerWallet.update({
    where: { id: lockedWallet.id },
    data: { balance: nextBalance, balancePaise: toPaise(nextBalance), paidBalancePaise: (typeof lockedWallet.paidBalancePaise === 'number' ? lockedWallet.paidBalancePaise : toPaise(lockedWallet.balance)) + toPaise(amount) },
  });
  const transaction = await tx.walletTransaction.create({
    data: {
      walletId: updatedWallet.id,
      customerId: input.customerId,
      type: input.type,
      amount,
      amountPaise: toPaise(amount),
      balanceAfter: nextBalance,
      balanceAfterPaise: toPaise(nextBalance),
      status: 'SUCCESS',
      referenceId: input.referenceId,
      reason: input.reason,
      adminId: input.adminId,
    },
  });
  return { wallet: updatedWallet, transaction };
}
