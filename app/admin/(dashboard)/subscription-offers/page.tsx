'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Plus, RefreshCw } from 'lucide-react';

type Offer = { id: string; name: string; description: string; durationMonths: number; price: number; benefits: string[]; active: boolean; displayOrder: number };
const empty = { name: '', description: '', durationMonths: 3, price: 299, benefits: '', active: true, displayOrder: 0 };

export default function AdminSubscriptionOffersPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { const response = await fetch('/api/admin/subscription-offers'); const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.message); setOffers(data.data); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to load offers.'); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setMessage(null);
    const response = await fetch(editingId ? `/api/admin/subscription-offers/${editingId}` : '/api/admin/subscription-offers', { method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, benefits: form.benefits.split(/\r?\n/).filter(Boolean) }) });
    const data = await response.json(); if (!response.ok || !data.success) { setMessage(data.message || 'Unable to save offer.'); return; }
    setForm(empty); setEditingId(null); await load();
  };
  const remove = async (id: string) => { if (!window.confirm('Delete this offer? Offers with purchases will be archived.')) return; const response = await fetch(`/api/admin/subscription-offers/${id}`, { method: 'DELETE' }); const data = await response.json(); if (!response.ok || !data.success) setMessage(data.message || 'Unable to remove offer.'); else load(); };
  return <div className="space-y-6">
    <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Customer plans</p><h1 className="mt-1 text-2xl font-black text-slate-900">Subscription offers</h1><p className="mt-1 text-xs text-slate-500">Changes here are immediately reflected in the customer dashboard.</p></div><button onClick={load} className="rounded-xl bg-slate-100 p-2"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button></div></header>
    {message && <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-bold text-rose-800"><AlertCircle className="h-4 w-4" />{message}</div>}
    <form onSubmit={save} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="grid gap-3 md:grid-cols-2"><input required placeholder="Offer name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold" /><input required type="number" min="1" value={form.price} onChange={(event) => setForm({ ...form, price: Number(event.target.value) })} placeholder="Price" className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold" /><input required type="number" min="1" value={form.durationMonths} onChange={(event) => setForm({ ...form, durationMonths: Number(event.target.value) })} placeholder="Duration in months" className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold" /><input type="number" min="0" value={form.displayOrder} onChange={(event) => setForm({ ...form, displayOrder: Number(event.target.value) })} placeholder="Display order" className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold" /></div><textarea required placeholder="Description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs" rows={2} /><textarea placeholder="Benefits, one per line" value={form.benefits} onChange={(event) => setForm({ ...form, benefits: event.target.value })} className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs" rows={3} /><label className="mt-3 flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Active for customers</label><div className="mt-4 flex gap-2"><button className="rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black text-white"><Plus className="mr-1 inline h-4 w-4" />{editingId ? 'Update offer' : 'Create offer'}</button>{editingId && <button type="button" onClick={() => { setEditingId(null); setForm(empty); }} className="rounded-xl bg-slate-100 px-4 py-3 text-xs font-bold">Cancel</button>}</div></form>
    <section className="grid gap-4 md:grid-cols-3">{offers.map((offer) => <article key={offer.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex justify-between gap-2"><h2 className="font-black text-slate-900">{offer.name}</h2><span className={`rounded-full px-2 py-1 text-[10px] font-black ${offer.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>{offer.active ? 'ACTIVE' : 'INACTIVE'}</span></div><p className="mt-3 text-2xl font-black text-emerald-700">₹{offer.price}</p><p className="text-xs text-slate-500">{offer.durationMonths} months</p><p className="mt-3 text-xs text-slate-600">{offer.description}</p><ul className="mt-3 space-y-1 text-xs text-slate-600">{offer.benefits.map((benefit) => <li key={benefit}>✓ {benefit}</li>)}</ul><div className="mt-5 flex gap-2"><button onClick={() => { setEditingId(offer.id); setForm({ ...offer, benefits: offer.benefits.join('\n') }); }} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white">Edit</button><button onClick={() => remove(offer.id)} className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">Delete / archive</button></div></article>)}</section>
  </div>;
}
