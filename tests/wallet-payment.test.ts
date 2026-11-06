import { describe, expect, it } from 'vitest';
import { applyWalletAdjustment, roundCurrency } from '@/lib/wallet';

function createTransactionClient(initialBalance: number) {
  const state = {
    wallet: { id: 'wallet-1', balance: initialBalance, balancePaise: Math.round(initialBalance * 100) },
    transaction: null as Record<string, unknown> | null,
  };
  return {
    state,
    customerWallet: {
      upsert: async () => state.wallet,
      findUnique: async () => state.wallet,
      update: async ({ data }: { data: { balance: number; balancePaise?: number } }) => {
        state.wallet = { ...state.wallet, balance: data.balance };
        return state.wallet;
      },
    },
    walletTransaction: {
      findFirst: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.transaction = data;
        return data;
      },
    },
    walletBonusGrant: {
      findMany: async () => [],
      findUnique: async () => null,
      update: async () => null,
    },
    walletBonusConsumption: { create: async () => null },
    $queryRaw: async () => [],
  };
}

describe('wallet payment accounting', () => {
  it('rounds monetary values to paise precision', () => {
    expect(roundCurrency(0.1 + 0.2)).toBe(0.3);
  });

  it('applies a rounded credit atomically', async () => {
    const tx = createTransactionClient(10.1);
    const result = await applyWalletAdjustment(tx as never, {
      customerId: 'customer-1',
      amount: 0.2,
      type: 'MANUAL_CREDIT',
      adminId: 'admin-1',
      reason: 'Test credit',
    });

    expect(result.wallet.balance).toBe(10.3);
    expect(result.transaction.amount).toBe(0.2);
    expect(result.transaction.balanceAfter).toBe(10.3);
  });

  it('rejects a debit that would make the balance negative', async () => {
    const tx = createTransactionClient(5);

    await expect(
      applyWalletAdjustment(tx as never, {
        customerId: 'customer-1',
        amount: 5.01,
        type: 'MANUAL_DEBIT',
        adminId: 'admin-1',
        reason: 'Test debit',
      }),
    ).rejects.toThrow('Wallet balance cannot become negative.');
  });
});
