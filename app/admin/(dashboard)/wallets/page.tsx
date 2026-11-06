'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, LoaderCircle, RefreshCw } from 'lucide-react';

type Wallet = { customerId: string; balance: number; customer: { user: { name: string; phone: string; email?: string | null } } };
type Transaction = { id: string; customerId: string; type: string; amount: number; status: string; reason?: string | null; createdAt: string; admin?: { name: string } | null };

export default function AdminWalletsPage() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState('MANUAL_CREDIT');
  const [reason, setReason] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/wallets?search=${encodeURIComponent(search)}`);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Unable to load wallets.');
      setWallets(data.data.wallets);
      setTransactions(data.data.transactions);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load wallets.');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const adjust = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true); setMessage(null);
    try {
      const response = await fetch('/api/admin/wallets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerId, amount: Number(amount), type, reason }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Adjustment failed.');
      setMessage('Wallet adjustment recorded successfully.');
      setAmount(''); setReason(''); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Adjustment failed.'); }
    finally { setSaving(false); }
  };

  return <div className="space-y-6">
    <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Finance controls</p><h1 className="mt-1 text-2xl font-black text-slate-900">Wallet management</h1><p className="mt-1 text-xs text-slate-500">Review customer balances and record immutable, reason-backed adjustments.</p></header>
    {message && <div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-800"><AlertCircle className="h-4 w-4" />{message}</div>}
    <section className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
      <form onSubmit={adjust} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-extrabold text-slate-900">Manual adjustment</h2>
        <p className="mt-1 text-xs text-slate-500">Every adjustment requires a reason and is permanently logged.</p>
        <div className="mt-4 space-y-3">
          <select required value={customerId} onChange={(event) => setCustomerId(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold"><option value="">Select customer</option>{wallets.map((wallet) => <option key={wallet.customerId} value={wallet.customerId}>{wallet.customer.user.name} • {wallet.customer.user.phone}</option>)}</select>
          <select value={type} onChange={(event) => setType(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold"><option value="MANUAL_CREDIT">Credit wallet</option><option value="MANUAL_DEBIT">Debit wallet</option></select>
          <input required min="0.01" step="0.01" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount (₹)" className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold" />
          <textarea required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason for adjustment" className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs" rows={3} />
          <button disabled={saving} className="w-full rounded-xl bg-slate-900 py-3 text-xs font-black text-white disabled:opacity-50">{saving ? 'Saving...' : 'Record adjustment'}</button>
        </div>
      </form>
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between gap-3"><h2 className="text-sm font-extrabold text-slate-900">Customer wallets</h2><button onClick={load} className="rounded-xl bg-slate-100 p-2"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button></div><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') load(); }} placeholder="Search name, phone, or email" className="mt-4 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs" /><div className="mt-4 space-y-2">{wallets.map((wallet) => <button type="button" onClick={() => setCustomerId(wallet.customerId)} key={wallet.customerId} className={`flex w-full items-center justify-between rounded-xl p-3 text-left text-xs ${customerId === wallet.customerId ? 'bg-emerald-50 ring-2 ring-emerald-300' : 'bg-slate-50'}`}><span><b className="block text-slate-900">{wallet.customer.user.name}</b><span className="text-slate-500">{wallet.customer.user.phone}</span></span><b className="text-emerald-700">₹{wallet.balance.toFixed(2)}</b></button>)}{!wallets.length && <p className="py-4 text-xs text-slate-500">No wallets found.</p>}</div></div>
    </section>
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-sm font-extrabold text-slate-900">Recent wallet transactions</h2><div className="mt-4 divide-y divide-slate-100">{transactions.map((transaction) => <div key={transaction.id} className="flex flex-wrap justify-between gap-3 py-3 text-xs"><span><b className="block">{transaction.type.replace(/_/g, ' ')}</b><span className="text-slate-500">{transaction.reason || 'No reason'} • {new Date(transaction.createdAt).toLocaleString('en-IN')}</span></span><b className={transaction.type === 'MANUAL_DEBIT' ? 'text-rose-700' : 'text-emerald-700'}>₹{transaction.amount.toFixed(2)} ({transaction.status})</b></div>)}</div></section>
  </div>;
}
