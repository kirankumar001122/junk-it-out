import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { dispatchAgentWalletNotification } from '@/lib/services/walletNotification';

export const agentWalletTransactionTypes = {
  credit: 'CREDIT',
  debit: 'DEBIT',
  refund: 'REFUND',
  manualAdjustment: 'MANUAL_ADJUSTMENT',
  pickupEarnings: 'PICKUP_EARNINGS',
} as const;

export type AgentWalletTransactionType =
  (typeof agentWalletTransactionTypes)[keyof typeof agentWalletTransactionTypes];

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function getOrCreateAgentWallet(
  agentId: string,
  tx?: Prisma.TransactionClient,
) {
  const client = tx || db;
  return client.agentWallet.upsert({
    where: { agentId },
    update: {},
    create: { agentId },
  });
}

export interface AgentWalletAdjustmentInput {
  agentId: string;
  amount: number;
  type: AgentWalletTransactionType | string;
  direction?: 'CREDIT' | 'DEBIT';
  adminId?: string;
  reason: string;
  referenceId?: string;
  orderId?: string;
}

export async function applyAgentWalletAdjustment(
  tx: Prisma.TransactionClient,
  input: AgentWalletAdjustmentInput,
) {
  const amount = roundCurrency(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Agent wallet adjustment amount must be greater than zero.');
  }

  const reason = input.reason?.trim();
  if (!reason) {
    throw new Error('A reason is mandatory for agent wallet adjustments.');
  }

  // Check idempotency if a referenceId is provided
  if (input.referenceId) {
    const existingTx = await tx.agentWalletTransaction.findUnique({
      where: { referenceId: input.referenceId },
    });
    if (existingTx && existingTx.status === 'SUCCESS') {
      const currentWallet = await tx.agentWallet.findUnique({
        where: { id: existingTx.walletId },
      });
      if (currentWallet) {
        return { wallet: currentWallet, transaction: existingTx };
      }
    }
  }

  const wallet = await tx.agentWallet.upsert({
    where: { agentId: input.agentId },
    update: {},
    create: { agentId: input.agentId },
  });

  // Pessimistic row-level lock
  await tx.$queryRaw`SELECT "id" FROM "AgentWallet" WHERE "id" = ${wallet.id} FOR UPDATE`;
  const lockedWallet = await tx.agentWallet.findUnique({
    where: { id: wallet.id },
  });
  if (!lockedWallet) {
    throw new Error('Agent wallet was not found.');
  }

  const isDeduction =
    input.type === agentWalletTransactionTypes.debit ||
    (input.type === agentWalletTransactionTypes.manualAdjustment && input.direction === 'DEBIT') ||
    input.direction === 'DEBIT';

  const nextBalance = isDeduction
    ? roundCurrency(lockedWallet.balance - amount)
    : roundCurrency(lockedWallet.balance + amount);

  if (nextBalance < 0) {
    throw new Error('Agent wallet balance cannot become negative.');
  }

  const updatedWallet = await tx.agentWallet.update({
    where: { id: lockedWallet.id },
    data: { balance: nextBalance },
  });

  const transaction = await tx.agentWalletTransaction.create({
    data: {
      walletId: updatedWallet.id,
      agentId: input.agentId,
      type: input.type,
      amount,
      balanceAfter: nextBalance,
      status: 'SUCCESS',
      referenceId: input.referenceId || null,
      orderId: input.orderId || null,
      reason,
      adminId: input.adminId || null,
    },
  });

  await dispatchAgentWalletNotification(tx, {
    agentId: input.agentId,
    type: input.type,
    amount,
    balanceAfter: nextBalance,
    reason,
    referenceId: input.referenceId || null,
  });

  return { wallet: updatedWallet, transaction };
}

export interface CreditAgentPickupEarningsInput {
  agentId: string;
  orderId: string;
  orderNumber: string;
  amount?: number;
  reason?: string;
}

/**
 * Handles agent pickup earnings at completion.
 * Note: If commission / earning percentage is undefined in business requirements,
 * this function securely records nothing and returns null, awaiting business rule confirmation.
 */
export async function creditAgentPickupEarnings(
  tx: Prisma.TransactionClient,
  input: CreditAgentPickupEarningsInput,
) {
  const amount = typeof input.amount === 'number' ? roundCurrency(input.amount) : 0;
  if (!Number.isFinite(amount) || amount <= 0) {
    // Commission rate is currently unconfigured in the system.
    return null;
  }

  const referenceId = `agent-earning-${input.orderId}`;
  return applyAgentWalletAdjustment(tx, {
    agentId: input.agentId,
    amount,
    type: agentWalletTransactionTypes.pickupEarnings,
    direction: 'CREDIT',
    orderId: input.orderId,
    referenceId,
    reason: input.reason || `Pickup earnings for order #${input.orderNumber}`,
  });
}
