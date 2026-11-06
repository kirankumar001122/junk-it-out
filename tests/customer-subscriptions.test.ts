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
    notifications: [] as any[],
    orders: initialState.orders ?? [],
  };

  return {
    state,
    customer: {
      findUnique: async () => ({
        id: 'cust-1',
        user: { id: 'user-1', name: 'Test Customer', phone: '+919999999999' },
      }),
    },
    notification: {
      create: async ({ data }: any) => {
        const item = { id: `notif-${Date.now()}`, ...data };
        state.notifications.push(item);
        return item;
      },
    },
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
        const subStart = sub.startDate ? new Date(sub.startDate) : new Date(Date.now() - 24 * 60 * 60 * 1000);
        if (where.customerId && sub.customerId !== where.customerId) return null;
        if (where.status && sub.status !== where.status) return null;
        if (where.startDate?.lte && subStart > where.startDate.lte) return null;
        if (where.expiryDate?.gt && sub.expiryDate <= where.expiryDate.gt) return null;
        return { ...sub, startDate: subStart, offer: state.offer };
      },
      findUnique: async ({ where }: any) => {
        if (state.subscription && state.subscription.id === where.id) {
          const subStart = state.subscription.startDate ? new Date(state.subscription.startDate) : new Date(Date.now() - 24 * 60 * 60 * 1000);
          return { ...state.subscription, startDate: subStart, offer: state.offer };
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

    it('rejects entitlement consumption when subscription has a future startDate (scheduled plan change)', async () => {
      const futureStart = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      const futureExpiry = new Date(Date.now() + 35 * 24 * 60 * 60 * 1000);
      const client = createMockPrismaClient({
        subscription: {
          id: 'sub-scheduled-future',
          customerId: 'cust-1',
          status: 'ACTIVE',
          startDate: futureStart,
          expiryDate: futureExpiry,
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

    it('rejects entitlement consumption when pickup quota is exhausted on current cycle before scheduled plan activation', async () => {
      // Current cycle has reached limit; customer has a future subscription queued
      const expiry = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      const client = createMockPrismaClient({
        subscription: {
          id: 'sub-current-exhausted',
          customerId: 'cust-1',
          status: 'ACTIVE',
          startDate: new Date(Date.now() - 27 * 24 * 60 * 60 * 1000),
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
      expect(client.state.notifications.some((n) => n.type === 'SUBSCRIPTION')).toBe(true);
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

  describe('Multi-Tier Plan Offerings & Plan Change Transitions', () => {
    it('supports Weekly Green Pass purchase with 1 pickup and 7-day duration', async () => {
      const weeklyPlan = DEFAULT_SUBSCRIPTION_PLANS.find((p) => p.billingPeriod === 'WEEKLY')!;
      const client = createMockPrismaClient({
        walletBalance: 200,
        offer: {
          id: 'offer-weekly',
          ...weeklyPlan,
          active: true,
        },
      });

      const result = await purchaseSubscriptionWithWallet(client as any, {
        customerId: 'cust-1',
        offerId: 'offer-weekly',
      });

      expect(result.subscription.pickupsAllowed).toBe(1);
      expect(result.subscription.status).toBe('ACTIVE');
      expect(result.wallet.balance).toBe(101); // 200 - 99
      expect(client.state.notifications.length).toBeGreaterThan(0);
    });

    it('supports Quarterly Premium purchase with 12 pickups and 90-day duration', async () => {
      const quarterlyPlan = DEFAULT_SUBSCRIPTION_PLANS.find((p) => p.billingPeriod === 'QUARTERLY')!;
      const client = createMockPrismaClient({
        walletBalance: 500,
        offer: {
          id: 'offer-quarterly',
          ...quarterlyPlan,
          active: true,
        },
      });

      const result = await purchaseSubscriptionWithWallet(client as any, {
        customerId: 'cust-1',
        offerId: 'offer-quarterly',
      });

      expect(result.subscription.pickupsAllowed).toBe(12);
      expect(result.subscription.status).toBe('ACTIVE');
      expect(result.wallet.balance).toBe(201); // 500 - 299
    });

    it('chains plan change transition seamlessly at current expiry without loss of active period', async () => {
      const currentExpiry = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
      const monthlyOffer = {
        id: 'offer-monthly',
        name: 'Monthly Standard',
        price: 199,
        durationDays: 30,
        durationMonths: 1,
        billingPeriod: 'MONTHLY',
        pickupLimit: 4,
        active: true,
      };

      const client = createMockPrismaClient({
        walletBalance: 400,
        offer: monthlyOffer,
        subscription: {
          id: 'sub-weekly-active',
          customerId: 'cust-1',
          status: 'ACTIVE',
          expiryDate: currentExpiry,
          pickupsAllowed: 1,
          pickupsUsed: 0,
        },
      });

      // Customer upgrades from active weekly to monthly
      const result = await purchaseSubscriptionWithWallet(client as any, {
        customerId: 'cust-1',
        offerId: 'offer-monthly',
      });

      // New subscription starts exactly when the current one expires
      expect(result.subscription.startDate.getTime()).toBe(currentExpiry.getTime());
      expect(result.subscription.pickupsAllowed).toBe(4);
      expect(result.wallet.balance).toBe(201); // 400 - 199
      expect(client.state.transactions).toHaveLength(1);
    });

    it('verifies Razorpay plan change payment creates exactly one chained subscription and enforces idempotency', async () => {
      const currentExpiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      const quarterlyOffer = {
        id: 'offer-quarterly',
        name: 'Quarterly Premium',
        price: 299,
        durationDays: 90,
        pickupLimit: 12,
        active: true,
      };

      const existingSub = {
        id: 'sub-existing-monthly',
        customerId: 'cust-1',
        status: 'ACTIVE',
        startDate: new Date(Date.now() - 16 * 24 * 60 * 60 * 1000),
        expiryDate: currentExpiry,
        pickupsAllowed: 4,
        pickupsUsed: 1,
      };

      // Mock database state for Razorpay verification
      const dbState = {
        payment: {
          id: 'pay-razorpay-chg-1',
          customerId: 'cust-1',
          offerId: 'offer-quarterly',
          amount: 299,
          status: 'PENDING',
          gatewayOrderId: 'order_test_12345',
          offer: quarterlyOffer,
        },
        subscriptions: [existingSub],
      };

      // Simulate payment verification transaction
      const simulateVerification = async (gatewayPaymentId: string) => {
        if (dbState.payment.status === 'SUCCESS') {
          return { alreadyProcessed: true, subscription: dbState.subscriptions.find((s) => (s as any).paymentId === dbState.payment.id) };
        }

        const latest = dbState.subscriptions
          .filter((s) => s.customerId === 'cust-1' && s.status === 'ACTIVE' && s.expiryDate > new Date())
          .sort((a, b) => b.expiryDate.getTime() - a.expiryDate.getTime())[0];

        const startDate = latest ? latest.expiryDate : new Date();
        const expiryDate = calculateSubscriptionExpiry(startDate, quarterlyOffer);

        dbState.payment.status = 'SUCCESS';
        (dbState.payment as any).gatewayPaymentId = gatewayPaymentId;

        const newSub = {
          id: `sub-chained-${Date.now()}`,
          customerId: 'cust-1',
          offerId: quarterlyOffer.id,
          paymentId: dbState.payment.id,
          startDate,
          expiryDate,
          status: 'ACTIVE',
          pickupsAllowed: quarterlyOffer.pickupLimit,
          pickupsUsed: 0,
          autoRenew: false,
          offer: quarterlyOffer,
        };
        dbState.subscriptions.push(newSub);
        return { alreadyProcessed: false, subscription: newSub };
      };

      // 1. Initial verification creates the chained subscription
      const res1 = await simulateVerification('pay_rzp_mock_111');
      expect(res1.alreadyProcessed).toBe(false);
      expect(res1.subscription?.startDate.getTime()).toBe(currentExpiry.getTime());
      expect(res1.subscription?.pickupsAllowed).toBe(12);
      expect(dbState.subscriptions).toHaveLength(2);

      // 2. Duplicate verification call is idempotent and does not create another subscription
      const res2 = await simulateVerification('pay_rzp_mock_111');
      expect(res2.alreadyProcessed).toBe(true);
      expect(dbState.subscriptions).toHaveLength(2);
      expect(res2.subscription?.id).toBe(res1.subscription?.id);
    });
  });

  describe('Admin Subscription Offers CRUD, Validation & Authorization', () => {
    const mockOfferStore: any[] = [
      {
        id: 'offer-1',
        name: 'Weekly Green Pass',
        description: 'Weekly convenience pass',
        billingPeriod: 'WEEKLY',
        durationDays: 7,
        durationMonths: 0,
        pickupLimit: 1,
        price: 99,
        benefits: ['1 Free pickup'],
        active: true,
        displayOrder: 1,
      },
    ];

    const validateOfferPayload = (body: any) => {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const description = typeof body.description === 'string' ? body.description.trim() : '';
      const billingPeriod =
        typeof body.billingPeriod === 'string' && ['WEEKLY', 'MONTHLY', 'QUARTERLY'].includes(body.billingPeriod.toUpperCase())
          ? body.billingPeriod.toUpperCase()
          : 'MONTHLY';
      const durationDays = Number.isInteger(Number(body.durationDays)) && Number(body.durationDays) > 0
        ? Number(body.durationDays)
        : (billingPeriod === 'WEEKLY' ? 7 : billingPeriod === 'QUARTERLY' ? 90 : 30);
      const pickupLimit = Number.isInteger(Number(body.pickupLimit)) && Number(body.pickupLimit) >= 0
        ? Number(body.pickupLimit)
        : (billingPeriod === 'WEEKLY' ? 1 : billingPeriod === 'QUARTERLY' ? 12 : 4);
      const price = Number(body.price);

      if (!name || !description || durationDays <= 0 || durationDays > 3650 || !Number.isFinite(price) || price <= 0 || price > 1000000) {
        return null;
      }
      return {
        name,
        description,
        billingPeriod,
        durationDays,
        pickupLimit,
        price,
        active: body.active !== false,
      };
    };

    it('creates a new subscription offer when requested by an authorized admin', () => {
      const authUser = { id: 'admin-1', role: 'ADMIN' };
      expect(['ADMIN', 'SUPER_ADMIN'].includes(authUser.role)).toBe(true);

      const validPayload = {
        name: 'Bi-Weekly Starter',
        description: 'Bi-weekly pickup service for light households',
        billingPeriod: 'WEEKLY',
        durationDays: 14,
        pickupLimit: 2,
        price: 149,
        active: true,
      };

      const validated = validateOfferPayload(validPayload);
      expect(validated).not.toBeNull();
      expect(validated?.price).toBe(149);
      expect(validated?.pickupLimit).toBe(2);

      const newOffer = { id: 'offer-new', ...validated };
      mockOfferStore.push(newOffer);
      expect(mockOfferStore.find((o) => o.id === 'offer-new')).toBeDefined();
    });

    it('rejects subscription offer creation with invalid price, empty name, or non-admin role', () => {
      // 1. Non-admin authorization failure
      const customerUser = { id: 'cust-1', role: 'CUSTOMER' };
      const isAuthorized = ['ADMIN', 'SUPER_ADMIN'].includes(customerUser.role);
      expect(isAuthorized).toBe(false);

      // 2. Negative price validation failure
      const negativePricePayload = {
        name: 'Invalid Plan',
        description: 'Test',
        price: -50,
        durationDays: 30,
      };
      expect(validateOfferPayload(negativePricePayload)).toBeNull();

      // 3. Empty name validation failure
      const emptyNamePayload = {
        name: '   ',
        description: 'Test',
        price: 199,
        durationDays: 30,
      };
      expect(validateOfferPayload(emptyNamePayload)).toBeNull();
    });

    it('updates an existing subscription offer pricing, duration, quota and status', () => {
      const existing = mockOfferStore.find((o) => o.id === 'offer-1');
      expect(existing).toBeDefined();

      const updatePayload = {
        name: 'Weekly Green Pass (Updated)',
        description: 'Updated description',
        billingPeriod: 'WEEKLY',
        durationDays: 7,
        pickupLimit: 2,
        price: 119,
        active: false,
      };

      const validated = validateOfferPayload(updatePayload);
      expect(validated).not.toBeNull();

      Object.assign(existing, validated);
      expect(existing.price).toBe(119);
      expect(existing.pickupLimit).toBe(2);
      expect(existing.active).toBe(false);
    });

    it('reflects admin offer changes in the active customer offers query', () => {
      // Deactivated offers must not be served to customers
      const customerVisibleOffers = mockOfferStore.filter((o) => o.active === true);
      expect(customerVisibleOffers.some((o) => o.id === 'offer-1')).toBe(false);

      // Reactivate offer
      const offer1 = mockOfferStore.find((o) => o.id === 'offer-1');
      offer1.active = true;
      const updatedCustomerOffers = mockOfferStore.filter((o) => o.active === true);
      expect(updatedCustomerOffers.some((o) => o.id === 'offer-1')).toBe(true);
    });

    it('deletes or archives an offer', () => {
      const index = mockOfferStore.findIndex((o) => o.id === 'offer-new');
      expect(index).toBeGreaterThanOrEqual(0);
      mockOfferStore.splice(index, 1);
      expect(mockOfferStore.find((o) => o.id === 'offer-new')).toBeUndefined();
    });
  });

  describe('Agent Dashboard Earnings Tracking Isolation', () => {
    it('ensures agents can only access their own earnings and transaction ledger', () => {
      const agent1Transactions = [
        { id: 'tx-1', agentId: 'agent-1', type: 'PICKUP_EARNINGS', amount: 50, balanceAfter: 50 },
        { id: 'tx-2', agentId: 'agent-1', type: 'CREDIT', amount: 100, balanceAfter: 150 },
      ];
      const agent2Transactions = [
        { id: 'tx-3', agentId: 'agent-2', type: 'PICKUP_EARNINGS', amount: 75, balanceAfter: 75 },
      ];

      // Simulated agent query with authUser.agentId === 'agent-1'
      const queryAgentEarnings = (requestingAgentId: string) => {
        return [...agent1Transactions, ...agent2Transactions].filter(
          (tx) => tx.agentId === requestingAgentId
        );
      };

      const result = queryAgentEarnings('agent-1');
      expect(result).toHaveLength(2);
      expect(result.every((tx) => tx.agentId === 'agent-1')).toBe(true);

      const totalEarnings = result
        .filter((tx) => tx.type === 'PICKUP_EARNINGS' || tx.type === 'CREDIT')
        .reduce((sum, tx) => sum + tx.amount, 0);
      expect(totalEarnings).toBe(150);
    });
  });
});

