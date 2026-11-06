'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, CreditCard, LoaderCircle, Wallet as WalletIcon, AlertCircle } from 'lucide-react';
import { loadRazorpayScript } from '@/lib/razorpayClient';

type WalletData = { balance: number; transactions: Array<{ id: string; type: string; amount: number; status: string; balanceAfter: number; createdAt: string; reason?: string | null }> };
type Offer = { id: string; name: string; description: string; price: number; durationMonths: number; benefits: string[] };

export default function CustomerWalletPage() {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [subscriptions, setSubscriptions] = useState<Array<{ id: string; status: string; startDate: string; expiryDate: string; offer: Offer }>>([]);
  const [amount, setAmount] = useState('500');
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [walletRes, offersRes, subscriptionsRes] = await Promise.all([
        fetch('/api/customer/wallet'),
        fetch('/api/subscription-offers'),
        fetch('/api/customer/subscriptions'),
      ]);
      const [walletData, offersData, subscriptionsData] = await Promise.all([walletRes.json(), offersRes.json(), subscriptionsRes.json()]);
      if (walletData.success) setWallet(walletData.data);
      if (offersData.success) setOffers(offersData.data);
      if (subscriptionsData.success) setSubscriptions(subscriptionsData.data);
      if (!walletData.success && walletRes.status === 401) setMessage({ type: 'error', text: 'Please log in as a customer to use your wallet.' });
    } catch {
      setMessage({ type: 'error', text: 'Unable to load wallet and subscription details.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const beginPayment = async (kind: 'wallet' | 'subscription', value: string) => {
    if (paying) return;
    setPaying(true);
    setMessage(null);
    try {
      const createRes = await fetch(kind === 'wallet' ? '/api/customer/wallet/topup/create' : '/api/customer/subscriptions/purchase/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kind === 'wallet' ? { amount: Number(value) } : { offerId: value }),
      });
      const created = await createRes.json();
      if (!createRes.ok || !created.success) throw new Error(created.message || 'Unable to start payment.');
      await loadRazorpayScript();
      if (typeof (window as unknown as { Razorpay?: unknown }).Razorpay !== 'function') throw new Error('Payment checkout is unavailable.');

      const options = {
        key: created.data.key,
        amount: created.data.amount,
        currency: created.data.currency,
        name: 'Junk It Out',
        description: kind === 'wallet' ? 'Customer wallet top-up' : 'Subscription plan purchase',
        order_id: created.data.gatewayOrderId,
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          const verifyRes = await fetch(kind === 'wallet' ? '/api/customer/wallet/topup/verify' : '/api/customer/subscriptions/purchase/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(kind === 'wallet'
              ? { transactionId: created.data.transactionId, ...response }
              : { paymentId: created.data.paymentId, ...response }),
          });
          const verified = await verifyRes.json();
          if (!verifyRes.ok || !verified.success) throw new Error(verified.message || 'Payment verification failed.');
          setMessage({ type: 'success', text: kind === 'wallet' ? 'Wallet balance updated successfully.' : 'Subscription activated successfully.' });
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

  if (loading) return <div className="customer-page py-20 text-center"><LoaderCircle className="mx-auto h-8 w-8 animate-spin text-emerald-600" /></div>;

  return (
    <div className="customer-page space-y-6">
      <div>
        <p className="customer-eyebrow">Customer benefits</p>
        <h1 className="customer-title mt-2">Wallet & subscriptions</h1>
        <p className="customer-subtitle mt-2">Manage wallet funds and purchase plans securely through Razorpay.</p>
      </div>
      {message && <div className={`flex items-center gap-2 rounded-2xl border p-4 text-xs font-bold ${message.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}><AlertCircle className="h-4 w-4" />{message.text}</div>}

      <section className="grid gap-4 md:grid-cols-[1fr_1.5fr]">
        <div className="rounded-3xl bg-slate-900 p-6 text-white shadow-lg">
          <WalletIcon className="mb-5 h-7 w-7 text-emerald-400" />
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Available balance</p>
          <p className="mt-2 text-4xl font-black">₹{(wallet?.balance || 0).toFixed(2)}</p>
        </div>
        <div className="customer-surface p-6">
          <h2 className="text-sm font-extrabold text-slate-900">Add money to wallet</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {[100, 500, 1000, 2500].map((preset) => <button key={preset} type="button" onClick={() => setAmount(String(preset))} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold hover:border-emerald-400">₹{preset}</button>)}
          </div>
          <div className="mt-3 flex gap-2">
            <input value={amount} onChange={(event) => setAmount(event.target.value)} type="number" min="10" step="0.01" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold" />
            <button type="button" disabled={paying} onClick={() => beginPayment('wallet', amount)} className="whitespace-nowrap rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black text-white disabled:opacity-50"><CreditCard className="mr-1 inline h-4 w-4" />Add money</button>
          </div>
        </div>
      </section>

      <section className="customer-surface p-6">
        <h2 className="text-lg font-extrabold text-slate-900">Subscription plans</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {offers.map((offer) => <article key={offer.id} className="rounded-2xl border border-slate-200 p-4">
            <h3 className="font-black text-slate-900">{offer.name}</h3>
            <p className="mt-1 text-xs text-slate-500">{offer.description}</p>
            <p className="mt-4 text-2xl font-black text-emerald-700">₹{offer.price}<span className="text-xs font-bold text-slate-500"> / {offer.durationMonths} months</span></p>
            <ul className="my-4 space-y-1 text-xs text-slate-600">{offer.benefits.map((benefit) => <li key={benefit}>✓ {benefit}</li>)}</ul>
            <button type="button" disabled={paying} onClick={() => beginPayment('subscription', offer.id)} className="w-full rounded-xl bg-slate-900 py-3 text-xs font-black text-white disabled:opacity-50">Purchase securely</button>
          </article>)}
        </div>
        {offers.length === 0 && <p className="mt-4 text-sm text-slate-500">No active subscription plans are available right now.</p>}
      </section>

      {subscriptions.length > 0 && <section className="customer-surface p-6">
        <h2 className="text-sm font-extrabold text-slate-900">Subscription history</h2>
        <div className="mt-4 space-y-3">{subscriptions.map((subscription) => <div key={subscription.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4 text-xs"><div><p className="font-black text-slate-900">{subscription.offer.name}</p><p className="text-slate-500">{new Date(subscription.startDate).toLocaleDateString('en-IN')} – {new Date(subscription.expiryDate).toLocaleDateString('en-IN')}</p></div><span className="rounded-full bg-emerald-100 px-2.5 py-1 font-black text-emerald-800">{subscription.status}</span></div>)}</div>
      </section>}

      <section className="customer-surface p-6">
        <h2 className="text-sm font-extrabold text-slate-900">Wallet transaction history</h2>
        <div className="mt-4 divide-y divide-slate-100">{wallet?.transactions.map((transaction) => <div key={transaction.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs"><div><p className="font-bold text-slate-800">{transaction.type.replace(/_/g, ' ')}</p><p className="text-slate-500">{new Date(transaction.createdAt).toLocaleString('en-IN')} {transaction.reason ? `• ${transaction.reason}` : ''}</p></div><div className="text-right"><p className={`font-black ${transaction.type === 'MANUAL_DEBIT' ? 'text-rose-700' : 'text-emerald-700'}`}>{transaction.type === 'MANUAL_DEBIT' ? '-' : '+'}₹{transaction.amount.toFixed(2)}</p><p className="text-slate-500">{transaction.status} • ₹{transaction.balanceAfter.toFixed(2)} balance</p></div></div>)}</div>
        {!wallet?.transactions.length && <p className="py-4 text-xs text-slate-500">No wallet transactions yet.</p>}
      </section>
    </div>
  );
}
