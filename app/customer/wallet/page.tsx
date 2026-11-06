'use client';

import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  LoaderCircle,
  Package,
  RotateCcw,
  Sparkles,
  Wallet as WalletIcon,
  XCircle,
} from 'lucide-react';
import { loadRazorpayScript } from '@/lib/razorpayClient';

type WalletData = {
  balance: number;
  transactions: Array<{
    id: string;
    type: string;
    amount: number;
    status: string;
    balanceAfter: number;
    createdAt: string;
    reason?: string | null;
  }>;
};

type Offer = {
  id: string;
  name: string;
  description: string;
  billingPeriod?: string;
  durationMonths: number;
  durationDays?: number;
  pickupLimit?: number;
  price: number;
  benefits: string[];
};

type CustomerSubscription = {
  id: string;
  status: string;
  computedStatus?: string;
  startDate: string;
  expiryDate: string;
  pickupsAllowed: number;
  pickupsUsed: number;
  remainingPickups: number;
  autoRenew: boolean;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  paymentMethod?: string;
  offer: Offer;
};

export default function CustomerWalletPage() {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [subscriptions, setSubscriptions] = useState<CustomerSubscription[]>([]);
  const [amount, setAmount] = useState('500');
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [walletRes, offersRes, subscriptionsRes] = await Promise.all([
        fetch('/api/customer/wallet'),
        fetch('/api/subscription-offers'),
        fetch('/api/customer/subscriptions'),
      ]);
      const [walletData, offersData, subscriptionsData] = await Promise.all([
        walletRes.json(),
        offersRes.json(),
        subscriptionsRes.json(),
      ]);

      if (walletData.success) setWallet(walletData.data);
      if (offersData.success) setOffers(offersData.data);
      if (subscriptionsData.success) setSubscriptions(subscriptionsData.data);
      if (!walletData.success && walletRes.status === 401) {
        setMessage({ type: 'error', text: 'Please log in as a customer to use your wallet.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Unable to load wallet and subscription details.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const purchaseWithWallet = async (offerId: string) => {
    if (actionInProgress) return;
    setActionInProgress(`wallet-${offerId}`);
    setMessage(null);
    try {
      const res = await fetch('/api/customer/subscriptions/purchase/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offerId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Unable to purchase subscription with wallet balance.');
      }
      setMessage({ type: 'success', text: 'Subscription plan activated successfully using your wallet balance!' });
      await loadData();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Wallet checkout failed.' });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleCancelSubscription = async (subscriptionId: string) => {
    if (!window.confirm('Are you sure you want to cancel this subscription plan? Remaining pickups will be forfeited.')) {
      return;
    }
    setActionInProgress(`cancel-${subscriptionId}`);
    setMessage(null);
    try {
      const res = await fetch(`/api/customer/subscriptions/${subscriptionId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Cancelled by customer from portal.' }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Unable to cancel subscription.');
      }
      setMessage({ type: 'success', text: 'Subscription has been cancelled.' });
      await loadData();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Cancellation failed.' });
    } finally {
      setActionInProgress(null);
    }
  };

  const beginRazorpayPayment = async (kind: 'wallet' | 'subscription', value: string) => {
    if (paying || actionInProgress) return;
    setPaying(true);
    setMessage(null);
    try {
      const createRes = await fetch(
        kind === 'wallet' ? '/api/customer/wallet/topup/create' : '/api/customer/subscriptions/purchase/create',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(kind === 'wallet' ? { amount: Number(value) } : { offerId: value }),
        },
      );
      const created = await createRes.json();
      if (!createRes.ok || !created.success) throw new Error(created.message || 'Unable to start payment.');

      await loadRazorpayScript();
      if (typeof (window as unknown as { Razorpay?: unknown }).Razorpay !== 'function') {
        throw new Error('Payment checkout is unavailable.');
      }

      const options = {
        key: created.data.key,
        amount: created.data.amount,
        currency: created.data.currency,
        name: 'Junk It Out',
        description: kind === 'wallet' ? 'Customer wallet top-up' : 'Subscription plan purchase',
        order_id: created.data.gatewayOrderId,
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          const verifyRes = await fetch(
            kind === 'wallet' ? '/api/customer/wallet/topup/verify' : '/api/customer/subscriptions/purchase/verify',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(
                kind === 'wallet'
                  ? { transactionId: created.data.transactionId, ...response }
                  : { paymentId: created.data.paymentId, ...response },
              ),
            },
          );
          const verified = await verifyRes.json();
          if (!verifyRes.ok || !verified.success) throw new Error(verified.message || 'Payment verification failed.');
          setMessage({
            type: 'success',
            text: kind === 'wallet' ? 'Wallet balance updated successfully.' : 'Subscription activated successfully.',
          });
          await loadData();
        },
        modal: { ondismiss: () => setPaying(false) },
        theme: { color: '#059669' },
      };
      new ((window as unknown as { Razorpay: new (options: unknown) => { open: () => void } }).Razorpay)(options).open();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Payment failed.' });
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <div className="customer-page py-20 text-center">
        <LoaderCircle className="mx-auto h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  const activeSub = subscriptions.find((s) => (s.computedStatus || s.status) === 'ACTIVE');

  return (
    <div className="customer-page space-y-6">
      <div>
        <p className="customer-eyebrow">Customer benefits</p>
        <h1 className="customer-title mt-2">Wallet & Subscriptions</h1>
        <p className="customer-subtitle mt-2">
          Manage prepaid wallet funds, purchase doorstep scrap passes, and enjoy zero pickup fees.
        </p>
      </div>

      {message && (
        <div
          className={`flex items-center gap-2 rounded-2xl border p-4 text-xs font-bold ${
            message.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{message.text}</span>
        </div>
      )}

      {/* Wallet Balance & Topup Section */}
      <section className="grid gap-4 md:grid-cols-[1fr_1.5fr]">
        <div className="rounded-3xl bg-slate-900 p-6 text-white shadow-lg">
          <WalletIcon className="mb-5 h-7 w-7 text-emerald-400" />
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Available balance</p>
          <p className="mt-2 text-4xl font-black">₹{(wallet?.balance || 0).toFixed(2)}</p>
          {activeSub && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-950/80 px-3 py-1.5 text-xs font-bold text-emerald-300 border border-emerald-800/60">
              <Sparkles className="h-3.5 w-3.5" />
              <span>{activeSub.offer.name} Active ({activeSub.remainingPickups} pickups left)</span>
            </div>
          )}
        </div>

        <div className="customer-surface p-6">
          <h2 className="text-sm font-extrabold text-slate-900">Add money to wallet</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {[100, 500, 1000, 2500].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setAmount(String(preset))}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold hover:border-emerald-400 hover:bg-emerald-50"
              >
                ₹{preset}
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              type="number"
              min="10"
              step="0.01"
              placeholder="Enter amount"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold focus:outline-emerald-600"
            />
            <button
              type="button"
              disabled={paying || Number(amount) <= 0}
              onClick={() => beginRazorpayPayment('wallet', amount)}
              className="whitespace-nowrap rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <CreditCard className="mr-1 inline h-4 w-4" />
              Add money
            </button>
          </div>
        </div>
      </section>

      {/* Subscription Plans Section */}
      <section className="customer-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">Subscription Passes</h2>
            <p className="mt-1 text-xs text-slate-500">
              Subscribe to waive doorstep pickup charges and get priority collection slots.
            </p>
          </div>
          <span className="rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-bold text-emerald-800">
            Pay with Wallet or Razorpay
          </span>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {offers.map((offer) => {
            const periodLabel = offer.billingPeriod || (offer.durationMonths === 0 ? 'WEEKLY' : offer.durationMonths === 3 ? 'QUARTERLY' : 'MONTHLY');
            const pickupsCount = offer.pickupLimit || (periodLabel === 'WEEKLY' ? 1 : periodLabel === 'QUARTERLY' ? 12 : 4);
            const canAffordWallet = (wallet?.balance || 0) >= offer.price;

            return (
              <article
                key={offer.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-emerald-500 transition-all"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-700">
                      {periodLabel}
                    </span>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                      {pickupsCount} {pickupsCount === 1 ? 'Pickup' : 'Pickups'}
                    </span>
                  </div>

                  <h3 className="mt-3 text-base font-black text-slate-900">{offer.name}</h3>
                  <p className="mt-1 text-xs text-slate-500 line-clamp-2">{offer.description}</p>

                  <div className="mt-4">
                    <p className="text-3xl font-black text-slate-900">
                      ₹{offer.price}
                      <span className="text-xs font-bold text-slate-500">
                        {' '}
                        / {periodLabel.toLowerCase()}
                      </span>
                    </p>
                  </div>

                  <ul className="my-4 space-y-1.5 text-xs text-slate-600 border-t border-slate-100 pt-3">
                    {offer.benefits.map((benefit) => (
                      <li key={benefit} className="flex items-start gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{benefit}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    disabled={paying || Boolean(actionInProgress) || !canAffordWallet}
                    onClick={() => purchaseWithWallet(offer.id)}
                    className="w-full rounded-xl bg-emerald-600 py-2.5 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {actionInProgress === `wallet-${offer.id}` ? (
                      <LoaderCircle className="mx-auto h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <WalletIcon className="mr-1 inline h-3.5 w-3.5" />
                        Pay with Wallet (₹{offer.price})
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={paying || Boolean(actionInProgress)}
                    onClick={() => beginRazorpayPayment('subscription', offer.id)}
                    className="w-full rounded-xl border border-slate-200 bg-white py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <CreditCard className="mr-1 inline h-3.5 w-3.5" />
                    Pay via Razorpay / UPI
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        {offers.length === 0 && (
          <p className="mt-4 text-sm text-slate-500">No active subscription plans are available right now.</p>
        )}
      </section>

      {/* Active & Past Subscriptions */}
      {subscriptions.length > 0 && (
        <section className="customer-surface p-6">
          <h2 className="text-sm font-extrabold text-slate-900">Your Subscriptions</h2>
          <div className="mt-4 space-y-3">
            {subscriptions.map((subscription) => {
              const status = subscription.computedStatus || subscription.status;
              const isActive = status === 'ACTIVE';

              return (
                <div
                  key={subscription.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-black text-slate-900">{subscription.offer.name}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                          isActive
                            ? 'bg-emerald-100 text-emerald-800'
                            : status === 'CANCELLED'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {status}
                      </span>
                    </div>

                    <p className="text-slate-500 flex items-center gap-1.5">
                      <Calendar className="h-3 w-3" />
                      {new Date(subscription.startDate).toLocaleDateString('en-IN')} –{' '}
                      {new Date(subscription.expiryDate).toLocaleDateString('en-IN')}
                    </p>

                    <p className="font-bold text-emerald-700 flex items-center gap-1.5">
                      <Package className="h-3 w-3" />
                      Pickups: {subscription.pickupsUsed} / {subscription.pickupsAllowed} used ({subscription.remainingPickups} left)
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {isActive && (
                      <button
                        type="button"
                        disabled={Boolean(actionInProgress)}
                        onClick={() => handleCancelSubscription(subscription.id)}
                        className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                      >
                        {actionInProgress === `cancel-${subscription.id}` ? (
                          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          'Cancel Plan'
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Wallet Transaction History */}
      <section className="customer-surface p-6">
        <h2 className="text-sm font-extrabold text-slate-900">Wallet Transaction History</h2>
        <div className="mt-4 divide-y divide-slate-100">
          {wallet?.transactions.map((transaction) => {
            const isDebit = transaction.type.includes('DEBIT');
            return (
              <div key={transaction.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
                <div>
                  <p className="font-bold text-slate-800">{transaction.type.replace(/_/g, ' ')}</p>
                  <p className="text-slate-500">
                    {new Date(transaction.createdAt).toLocaleString('en-IN')}
                    {transaction.reason ? ` • ${transaction.reason}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`font-black ${isDebit ? 'text-rose-700' : 'text-emerald-700'}`}>
                    {isDebit ? '-' : '+'}₹{transaction.amount.toFixed(2)}
                  </p>
                  <p className="text-slate-500">
                    {transaction.status} • ₹{transaction.balanceAfter.toFixed(2)} balance
                  </p>
                </div>
              </div>
            );
          })}
        </div>
        {!wallet?.transactions.length && <p className="py-4 text-xs text-slate-500">No wallet transactions yet.</p>}
      </section>
    </div>
  );
}
