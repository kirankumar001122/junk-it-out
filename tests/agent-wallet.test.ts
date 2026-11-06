import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  applyAgentWalletAdjustment,
  creditAgentPickupEarnings,
  roundCurrency,
  agentWalletTransactionTypes,
} from '@/lib/agentWallet';
import { applyWalletAdjustment } from '@/lib/wallet';
import { GET as getAgentWallet } from '@/app/api/agent/wallet/route';
import { GET as getAdminAgentWallets, POST as postAdminAgentWallet } from '@/app/api/admin/wallets/agent/route';
import { GET as getAdminSingleAgentWallet } from '@/app/api/admin/wallets/agent/[agentId]/route';
import { POST as adjustAdminAgentWallet } from '@/app/api/admin/wallets/agent/[agentId]/adjust/route';
import { signToken } from '@/lib/auth/jwt';
import { db } from '@/lib/db';

process.env.JWT_SECRET = 'test-agent-wallet-secret-key-2026';

function createMockTx(initialBalance: number = 0) {
  const state = {
    wallet: { id: 'wallet-agent-1', agentId: 'agent-1', balance: initialBalance },
    transactions: [] as Array<Record<string, unknown>>,
    notifications: [] as Array<Record<string, unknown>>,
  };

  return {
    state,
    agent: {
      findUnique: async () => ({
        id: 'agent-1',
        user: { id: 'user-agent-1', name: 'Field Agent', phone: '+919876543210' },
      }),
    },
    notification: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.notifications.push(data);
        return data;
      },
    },
    agentWallet: {
      upsert: async () => state.wallet,
      findUnique: async () => state.wallet,
      update: async ({ data }: { data: { balance: number } }) => {
        state.wallet = { ...state.wallet, balance: data.balance };
        return state.wallet;
      },
    },
    agentWalletTransaction: {
      findUnique: async ({ where }: { where: { referenceId?: string } }) => {
        if (!where.referenceId) return null;
        return state.transactions.find((t) => t.referenceId === where.referenceId) || null;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.transactions.push(data);
        return data;
      },
    },
    $queryRaw: async () => [],
  };
}

describe('Agent Wallet Domain Service', () => {
  it('rounds monetary values to paise precision', () => {
    expect(roundCurrency(0.1 + 0.2)).toBe(0.3);
    expect(roundCurrency(150.456)).toBe(150.46);
    expect(roundCurrency(50)).toBe(50.0);
  });

  it('applies a CREDIT adjustment atomically with correct balance and ledger record', async () => {
    const tx = createMockTx(50.0);
    const result = await applyAgentWalletAdjustment(tx as never, {
      agentId: 'agent-1',
      amount: 25.5,
      type: agentWalletTransactionTypes.credit,
      direction: 'CREDIT',
      reason: 'Trip bonus incentive',
      referenceId: 'ref-bonus-1',
    });

    expect(result.wallet.balance).toBe(75.5);
    expect(result.transaction.amount).toBe(25.5);
    expect(result.transaction.balanceAfter).toBe(75.5);
    expect(result.transaction.type).toBe('CREDIT');
    expect(result.transaction.referenceId).toBe('ref-bonus-1');
    expect(result.transaction.status).toBe('SUCCESS');
    expect(tx.state.transactions).toHaveLength(1);
    expect(tx.state.notifications).toHaveLength(1);
    expect(tx.state.notifications[0].type).toBe('AGENT_WALLET_TRANSACTION');
  });

  it('strictly reconciles mathematical formula: previousBalance + credits - debits === newBalance', async () => {
    const tx = createMockTx(100.0);
    // Credit 50
    const credResult = await applyAgentWalletAdjustment(tx as never, {
      agentId: 'agent-1',
      amount: 50.0,
      type: agentWalletTransactionTypes.credit,
      direction: 'CREDIT',
      reason: 'Incentive bonus',
      referenceId: 'ref-rec-cred',
    });
    expect(credResult.wallet.balance).toBe(150.0);

    // Debit 30
    const debResult = await applyAgentWalletAdjustment(tx as never, {
      agentId: 'agent-1',
      amount: 30.0,
      type: agentWalletTransactionTypes.debit,
      direction: 'DEBIT',
      reason: 'Fuel advance recovery',
      referenceId: 'ref-rec-deb',
    });
    expect(debResult.wallet.balance).toBe(120.0);

    // Verify mathematical reconciliation
    const previous = 100.0;
    const credits = 50.0;
    const debits = 30.0;
    expect(previous + credits - debits).toBe(debResult.wallet.balance);
    expect(debResult.transaction.balanceAfter).toBe(debResult.wallet.balance);
  });

  it('applies a DEBIT adjustment and decrements the balance', async () => {
    const tx = createMockTx(100.0);
    const result = await applyAgentWalletAdjustment(tx as never, {
      agentId: 'agent-1',
      amount: 40.0,
      type: agentWalletTransactionTypes.debit,
      direction: 'DEBIT',
      reason: 'Cash payout withdrawal',
      referenceId: 'ref-debit-1',
    });

    expect(result.wallet.balance).toBe(60.0);
    expect(result.transaction.amount).toBe(40.0);
    expect(result.transaction.balanceAfter).toBe(60.0);
    expect(result.transaction.type).toBe('DEBIT');
  });

  it('applies a REFUND adjustment and increments the balance', async () => {
    const tx = createMockTx(60.0);
    const result = await applyAgentWalletAdjustment(tx as never, {
      agentId: 'agent-1',
      amount: 15.0,
      type: agentWalletTransactionTypes.refund,
      direction: 'CREDIT',
      reason: 'Refund for toll expense',
    });

    expect(result.wallet.balance).toBe(75.0);
    expect(result.transaction.amount).toBe(15.0);
    expect(result.transaction.balanceAfter).toBe(75.0);
    expect(result.transaction.type).toBe('REFUND');
  });

  it('rejects a debit that would make the balance negative', async () => {
    const tx = createMockTx(30.0);

    await expect(
      applyAgentWalletAdjustment(tx as never, {
        agentId: 'agent-1',
        amount: 30.01,
        type: agentWalletTransactionTypes.debit,
        direction: 'DEBIT',
        reason: 'Over-withdrawal attempt',
      }),
    ).rejects.toThrow('Agent wallet balance cannot become negative.');

    expect(tx.state.wallet.balance).toBe(30.0);
    expect(tx.state.transactions).toHaveLength(0);
  });

  it('rejects zero or negative adjustment amounts', async () => {
    const tx = createMockTx(50.0);

    await expect(
      applyAgentWalletAdjustment(tx as never, {
        agentId: 'agent-1',
        amount: 0,
        type: agentWalletTransactionTypes.credit,
        reason: 'Zero amount',
      }),
    ).rejects.toThrow('Agent wallet adjustment amount must be greater than zero.');

    await expect(
      applyAgentWalletAdjustment(tx as never, {
        agentId: 'agent-1',
        amount: -10,
        type: agentWalletTransactionTypes.credit,
        reason: 'Negative amount',
      }),
    ).rejects.toThrow('Agent wallet adjustment amount must be greater than zero.');
  });

  it('requires a mandatory non-empty reason for all adjustments', async () => {
    const tx = createMockTx(50.0);

    await expect(
      applyAgentWalletAdjustment(tx as never, {
        agentId: 'agent-1',
        amount: 10,
        type: agentWalletTransactionTypes.credit,
        reason: '   ',
      }),
    ).rejects.toThrow('A reason is mandatory for agent wallet adjustments.');
  });

  it('prevents double-crediting via idempotency when duplicate referenceId is passed', async () => {
    const tx = createMockTx(100.0);

    const first = await applyAgentWalletAdjustment(tx as never, {
      agentId: 'agent-1',
      amount: 50.0,
      type: agentWalletTransactionTypes.credit,
      reason: 'Unique credit',
      referenceId: 'order-payout-999',
    });
    expect(first.wallet.balance).toBe(150.0);

    // Replay with identical referenceId
    const second = await applyAgentWalletAdjustment(tx as never, {
      agentId: 'agent-1',
      amount: 50.0,
      type: agentWalletTransactionTypes.credit,
      reason: 'Unique credit retry',
      referenceId: 'order-payout-999',
    });

    expect(second.wallet.balance).toBe(150.0);
    expect(tx.state.transactions).toHaveLength(1); // No second record created
  });

  it('creditAgentPickupEarnings gracefully handles unconfigured commission and returns null', async () => {
    const tx = createMockTx(100.0);
    const result = await creditAgentPickupEarnings(tx as never, {
      agentId: 'agent-1',
      orderId: 'order-123',
      orderNumber: 'JIO-123',
      amount: 0, // Commission rate unconfigured
    });

    expect(result).toBeNull();
    expect(tx.state.wallet.balance).toBe(100.0);
  });

  it('creditAgentPickupEarnings credits configured earnings linked to order', async () => {
    const tx = createMockTx(100.0);
    const result = await creditAgentPickupEarnings(tx as never, {
      agentId: 'agent-1',
      orderId: 'order-123',
      orderNumber: 'JIO-123',
      amount: 75.0,
    });

    expect(result).not.toBeNull();
    expect(result!.wallet.balance).toBe(175.0);
    expect(result!.transaction.type).toBe('PICKUP_EARNINGS');
    expect(result!.transaction.orderId).toBe('order-123');
    expect(result!.transaction.referenceId).toBe('agent-earning-order-123');
  });
});

describe('Customer Wallet Regression Compatibility', () => {
  it('preserves existing CustomerWallet functionality without interference', async () => {
    const custState = {
      wallet: { id: 'cust-w-1', customerId: 'cust-1', balance: 200.0 },
      tx: null as Record<string, unknown> | null,
    };
    const tx = {
      customerWallet: {
        upsert: async () => custState.wallet,
        findUnique: async () => custState.wallet,
        update: async ({ data }: { data: { balance: number } }) => {
          custState.wallet.balance = data.balance;
          return custState.wallet;
        },
      },
      walletTransaction: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          custState.tx = data;
          return data;
        },
      },
      $queryRaw: async () => [],
    };

    const result = await applyWalletAdjustment(tx as never, {
      customerId: 'cust-1',
      amount: 50.0,
      type: 'MANUAL_CREDIT',
      adminId: 'admin-1',
      reason: 'Customer goodwill credit',
    });

    expect(result.wallet.balance).toBe(250.0);
    expect(result.transaction.amount).toBe(50.0);
    expect(result.transaction.type).toBe('MANUAL_CREDIT');
  });
});

describe('Agent Wallet API Authentication & RBAC Authorization', () => {
  const database = db as any;

  function mockDbForAgentApi() {
    database.user = {
      findUnique: async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        name: 'Agent Test User',
        phone: '+919876543210',
        role: 'AGENT',
        tokenVersion: 1,
      }),
    };
    database.agent = {
      findUnique: async () => ({ id: 'agent-actual-1', tokenVersion: 1 }),
    };
    database.agentWallet = {
      upsert: async () => ({
        id: 'wallet-1',
        agentId: 'agent-actual-1',
        balance: 350.0,
        updatedAt: new Date('2026-11-06T10:00:00Z'),
      }),
      findMany: async () => [
        {
          id: 'wallet-1',
          agentId: 'agent-actual-1',
          balance: 350.0,
          updatedAt: new Date(),
          agent: { vehicleNumber: 'KA-05-1234', vehicleType: 'Auto', user: { name: 'Agent', phone: '987' } },
        },
      ],
      findUnique: async () => ({ id: 'wallet-1', agentId: 'agent-actual-1', balance: 350.0 }),
    };
    database.agentWalletTransaction = {
      findMany: async () => [
        {
          id: 'tx-1',
          walletId: 'wallet-1',
          agentId: 'agent-actual-1',
          type: 'CREDIT',
          amount: 100.0,
          balanceAfter: 350.0,
          status: 'SUCCESS',
          referenceId: 'ref-1',
          orderId: 'order-1',
          order: { id: 'order-1', orderNumber: 'JIO-101' },
          reason: 'Initial credit',
          createdAt: new Date('2026-11-06T09:00:00Z'),
        },
      ],
      findUnique: async () => null,
      create: async ({ data }: { data: any }) => data,
    };
  }

  it('GET /api/agent/wallet rejects unauthenticated request with 401', async () => {
    const req = new NextRequest('http://localhost:3000/api/agent/wallet', {
      method: 'GET',
    });
    const res = await getAgentWallet(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it('GET /api/agent/wallet rejects CUSTOMER role access with 401', async () => {
    database.user = {
      findUnique: async () => ({ id: 'user-cust-1', role: 'CUSTOMER', tokenVersion: 1 }),
    };
    const customerToken = signToken({
      userId: 'user-cust-1',
      phone: '+919876543210',
      name: 'Customer',
      role: 'CUSTOMER',
      customerId: 'cust-1',
      agentId: null,
      adminId: null,
      tokenVersion: 1,
    });

    const req = new NextRequest('http://localhost:3000/api/agent/wallet', {
      method: 'GET',
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    const res = await getAgentWallet(req);
    expect(res.status).toBe(401);
  });

  it('GET /api/agent/wallet derives agentId from authenticated session (IDOR protection)', async () => {
    mockDbForAgentApi();
    const agentToken = signToken({
      userId: 'user-agent-1',
      phone: '+919876543210',
      name: 'Agent Test',
      role: 'AGENT',
      customerId: null,
      agentId: 'agent-actual-1',
      adminId: null,
      tokenVersion: 1,
    });

    const req = new NextRequest('http://localhost:3000/api/agent/wallet', {
      method: 'GET',
      headers: { Authorization: `Bearer ${agentToken}` },
    });
    const res = await getAgentWallet(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.wallet.agentId).toBe('agent-actual-1');
    expect(json.data.wallet.balance).toBe(350.0);
    expect(json.data.transactions).toHaveLength(1);
    expect(json.data.transactions[0].orderNumber).toBe('JIO-101');
  });

  it('Admin API rejects non-admin callers with 403', async () => {
    database.user = {
      findUnique: async () => ({ id: 'user-agent-1', role: 'AGENT', tokenVersion: 1 }),
    };
    const agentToken = signToken({
      userId: 'user-agent-1',
      phone: '+919876543210',
      name: 'Agent Test',
      role: 'AGENT',
      customerId: null,
      agentId: 'agent-actual-1',
      adminId: null,
      tokenVersion: 1,
    });

    const req = new NextRequest('http://localhost:3000/api/admin/wallets/agent', {
      method: 'GET',
      headers: { Authorization: `Bearer ${agentToken}` },
    });
    const res = await getAdminAgentWallets(req);
    expect(res.status).toBe(403);
  });

  it('Admin API allows ADMIN access and records adjustment with mandatory reason', async () => {
    database.user = {
      findUnique: async () => ({ id: 'user-admin-1', role: 'ADMIN', tokenVersion: 1, name: 'Operations Admin' }),
    };
    database.agent = {
      findUnique: async () => ({ id: 'agent-target-1', tokenVersion: 1 }),
    };
    database.agentWallet = {
      upsert: async () => ({ id: 'w-target-1', agentId: 'agent-target-1', balance: 100.0 }),
      findUnique: async () => ({ id: 'w-target-1', agentId: 'agent-target-1', balance: 100.0 }),
      update: async ({ data }: any) => ({ id: 'w-target-1', agentId: 'agent-target-1', balance: data.balance }),
    };
    database.agentWalletTransaction = {
      findUnique: async () => null,
      create: async ({ data }: any) => ({ id: 'tx-adj-1', ...data }),
    };
    database.$queryRaw = async () => [];
    database.$transaction = async (cb: any) => cb(database);

    const adminToken = signToken({
      userId: 'user-admin-1',
      phone: '+919999999999',
      name: 'Admin User',
      role: 'ADMIN',
      customerId: null,
      agentId: null,
      adminId: 'admin-1',
      tokenVersion: 1,
    });

    const req = new NextRequest('http://localhost:3000/api/admin/wallets/agent/agent-target-1/adjust', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: 50.0,
        type: 'MANUAL_CREDIT',
        reason: 'Fuel reimbursement approved by ops',
      }),
    });

    const res = await adjustAdminAgentWallet(req, {
      params: Promise.resolve({ agentId: 'agent-target-1' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.wallet.balance).toBe(150.0);
    expect(json.data.transaction.adminId).toBe('user-admin-1');
    expect(json.data.transaction.reason).toBe('Fuel reimbursement approved by ops');
  });

  it('Admin API rejects adjustment when reason is missing', async () => {
    database.user = {
      findUnique: async () => ({ id: 'user-admin-1', role: 'ADMIN', tokenVersion: 1 }),
    };
    const adminToken = signToken({
      userId: 'user-admin-1',
      phone: '+919999999999',
      name: 'Admin User',
      role: 'ADMIN',
      customerId: null,
      agentId: null,
      adminId: 'admin-1',
      tokenVersion: 1,
    });

    const req = new NextRequest('http://localhost:3000/api/admin/wallets/agent/agent-target-1/adjust', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: 50.0,
        type: 'MANUAL_CREDIT',
        reason: '   ', // missing/blank reason
      }),
    });

    const res = await adjustAdminAgentWallet(req, {
      params: Promise.resolve({ agentId: 'agent-target-1' }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
  });
});
