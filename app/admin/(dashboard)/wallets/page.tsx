'use client';

import { useEffect, useState, useCallback } from 'react';
import { AlertCircle, RefreshCw, Users, Truck, Wallet as WalletIcon, ShieldAlert } from 'lucide-react';

type CustomerWallet = {
  customerId: string;
  balance: number;
  customer: { user: { name: string; phone: string; email?: string | null } };
};

type CustomerTransaction = {
  id: string;
  customerId: string;
  type: string;
  amount: number;
  status: string;
  reason?: string | null;
  createdAt: string;
  admin?: { name: string } | null;
};

type AgentWalletItem = {
  id: string;
  agentId: string;
  balance: number;
  agent: {
    vehicleNumber: string;
    vehicleType: string;
    user: { id: string; name: string; phone: string; email?: string | null };
  };
};

type AgentTransaction = {
  id: string;
  agentId: string;
  type: string;
  amount: number;
  status: string;
  reason?: string | null;
  referenceId?: string | null;
  createdAt: string;
  admin?: { name: string } | null;
  agent?: { user: { name: string; phone: string } };
  order?: { orderNumber: string } | null;
};

export default function AdminWalletsPage() {
  const [activeTab, setActiveTab] = useState<'customers' | 'agents'>('customers');

  // Customer Wallet State
  const [customerWallets, setCustomerWallets] = useState<CustomerWallet[]>([]);
  const [customerTransactions, setCustomerTransactions] = useState<CustomerTransaction[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [customerAmount, setCustomerAmount] = useState('');
  const [customerType, setCustomerType] = useState('MANUAL_CREDIT');
  const [customerReason, setCustomerReason] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');

  // Agent Wallet State
  const [agentWallets, setAgentWallets] = useState<AgentWalletItem[]>([]);
  const [agentTransactions, setAgentTransactions] = useState<AgentTransaction[]>([]);
  const [agentId, setAgentId] = useState('');
  const [agentAmount, setAgentAmount] = useState('');
  const [agentType, setAgentType] = useState('MANUAL_CREDIT');
  const [agentReason, setAgentReason] = useState('');
  const [agentSearch, setAgentSearch] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadCustomerWallets = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/wallets?search=${encodeURIComponent(customerSearch)}`);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Unable to load customer wallets.');
      setCustomerWallets(data.data.wallets);
      setCustomerTransactions(data.data.transactions);
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to load customer wallets.' });
    } finally {
      setLoading(false);
    }
  }, [customerSearch]);

  const loadAgentWallets = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/wallets/agent?search=${encodeURIComponent(agentSearch)}`);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Unable to load agent wallets.');
      setAgentWallets(data.data.wallets);
      setAgentTransactions(data.data.transactions);
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to load agent wallets.' });
    } finally {
      setLoading(false);
    }
  }, [agentSearch]);

  useEffect(() => {
    if (activeTab === 'customers') {
      loadCustomerWallets();
    } else {
      loadAgentWallets();
    }
  }, [activeTab, loadCustomerWallets, loadAgentWallets]);

  const adjustCustomer = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/wallets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          amount: Number(customerAmount),
          type: customerType,
          reason: customerReason,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Adjustment failed.');
      setMessage({ type: 'success', text: 'Customer wallet adjustment recorded successfully.' });
      setCustomerAmount('');
      setCustomerReason('');
      await loadCustomerWallets();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Adjustment failed.' });
    } finally {
      setSaving(false);
    }
  };

  const adjustAgent = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/wallets/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          amount: Number(agentAmount),
          type: agentType,
          direction: agentType === 'MANUAL_DEBIT' ? 'DEBIT' : 'CREDIT',
          reason: agentReason,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Agent adjustment failed.');
      setMessage({ type: 'success', text: 'Agent wallet adjustment recorded successfully.' });
      setAgentAmount('');
      setAgentReason('');
      await loadAgentWallets();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Agent adjustment failed.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Finance controls</p>
            <h1 className="mt-1 text-2xl font-black text-slate-900">Wallet Management</h1>
            <p className="mt-1 text-xs text-slate-500">
              Review customer & agent balances and record immutable, reason-backed adjustments with audit trails.
            </p>
          </div>

          {/* Tab Selector */}
          <div className="flex bg-slate-100 p-1 rounded-2xl shrink-0">
            <button
              onClick={() => { setActiveTab('customers'); setMessage(null); }}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all ${
                activeTab === 'customers'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-4 h-4 text-emerald-600" />
              Customer Wallets
            </button>
            <button
              onClick={() => { setActiveTab('agents'); setMessage(null); }}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all ${
                activeTab === 'agents'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Truck className="w-4 h-4 text-emerald-600" />
              Agent Wallets
            </button>
          </div>
        </div>
      </header>

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

      {activeTab === 'customers' ? (
        <>
          <section className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
            <form onSubmit={adjustCustomer} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-extrabold text-slate-900">Customer Manual Adjustment</h2>
              <p className="mt-1 text-xs text-slate-500">Every adjustment requires a reason and is permanently logged.</p>
              <div className="mt-4 space-y-3">
                <select
                  required
                  value={customerId}
                  onChange={(event) => setCustomerId(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold"
                >
                  <option value="">Select customer</option>
                  {customerWallets.map((wallet) => (
                    <option key={wallet.customerId} value={wallet.customerId}>
                      {wallet.customer.user.name} • {wallet.customer.user.phone}
                    </option>
                  ))}
                </select>
                <select
                  value={customerType}
                  onChange={(event) => setCustomerType(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold"
                >
                  <option value="MANUAL_CREDIT">Credit wallet</option>
                  <option value="MANUAL_DEBIT">Debit wallet</option>
                </select>
                <input
                  required
                  min="0.01"
                  step="0.01"
                  type="number"
                  value={customerAmount}
                  onChange={(event) => setCustomerAmount(event.target.value)}
                  placeholder="Amount (₹)"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold"
                />
                <textarea
                  required
                  value={customerReason}
                  onChange={(event) => setCustomerReason(event.target.value)}
                  placeholder="Reason for adjustment"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"
                  rows={3}
                />
                <button
                  disabled={saving}
                  className="w-full rounded-xl bg-slate-900 py-3 text-xs font-black text-white disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Record customer adjustment'}
                </button>
              </div>
            </form>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-extrabold text-slate-900">Customer Wallets</h2>
                <button onClick={loadCustomerWallets} className="rounded-xl bg-slate-100 p-2" title="Refresh">
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
              <input
                value={customerSearch}
                onChange={(event) => setCustomerSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') loadCustomerWallets();
                }}
                placeholder="Search name, phone, or email"
                className="mt-4 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"
              />
              <div className="mt-4 space-y-2 max-h-96 overflow-y-auto">
                {customerWallets.map((wallet) => (
                  <button
                    type="button"
                    onClick={() => setCustomerId(wallet.customerId)}
                    key={wallet.customerId}
                    className={`flex w-full items-center justify-between rounded-xl p-3 text-left text-xs ${
                      customerId === wallet.customerId ? 'bg-emerald-50 ring-2 ring-emerald-300' : 'bg-slate-50'
                    }`}
                  >
                    <span>
                      <b className="block text-slate-900">{wallet.customer.user.name}</b>
                      <span className="text-slate-500">{wallet.customer.user.phone}</span>
                    </span>
                    <b className="text-emerald-700">₹{wallet.balance.toFixed(2)}</b>
                  </button>
                ))}
                {!customerWallets.length && <p className="py-4 text-xs text-slate-500">No customer wallets found.</p>}
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-extrabold text-slate-900">Recent Customer Wallet Transactions</h2>
            <div className="mt-4 divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {customerTransactions.map((transaction) => (
                <div key={transaction.id} className="flex flex-wrap justify-between gap-3 py-3 text-xs">
                  <span>
                    <b className="block">{transaction.type.replace(/_/g, ' ')}</b>
                    <span className="text-slate-500">
                      {transaction.reason || 'No reason'} • {new Date(transaction.createdAt).toLocaleString('en-IN')}
                      {transaction.admin && ` • By Admin: ${transaction.admin.name}`}
                    </span>
                  </span>
                  <b className={transaction.type === 'MANUAL_DEBIT' ? 'text-rose-700' : 'text-emerald-700'}>
                    ₹{transaction.amount.toFixed(2)} ({transaction.status})
                  </b>
                </div>
              ))}
              {!customerTransactions.length && (
                <p className="py-4 text-xs text-slate-500">No customer transactions recorded.</p>
              )}
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
            <form onSubmit={adjustAgent} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-extrabold text-slate-900">Agent Manual Adjustment</h2>
              <p className="mt-1 text-xs text-slate-500">
                Audited agent adjustments require a mandatory reason and are bound to your admin ID.
              </p>
              <div className="mt-4 space-y-3">
                <select
                  required
                  value={agentId}
                  onChange={(event) => setAgentId(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold"
                >
                  <option value="">Select agent</option>
                  {agentWallets.map((w) => (
                    <option key={w.agentId} value={w.agentId}>
                      {w.agent?.user?.name || 'Agent'} ({w.agent?.vehicleNumber}) • {w.agent?.user?.phone}
                    </option>
                  ))}
                </select>
                <select
                  value={agentType}
                  onChange={(event) => setAgentType(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold"
                >
                  <option value="MANUAL_CREDIT">Credit Agent Wallet</option>
                  <option value="MANUAL_DEBIT">Debit Agent Wallet</option>
                  <option value="REFUND">Refund Agent</option>
                </select>
                <input
                  required
                  min="0.01"
                  step="0.01"
                  type="number"
                  value={agentAmount}
                  onChange={(event) => setAgentAmount(event.target.value)}
                  placeholder="Amount (₹)"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold"
                />
                <textarea
                  required
                  value={agentReason}
                  onChange={(event) => setAgentReason(event.target.value)}
                  placeholder="Mandatory reason for agent adjustment (e.g. Fuel reimbursement, commission correction)"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"
                  rows={3}
                />
                <button
                  disabled={saving}
                  className="w-full rounded-xl bg-slate-900 py-3 text-xs font-black text-white disabled:opacity-50"
                >
                  {saving ? 'Recording...' : 'Record agent adjustment'}
                </button>
              </div>
            </form>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-extrabold text-slate-900">Agent Wallets</h2>
                <button onClick={loadAgentWallets} className="rounded-xl bg-slate-100 p-2" title="Refresh">
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
              <input
                value={agentSearch}
                onChange={(event) => setAgentSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') loadAgentWallets();
                }}
                placeholder="Search agent name, phone, or vehicle"
                className="mt-4 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"
              />
              <div className="mt-4 space-y-2 max-h-96 overflow-y-auto">
                {agentWallets.map((w) => (
                  <button
                    type="button"
                    onClick={() => setAgentId(w.agentId)}
                    key={w.id}
                    className={`flex w-full items-center justify-between rounded-xl p-3 text-left text-xs ${
                      agentId === w.agentId ? 'bg-emerald-50 ring-2 ring-emerald-300' : 'bg-slate-50'
                    }`}
                  >
                    <span>
                      <b className="block text-slate-900">{w.agent?.user?.name || 'Agent'}</b>
                      <span className="text-slate-500 font-mono text-[11px]">
                        {w.agent?.vehicleNumber} • {w.agent?.user?.phone}
                      </span>
                    </span>
                    <b className="text-emerald-700">₹{w.balance.toFixed(2)}</b>
                  </button>
                ))}
                {!agentWallets.length && <p className="py-4 text-xs text-slate-500">No agent wallets found.</p>}
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-extrabold text-slate-900">Recent Agent Wallet Transactions</h2>
            <div className="mt-4 divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {agentTransactions.map((tx) => (
                <div key={tx.id} className="flex flex-wrap justify-between gap-3 py-3 text-xs">
                  <span>
                    <div className="flex items-center gap-2">
                      <b className="block">{tx.type.replace(/_/g, ' ')}</b>
                      {tx.order?.orderNumber && (
                        <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded font-mono text-slate-600">
                          #{tx.order.orderNumber}
                        </span>
                      )}
                    </div>
                    <span className="text-slate-500">
                      {tx.agent?.user?.name ? `${tx.agent.user.name} • ` : ''}
                      {tx.reason || 'No reason'} • {new Date(tx.createdAt).toLocaleString('en-IN')}
                      {tx.admin && ` • By Admin: ${tx.admin.name}`}
                    </span>
                    {tx.referenceId && (
                      <span className="block text-[10px] text-slate-400 font-mono">Ref: {tx.referenceId}</span>
                    )}
                  </span>
                  <b className={tx.type === 'MANUAL_DEBIT' || tx.type === 'DEBIT' ? 'text-rose-700' : 'text-emerald-700'}>
                    ₹{tx.amount.toFixed(2)} ({tx.status})
                  </b>
                </div>
              ))}
              {!agentTransactions.length && (
                <p className="py-4 text-xs text-slate-500">No agent transactions recorded.</p>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
