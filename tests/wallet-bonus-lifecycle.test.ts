import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = {
  walletBonusGrant: { findMany: vi.fn(), findUnique: vi.fn() },
  walletTransaction: { findFirst: vi.fn() },
  $transaction: vi.fn(),
};

vi.mock('@/lib/db', () => ({ db }));

describe('wallet bonus lifecycle', () => {
  beforeEach(() => vi.clearAllMocks());

  it('expires a grant once and preserves the paid balance floor', async () => {
    const grant = { id: 'grant-1', walletId: 'wallet-1', customerId: 'customer-1', grantedPaise: 2500, remainingPaise: 2500, status: 'ACTIVE', campaignId: 'campaign-1', expiresAt: new Date('2026-01-01') };
    const tx = {
      walletBonusGrant: { findUnique: vi.fn().mockResolvedValue(grant), findFirst: vi.fn().mockResolvedValue(grant), update: vi.fn() },
      walletTransaction: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
      customerWallet: { findUnique: vi.fn().mockResolvedValue({ id: 'wallet-1', balance: 125, balancePaise: 12500 }), update: vi.fn() },
      $queryRaw: vi.fn(),
    };
    db.walletBonusGrant.findMany.mockResolvedValue([{ id: grant.id }]);
    db.$transaction.mockImplementation(async (callback) => callback(tx));
    const { processExpiredWalletBonuses } = await import('@/lib/walletBonusLifecycle');
    const result = await processExpiredWalletBonuses(new Date('2026-02-01'));
    expect(result.processed).toBe(1);
    expect(tx.walletTransaction.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: 'BONUS_EXPIRY', amountPaise: 2500 }) }));
    expect(tx.walletBonusGrant.update).toHaveBeenCalledWith(expect.objectContaining({ data: { remainingPaise: 0, status: 'EXPIRED' } }));
  });

  it('does not process a grant twice after a stable expiry entry exists', async () => {
    const grant = { id: 'grant-1', walletId: 'wallet-1', remainingPaise: 2500, status: 'ACTIVE', expiresAt: new Date('2026-01-01') };
    const tx = {
      walletBonusGrant: { findUnique: vi.fn().mockResolvedValue(grant), findFirst: vi.fn().mockResolvedValue(grant), update: vi.fn() },
      walletTransaction: { findFirst: vi.fn().mockResolvedValue({ id: 'expiry-1' }) },
      customerWallet: { findUnique: vi.fn().mockResolvedValue({ id: 'wallet-1', balance: 25, balancePaise: 2500 }) },
      $queryRaw: vi.fn(),
    };
    db.walletBonusGrant.findMany.mockResolvedValue([{ id: grant.id }]);
    db.$transaction.mockImplementation(async (callback) => callback(tx));
    const { processExpiredWalletBonuses } = await import('@/lib/walletBonusLifecycle');
    await expect(processExpiredWalletBonuses()).resolves.toMatchObject({ processed: 0 });
  });

  it('reverses remaining promotional grant value and identifies repeated refunds', async () => {
    const grant = { id: 'grant-1', walletId: 'wallet-1', customerId: 'customer-1', grantedPaise: 2000, remainingPaise: 2000, status: 'ACTIVE', campaignId: 'campaign-1' };
    db.walletTransaction.findFirst.mockResolvedValue({ id: 'recharge-1', amount: 100, gatewayPaymentId: 'pay-1', type: 'TOPUP', status: 'SUCCESS' });
    const tx = {
      walletBonusGrant: { findUnique: vi.fn().mockResolvedValue(grant), findFirst: vi.fn().mockResolvedValue(grant), update: vi.fn() },
      walletTransaction: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
      customerWallet: { findUnique: vi.fn().mockResolvedValue({ balance: 120, balancePaise: 12000 }), update: vi.fn() },
      $queryRaw: vi.fn(),
    };
    db.$transaction.mockImplementation(async (callback) => callback(tx));
    const { reverseWalletBonusForRefund } = await import('@/lib/walletBonusLifecycle');
    const result = await reverseWalletBonusForRefund('pay-1', 100, 'refund-1');
    expect(result.reversed).toBe(20);
    expect(tx.walletTransaction.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: 'BONUS_REVERSAL', bonusGrantId: 'grant-1' }) }));
  });

  it('consumes promotional grants FIFO and leaves later grants untouched', async () => {
    const tx = {
      walletTransaction: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'debit-1' }) },
      customerWallet: { upsert: vi.fn().mockResolvedValue({ id: 'wallet-1' }), findUnique: vi.fn().mockResolvedValue({ id: 'wallet-1', balance: 50, balancePaise: 5000 }), update: vi.fn().mockResolvedValue({ id: 'wallet-1', balance: 30, balancePaise: 3000 }) },
      walletBonusGrant: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'old-grant', remainingPaise: 1500, status: 'ACTIVE' },
          { id: 'new-grant', remainingPaise: 5000, status: 'ACTIVE' },
        ]),
        findUnique: vi.fn()
          .mockResolvedValueOnce({ id: 'old-grant', remainingPaise: 1500, status: 'ACTIVE' })
          .mockResolvedValueOnce({ id: 'new-grant', remainingPaise: 5000, status: 'ACTIVE' }),
        update: vi.fn(),
      },
      walletBonusConsumption: { create: vi.fn() },
      $queryRaw: vi.fn(),
    };
    const { spendWalletPaise } = await import('@/lib/wallet');
    const result = await spendWalletPaise(tx as never, { customerId: 'customer-1', amountPaise: 2000, referenceId: 'order:1', reason: 'Order payment' });
    expect(result.allocations).toEqual([{ grantId: 'old-grant', consumedPaise: 1500 }, { grantId: 'new-grant', consumedPaise: 500 }]);
    expect(tx.walletBonusConsumption.create).toHaveBeenCalledTimes(2);
  });
});
