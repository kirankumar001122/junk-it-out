import { db } from '@/lib/db';
import { fromPaise, toPaise } from '@/lib/wallet';

type WalletTxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

export async function processExpiredWalletBonuses(now = new Date()) {
  const candidates = await db.walletBonusGrant.findMany({
    where: { status: 'ACTIVE', remainingPaise: { gt: 0 }, expiresAt: { lte: now } },
    select: { id: true },
    orderBy: [{ expiresAt: 'asc' }, { createdAt: 'asc' }],
    take: 100,
  });
  let processed = 0;
  for (const candidate of candidates) {
    const didProcess = await db.$transaction(async (tx) => {
      const grant = await tx.walletBonusGrant.findUnique({ where: { id: candidate.id } });
      if (!grant || grant.status !== 'ACTIVE' || grant.remainingPaise <= 0 || !grant.expiresAt || grant.expiresAt > now) return false;
      await tx.$queryRaw`SELECT "id" FROM "CustomerWallet" WHERE "id" = ${grant.walletId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "WalletBonusGrant" WHERE "id" = ${grant.id} FOR UPDATE`;
      const lockedGrant = await tx.walletBonusGrant.findUnique({ where: { id: grant.id } });
      if (!lockedGrant || lockedGrant.status !== 'ACTIVE' || lockedGrant.remainingPaise <= 0) return false;
      const wallet = await tx.customerWallet.findUnique({ where: { id: lockedGrant.walletId } });
      if (!wallet) throw new Error('Customer wallet was not found.');
      const amountPaise = lockedGrant.remainingPaise;
      const balancePaise = typeof wallet.balancePaise === 'number' ? wallet.balancePaise : toPaise(wallet.balance);
      if (balancePaise < amountPaise) throw new Error('Wallet balance changed during bonus expiry.');
      const nextBalancePaise = balancePaise - amountPaise;
      const referenceId = `bonus-expiry-${lockedGrant.id}`;
      const existing = await tx.walletTransaction.findFirst({ where: { referenceId, type: 'BONUS_EXPIRY' } });
      if (existing) return false;
      await tx.customerWallet.update({ where: { id: wallet.id }, data: { balancePaise: nextBalancePaise, balance: fromPaise(nextBalancePaise) } });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          customerId: lockedGrant.customerId,
          type: 'BONUS_EXPIRY',
          amount: fromPaise(amountPaise),
          amountPaise,
          balanceAfter: fromPaise(nextBalancePaise),
          balanceAfterPaise: nextBalancePaise,
          status: 'SUCCESS',
          referenceId,
          reason: 'Promotional bonus expired.',
          campaignId: lockedGrant.campaignId,
          bonusGrantId: lockedGrant.id,
          bonusAmount: fromPaise(amountPaise),
        },
      });
      await tx.walletBonusGrant.update({ where: { id: lockedGrant.id }, data: { remainingPaise: 0, status: 'EXPIRED' } });
      return true;
    });
    if (didProcess) processed += 1;
  }
  return { candidates: candidates.length, processed };
}

export async function reverseWalletBonusForRefund(
  providerPaymentId: string,
  refundAmount: number,
  refundIdentity?: string,
) {
  const recharge = await db.walletTransaction.findFirst({
    where: { gatewayPaymentId: providerPaymentId, type: 'TOPUP', status: 'SUCCESS' },
  });
  if (!recharge) return { reversed: 0, skipped: true };
  return db.$transaction(async (tx) => {
    const grant = await tx.walletBonusGrant.findFirst({ where: { rechargeTransactionId: recharge.id } });
    if (!grant || grant.grantedPaise <= 0) return { reversed: 0, skipped: true };
    await tx.$queryRaw`SELECT "id" FROM "CustomerWallet" WHERE "id" = ${grant.walletId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "WalletBonusGrant" WHERE "id" = ${grant.id} FOR UPDATE`;
    const lockedGrant = await tx.walletBonusGrant.findUnique({ where: { id: grant.id } });
    if (!lockedGrant || lockedGrant.remainingPaise <= 0) return { reversed: 0, spent: true };
    const refundPaise = Math.min(toPaise(refundAmount), toPaise(recharge.amount));
    const proportionalPaise = Math.round((refundPaise * lockedGrant.grantedPaise) / toPaise(recharge.amount));
    const amountPaise = Math.min(proportionalPaise, lockedGrant.remainingPaise);
    if (amountPaise <= 0) return { reversed: 0, spent: true };
    const referenceId = `bonus-reversal-${lockedGrant.id}-${refundIdentity || refundPaise}`;
    const duplicate = await tx.walletTransaction.findFirst({ where: { referenceId, type: 'BONUS_REVERSAL' } });
    if (duplicate) return { reversed: 0, duplicate: true };
    const wallet = await tx.customerWallet.findUnique({ where: { id: lockedGrant.walletId } });
    if (!wallet) throw new Error('Customer wallet was not found.');
    const balancePaise = typeof wallet.balancePaise === 'number' ? wallet.balancePaise : toPaise(wallet.balance);
    if (balancePaise < amountPaise) throw new Error('Wallet balance changed during bonus reversal.');
    const nextBalancePaise = balancePaise - amountPaise;
    await tx.customerWallet.update({ where: { id: wallet.id }, data: { balancePaise: nextBalancePaise, balance: fromPaise(nextBalancePaise) } });
    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        customerId: lockedGrant.customerId,
        type: 'BONUS_REVERSAL',
        amount: fromPaise(amountPaise),
        amountPaise,
        balanceAfter: fromPaise(nextBalancePaise),
        balanceAfterPaise: nextBalancePaise,
        status: 'SUCCESS',
        referenceId,
        reason: `Promotional bonus reversed for refund ${fromPaise(refundPaise)}.`,
        campaignId: lockedGrant.campaignId,
        bonusGrantId: lockedGrant.id,
        bonusAmount: fromPaise(amountPaise),
        originalRechargeAmount: recharge.amount,
      },
    });
    const remainingPaise = lockedGrant.remainingPaise - amountPaise;
    await tx.walletBonusGrant.update({ where: { id: lockedGrant.id }, data: { remainingPaise, status: remainingPaise === 0 ? 'REVERSED' : 'ACTIVE' } });
    return { reversed: fromPaise(amountPaise), spent: amountPaise < proportionalPaise };
  });
}
