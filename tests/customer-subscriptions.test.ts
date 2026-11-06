import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SUBSCRIPTION_PLANS,
  calculateSubscriptionExpiry,
  purchaseSubscriptionWithWallet,
  consumeSubscriptionPickupEntitlement,
  cancelCustomerSubscription,
  BILLING_PERIODS,
} from '@/lib/subscriptions';
import { roundCurrency } from '@/lib/wallet';

function createMockPrismaClient(initialState: {
  walletBalance?: number;
  offer?: any;
  subscription?: any;
  orders?: any[];
}) {
  const state = {
    wallet: { id: 'wallet-1', customerId: 'cust-1', balance: initialState.walletBalance ?? 500 },
    offer: initialState.offer ?? {
      id: 'offer-monthly',
      name: 'Monthly Standard',
      price: 199,
      durationDays: 30,
      durationMonths: 1,
      billingPeriod: 'MONTHLY',
      pickupLimit: 4,
      active: true,
    },
    subscription: initialState.subscription ?? null,
    payments: [] as any[],
    transactions: [] as any[],
    orders: initialState.orders ?? [],
  };

  return {
    state,
    customerWallet: {
      upsert: async () => state.wallet,
      findUnique: async () => state.wallet,
      update: async ({ data }: { data: { balance: number } }) => {
        state.wallet = { ...state.wallet, balance: data.balance };
        return state.wallet;
      },
    },
    walletTransaction: {
      create: async ({ data }: { data: any }) => {
        const item = { id: `wtx-${Date.now()}`, ...data };
        state.transactions.push(item);
        return item;
      },
    },
    subscriptionOffer: {
      findFirst: async ({ where }: any) => {
        if (state.offer && state.offer.id === where.id && (!where.active || state.offer.active)) {
          return state.offer;
        }
        return null;
      },
    },
    subscriptionPayment: {
      create: async ({ data }: { data: any }) => {
        const item = { id: `pay-${Date.now()}`, ...data };
        state.payments.push(item);
        return item;
      },
      update: async ({ where, data }: any) => {
        const item = state.payments.find((p) => p.id === where.id);
        if (item) Object.assign(item, data);
        return item;
      },
    },
    customerSubscription: {
      create: async ({ data }: { data: any }) => {
        const item = { id: `sub-${Date.now()}`, ...data, offer: state.offer };
        state.subscription = item;
        return item;
      },
      findFirst: async ({ where }: any) => {
        const sub = state.subscription;
        if (!sub) return null;
        if (where.customerId && sub.customerId !== where.customerId) return null;
        if (where.status && sub.status !== where.status) return null;
        if (where.expiryDate?.gt && sub.expiryDate <= where.expiryDate.gt) return null;
        return { ...sub, offer: state.offer };
      },
      findUnique: async ({ where }: any) => {
        if (state.subscription && state.subscription.id === where.id) {
          return { ...state.subscription, offer: state.offer };
        }
        return null;
      },
      update: async ({ where, data }: any) => {
        if (state.subscription && state.subscription.id === where.id) {
          if (data.pickupsUsed?.increment) {
            state.subscription.pickupsUsed = (state.subscription.pickupsUsed || 0) + data.pickupsUsed.increment;
            delete data.pickupsUsed;
          }
          Object.assign(state.subscription, data);
          return { ...state.subscription, offer: state.offer };
        }
        throw new Error('Not found');
      },
    },
    order: {
      update: async ({ where, data }: any) => {
        const order = state.orders.find((o) => o.id === where.id);
        if (order) Object.assign(order, data);
        return order;
      },
    },
    $queryRaw: async () => [],
  };
}

describe('Customer Subscriptions Domain Logic (Task 01)', () => {
  describe('Default Plans Specifications', () => {
    it('defines Weekly, Monthly, and Quarterly default plans with correct limits and pricing', () => {
      expect(DEFAULT_SUBSCRIPTION_PLANS).toHaveLength(3);

      const weekly = DEFAULT_SUBSCRIPTION_PLANS.find((p) => p.billingPeriod === BILLING_PERIODS.WEEKLY);
      expect(weekly).toBeDefined();
      expect(weekly?.price).toBe(99);
      expect(weekly?.durationDays).toBe(7);
      expect(weekly?.pickupLimit).toBe(1);

      const monthly = DEFAULT_SUBSCRIPTION_PLANS.find((p) => p.billingPeriod === BILLING_PERIODS.MONTHLY);
      expect(monthly).toBeDefined();
      expect(monthly?.price).toBe(199);
      expect(monthly?.durationDays).toBe(30);
      expect(monthly?.pickupLimit).toBe(4);

      const quarterly = DEFAULT_SUBSCRIPTION_PLANS.find((p) => p.billingPeriod === BILLING_PERIODS.QUARTERLY);
      expect(quarterly).toBeDefined();
      expect(quarterly?.price).toBe(299);
      expect(quarterly?.durationDays).toBe(90);
      expect(quarterly?.pickupLimit).toBe(12);
    });

    it('calculates exact expiry date from durationDays', () => {
      const base = new Date('2026-06-01T10:00:00Z');

      const weeklyExpiry = calculateSubscriptionExpiry(base, { durationDays: 7, billingPeriod: 'WEEKLY' });
      expect(weeklyExpiry.toISOString()).toBe(new Date('2026-06-08T10:00:00Z').toISOString());

      const monthlyExpiry = calculateSubscriptionExpiry(base, { durationDays: 30, billingPeriod: 'MONTHLY' });
      expect(monthlyExpiry.toISOString()).toBe(new Date('2026-07-01T10:00:00Z').toISOString());

      const quarterlyExpiry = calculateSubscriptionExpiry(base, { durationDays: 90, billingPeriod: 'QUARTERLY' });
      expect(quarterlyExpiry.toISOString()).toBe(new Date('2026-08-30T10:00:00Z').toISOString());
    });
  });

  describe('Wallet-Funded Subscription Checkout', () => {
    it('successfully purchases subscription with wallet balance and records transaction', async () => {
      const client = createMockPrismaClient({ walletBalance: 500 });
      const result = await purchaseSubscriptionWithWallet(client as any, {
        customerId: 'cust-1',
        offerId: 'offer-monthly',
      });

      expect(result.subscription).toBeDefined();
      expect(result.subscription.status).toBe('ACTIVE');
      expect(result.subscription.pickupsAllowed).toBe(4);
      expect(result.subscription.pickupsUsed).toBe(0);
      expect(result.wallet.balance).toBe(roundCurrency(500 - 199));
      expect(client.state.transactions).toHaveLength(1);
      expect(client.state.transactions[0].type).toBe('WALLET_DEBIT');
      expect(client.state.transactions[0].amount).toBe(199);
      expect(client.state.payments[0].paymentMethod).toBe('WALLET');
    });

    it('rejects wallet subscription purchase when balance is insufficient', async () => {
      const client = createMockPrismaClient({ walletBalance: 50 });

      await expect(
        purchaseSubscriptionWithWallet(client as any, {
          customerId: 'cust-1',
          offerId: 'offer-monthly',
        }),
      ).rejects.toThrow('Insufficient customer wallet balance');
    });
  });

  describe('Pickup Entitlement Consumption & Quota Enforcement', () => {
    it('consumes 1 pickup from an active subscription and updates remaining count', async () => {
      const expiry = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
      const client = createMockPrismaClient({
        subscription: {
          id: 'sub-active',
          customerId: 'cust-1',
          status: 'ACTIVE',
          expiryDate: expiry,
          pickupsAllowed: 4,
          pickupsUsed: 1,
        },
      });

      const result = await consumeSubscriptionPickupEntitlement(client as any, {
        customerId: 'cust-1',
      });

      expect(result.eligible).toBe(true);
      expect(result.subscription.pickupsUsed).toBe(2);
      expect(result.remainingPickups).toBe(2);
    });

    it('rejects entitlement consumption when pickup allowance is exhausted (LIMIT_EXCEEDED)', async () => {
      const expiry = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
      const client = createMockPrismaClient({
        subscription: {
          id: 'sub-active',
          customerId: 'cust-1',
          status: 'ACTIVE',
          expiryDate: expiry,
          pickupsAllowed: 4,
          pickupsUsed: 4,
        },
      });

      const result = await consumeSubscriptionPickupEntitlement(client as any, {
        customerId: 'cust-1',
      });

      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('LIMIT_EXCEEDED');
      expect(result.remainingPickups).toBe(0);
    });

    it('rejects entitlement consumption when subscription has expired', async () => {
      const pastExpiry = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const client = createMockPrismaClient({
        subscription: {
          id: 'sub-expired',
          customerId: 'cust-1',
          status: 'ACTIVE',
          expiryDate: pastExpiry,
          pickupsAllowed: 4,
          pickupsUsed: 0,
        },
      });

      const result = await consumeSubscriptionPickupEntitlement(client as any, {
        customerId: 'cust-1',
      });

      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('NO_ACTIVE_SUBSCRIPTION');
    });
  });

  describe('Subscription Cancellation', () => {
    it('cancels an active subscription safely with cancellation timestamp and reason', async () => {
      const client = createMockPrismaClient({
        subscription: {
          id: 'sub-to-cancel',
          customerId: 'cust-1',
          status: 'ACTIVE',
          expiryDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
          pickupsAllowed: 4,
          pickupsUsed: 1,
        },
      });

      const cancelled = await cancelCustomerSubscription(client as any, {
        subscriptionId: 'sub-to-cancel',
        customerId: 'cust-1',
        reason: 'Customer relocation',
      });

      expect(cancelled.status).toBe('CANCELLED');
      expect(cancelled.cancellationReason).toBe('Customer relocation');
      expect(cancelled.cancelledAt).toBeInstanceOf(Date);
    });

    it('rejects cancellation attempt by unauthorized customer', async () => {
      const client = createMockPrismaClient({
        subscription: {
          id: 'sub-owned-by-cust-1',
          customerId: 'cust-1',
          status: 'ACTIVE',
        },
      });

      await expect(
        cancelCustomerSubscription(client as any, {
          subscriptionId: 'sub-owned-by-cust-1',
          customerId: 'cust-different',
        }),
      ).rejects.toThrow('Unauthorized to cancel this subscription');
    });
  });
});
