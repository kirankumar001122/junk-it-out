'use client';

import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Filter,
  Package,
  Plus,
  RefreshCw,
  Search,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';

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
  active: boolean;
  displayOrder: number;
};

type CustomerSub = {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  planName: string;
  billingPeriod: string;
  price: number;
  status: string;
  startDate: string;
  expiryDate: string;
  pickupsAllowed: number;
  pickupsUsed: number;
  remainingPickups: number;
  autoRenew: boolean;
  cancelledAt: string | null;
  cancellationReason: string | null;
  paymentMethod: string;
  paymentStatus: string;
  paymentAmount: number;
};

const emptyForm = {
  name: '',
  description: '',
  billingPeriod: 'MONTHLY',
  durationDays: 30,
  durationMonths: 1,
  pickupLimit: 4,
  price: 199,
  benefits: '',
  active: true,
  displayOrder: 0,
};

export default function AdminSubscriptionOffersPage() {
  const [activeTab, setActiveTab] = useState<'offers' | 'subscriptions'>('offers');
  const [offers, setOffers] = useState<Offer[]>([]);
  const [subscriptions, setSubscriptions] = useState<CustomerSub[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  // Subscriptions filter state
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const loadOffers = async () => {
    try {
      const response = await fetch('/api/admin/subscription-offers');
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message);
      setOffers(data.data);
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to load offers.' });
    }
  };

  const loadSubscriptions = async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== 'ALL') params.set('status', statusFilter);
      if (searchTerm.trim()) params.set('search', searchTerm.trim());

      const response = await fetch(`/api/admin/subscriptions?${params.toString()}`);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message);
      setSubscriptions(data.data);
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to load customer subscriptions.' });
    }
  };

  const refreshAll = async () => {
    setLoading(true);
    await Promise.all([loadOffers(), loadSubscriptions()]);
    setLoading(false);
  };

  useEffect(() => {
    refreshAll();
  }, [statusFilter]);

  const handlePeriodChange = (period: string) => {
    if (period === 'WEEKLY') {
      setForm((prev) => ({ ...prev, billingPeriod: period, durationDays: 7, durationMonths: 0, pickupLimit: 1, price: 99 }));
    } else if (period === 'QUARTERLY') {
      setForm((prev) => ({ ...prev, billingPeriod: period, durationDays: 90, durationMonths: 3, pickupLimit: 12, price: 299 }));
    } else {
      setForm((prev) => ({ ...prev, billingPeriod: period, durationDays: 30, durationMonths: 1, pickupLimit: 4, price: 199 }));
    }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    try {
      const payload = {
        ...form,
        benefits: form.benefits.split(/\r?\n/).filter(Boolean),
      };
      const response = await fetch(
        editingId ? `/api/admin/subscription-offers/${editingId}` : '/api/admin/subscription-offers',
        {
          method: editingId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Unable to save offer.');
      }
      setMessage({ type: 'success', text: `Offer ${editingId ? 'updated' : 'created'} successfully.` });
      setForm(emptyForm);
      setEditingId(null);
      await loadOffers();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to save offer.' });
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete or archive this offer? Existing customer subscriptions will remain valid.')) return;
    try {
      const response = await fetch(`/api/admin/subscription-offers/${id}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message);
      setMessage({ type: 'success', text: 'Offer deleted or archived successfully.' });
      await loadOffers();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to remove offer.' });
    }
  };

  const handleAdminCancel = async (subId: string) => {
    const reason = window.prompt('Reason for admin cancellation:', 'Administrative cancellation.');
    if (reason === null) return;
    try {
      const response = await fetch(`/api/customer/subscriptions/${subId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || 'Administrative cancellation.' }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message);
      setMessage({ type: 'success', text: 'Subscription has been cancelled.' });
      await loadSubscriptions();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to cancel subscription.' });
    }
  };

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Customer Entitlements</p>
            <h1 className="mt-1 text-2xl font-black text-slate-900">Subscription Plans & Passes</h1>
            <p className="mt-1 text-xs text-slate-500">
              Manage weekly, monthly, and quarterly passes, and view customer subscriptions and pickup quotas.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refreshAll}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="mt-6 flex border-b border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab('offers')}
            className={`border-b-2 px-5 py-2.5 text-xs font-black transition-colors ${
              activeTab === 'offers'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Plan Offers ({offers.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('subscriptions')}
            className={`flex items-center gap-1.5 border-b-2 px-5 py-2.5 text-xs font-black transition-colors ${
              activeTab === 'subscriptions'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            Customer Subscriptions ({subscriptions.length})
          </button>
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

      {activeTab === 'offers' && (
        <div className="space-y-6">
          {/* Create / Edit Offer Form */}
          <form onSubmit={save} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-black text-slate-900 mb-4">
              {editingId ? 'Edit Subscription Offer' : 'Create New Subscription Offer'}
            </h2>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Offer Name</label>
                <input
                  required
                  placeholder="e.g. Monthly Standard"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-bold"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Billing Period</label>
                <select
                  value={form.billingPeriod}
                  onChange={(e) => handlePeriodChange(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-bold"
                >
                  <option value="WEEKLY">WEEKLY (7 Days)</option>
                  <option value="MONTHLY">MONTHLY (30 Days)</option>
                  <option value="QUARTERLY">QUARTERLY (90 Days)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Price (₹ INR)</label>
                <input
                  required
                  type="number"
                  min="1"
                  value={form.price}
                  onChange={(event) => setForm({ ...form, price: Number(event.target.value) })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-bold"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Pickups Quota</label>
                <input
                  required
                  type="number"
                  min="1"
                  value={form.pickupLimit}
                  onChange={(event) => setForm({ ...form, pickupLimit: Number(event.target.value) })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-bold"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Duration (Days)</label>
                <input
                  required
                  type="number"
                  min="1"
                  value={form.durationDays}
                  onChange={(event) => setForm({ ...form, durationDays: Number(event.target.value) })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-bold"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Display Order</label>
                <input
                  type="number"
                  min="0"
                  value={form.displayOrder}
                  onChange={(event) => setForm({ ...form, displayOrder: Number(event.target.value) })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-bold"
                />
              </div>
            </div>

            <div className="mt-3">
              <label className="text-[11px] font-bold text-slate-600 block mb-1">Description</label>
              <textarea
                required
                placeholder="Short summary for customer cards..."
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs"
                rows={2}
              />
            </div>

            <div className="mt-3">
              <label className="text-[11px] font-bold text-slate-600 block mb-1">Benefits (one per line)</label>
              <textarea
                placeholder="4 Free doorstep pickups&#10;Zero minimum scrap charge&#10;Priority agent dispatch"
                value={form.benefits}
                onChange={(event) => setForm({ ...form, benefits: event.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs"
                rows={3}
              />
            </div>

            <div className="mt-4 flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) => setForm({ ...form, active: event.target.checked })}
                  className="rounded text-emerald-600"
                />
                Active for customers
              </label>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white hover:bg-emerald-700"
                >
                  <Plus className="mr-1 inline h-4 w-4" />
                  {editingId ? 'Update Offer' : 'Create Offer'}
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setForm(emptyForm);
                    }}
                    className="rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-200"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </form>

          {/* Offers Cards */}
          <section className="grid gap-4 md:grid-cols-3">
            {offers.map((offer) => {
              const periodLabel = offer.billingPeriod || (offer.durationMonths === 0 ? 'WEEKLY' : offer.durationMonths === 3 ? 'QUARTERLY' : 'MONTHLY');
              const limit = offer.pickupLimit || (periodLabel === 'WEEKLY' ? 1 : periodLabel === 'QUARTERLY' ? 12 : 4);
              return (
                <article key={offer.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase text-slate-700">
                          {periodLabel}
                        </span>
                        <h2 className="mt-1 font-black text-slate-900">{offer.name}</h2>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                          offer.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {offer.active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </div>

                    <p className="mt-3 text-2xl font-black text-emerald-700">
                      ₹{offer.price}
                      <span className="text-xs font-bold text-slate-500"> / {offer.durationDays || 30} days</span>
                    </p>
                    <p className="text-xs font-bold text-slate-700 mt-1">Quota: {limit} Pickups</p>
                    <p className="mt-2 text-xs text-slate-600 line-clamp-2">{offer.description}</p>

                    <ul className="mt-3 space-y-1 text-xs text-slate-600 border-t border-slate-100 pt-3">
                      {offer.benefits.map((benefit) => (
                        <li key={benefit} className="flex items-start gap-1">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0 mt-0.5" />
                          <span>{benefit}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-5 flex gap-2 border-t border-slate-100 pt-3">
                    <button
                      onClick={() => {
                        setEditingId(offer.id);
                        setForm({
                          name: offer.name,
                          description: offer.description,
                          billingPeriod: periodLabel,
                          durationDays: offer.durationDays || (periodLabel === 'WEEKLY' ? 7 : periodLabel === 'QUARTERLY' ? 90 : 30),
                          durationMonths: offer.durationMonths,
                          pickupLimit: limit,
                          price: offer.price,
                          benefits: offer.benefits.join('\n'),
                          active: offer.active,
                          displayOrder: offer.displayOrder || 0,
                        });
                      }}
                      className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => remove(offer.id)}
                      className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100"
                    >
                      Delete / Archive
                    </button>
                  </div>
                </article>
              );
            })}
          </section>
        </div>
      )}

      {activeTab === 'subscriptions' && (
        <div className="space-y-4">
          {/* Filters & Search */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
                <Filter className="h-3.5 w-3.5" /> Filter:
              </span>
              {['ALL', 'ACTIVE', 'CANCELLED', 'EXPIRED'].map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                    statusFilter === status
                      ? 'bg-slate-900 text-white'
                      : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  placeholder="Search customer phone / name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadSubscriptions()}
                  className="rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 py-1.5 text-xs font-bold"
                />
              </div>
              <button
                type="button"
                onClick={loadSubscriptions}
                className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white"
              >
                Search
              </button>
            </div>
          </div>

          {/* Subscriptions Table */}
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-100 bg-slate-50/75 text-[11px] font-black uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-4">Customer</th>
                    <th className="px-5 py-4">Plan & Period</th>
                    <th className="px-5 py-4">Quota (Used / Left)</th>
                    <th className="px-5 py-4">Validity</th>
                    <th className="px-5 py-4">Payment</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {subscriptions.map((sub) => {
                    const isActive = sub.status === 'ACTIVE';
                    return (
                      <tr key={sub.id} className="hover:bg-slate-50/50">
                        <td className="px-5 py-4">
                          <p className="font-bold text-slate-900">{sub.customerName}</p>
                          <p className="text-[11px] text-slate-500">{sub.customerPhone}</p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-bold text-slate-900">{sub.planName}</p>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase text-slate-600">
                            {sub.billingPeriod}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-black text-slate-800">
                            {sub.pickupsUsed} / {sub.pickupsAllowed} used
                          </p>
                          <p className="text-[11px] font-bold text-emerald-600">
                            {sub.remainingPickups} pickups left
                          </p>
                        </td>
                        <td className="px-5 py-4 text-slate-600">
                          <p>{new Date(sub.startDate).toLocaleDateString('en-IN')}</p>
                          <p className="text-[11px] text-slate-400">
                            to {new Date(sub.expiryDate).toLocaleDateString('en-IN')}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                            {sub.paymentMethod === 'WALLET' ? <Wallet className="h-3 w-3" /> : 'Razorpay'}
                            ₹{sub.paymentAmount}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-black ${
                              isActive
                                ? 'bg-emerald-100 text-emerald-800'
                                : sub.status === 'CANCELLED'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {sub.status}
                          </span>
                          {sub.cancellationReason && (
                            <p className="mt-1 text-[10px] text-slate-400 italic max-w-xs truncate">
                              {sub.cancellationReason}
                            </p>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right">
                          {isActive && (
                            <button
                              type="button"
                              onClick={() => handleAdminCancel(sub.id)}
                              className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100"
                            >
                              Cancel Pass
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {subscriptions.length === 0 && (
                <div className="py-12 text-center text-xs text-slate-400">
                  No subscriptions found matching the selected filters.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
