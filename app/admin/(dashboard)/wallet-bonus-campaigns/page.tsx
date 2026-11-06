'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Plus, RefreshCw, Trash2 } from 'lucide-react';

type Slab = { id: string; minimumAmount: number; maximumAmount: number | null; bonusPercentage: number | null; fixedBonusAmount: number | null; maximumBonusAmount: number | null };
type Campaign = { id: string; campaignName: string; description: string; bonusType: string; bonusPercentage: number | null; minimumRechargeAmount: number; maximumBonusAmount: number | null; campaignStartDate: string; campaignEndDate: string; bonusExpiryDays: number; status: string; isActive: boolean; priority: number; slabs: Slab[]; transactions?: Array<{ id: string; type: string; amount: number; status: string; createdAt: string }> };
type CampaignForm = { campaignName: string; description: string; bonusType: string; bonusPercentage: number; minimumRechargeAmount: number; maximumBonusAmount: string | number; campaignStartDate: string; campaignEndDate: string; bonusExpiryDays: number; status: string; isActive: boolean; priority: number };
const empty: CampaignForm = { campaignName: '', description: '', bonusType: 'PERCENTAGE', bonusPercentage: 10, minimumRechargeAmount: 100, maximumBonusAmount: '', campaignStartDate: '', campaignEndDate: '', bonusExpiryDays: 30, status: 'DRAFT', isActive: false, priority: 0 };
const emptySlab: Record<string, string> = { minimumAmount: '100', maximumAmount: '', bonusPercentage: '10', fixedBonusAmount: '', maximumBonusAmount: '' };

export default function WalletBonusCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [form, setForm] = useState<CampaignForm>(empty);
  const [slab, setSlab] = useState(emptySlab);
  const [editingSlabId, setEditingSlabId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/wallet-bonus-campaigns');
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Unable to load campaigns.');
      setCampaigns(data.data);
      if (selected) setSelected(data.data.find((item: Campaign) => item.id === selected.id) || null);
    } catch (error) { setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to load campaigns.' }); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setMessage(null);
    const response = await fetch(editingId ? `/api/admin/wallet-bonus-campaigns/${editingId}` : '/api/admin/wallet-bonus-campaigns', { method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const data = await response.json();
    if (!response.ok || !data.success) { setMessage({ type: 'error', text: data.message || 'Unable to save campaign.' }); return; }
    setMessage({ type: 'success', text: editingId ? 'Campaign updated.' : 'Campaign created in draft mode.' });
    setForm(empty); setEditingId(null); await load();
  };

  const selectCampaign = async (id: string) => {
    const response = await fetch(`/api/admin/wallet-bonus-campaigns/${id}`);
    const data = await response.json();
    if (response.ok && data.success) setSelected(data.data);
    else setMessage({ type: 'error', text: data.message || 'Unable to load campaign details.' });
  };
  const setCampaignState = async (campaign: Campaign, status: string, isActive: boolean) => {
    const response = await fetch(`/api/admin/wallet-bonus-campaigns/${campaign.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...campaign, status, isActive, campaignStartDate: campaign.campaignStartDate, campaignEndDate: campaign.campaignEndDate }) });
    const data = await response.json();
    if (!response.ok || !data.success) setMessage({ type: 'error', text: data.message || 'Unable to update campaign.' }); else { setMessage({ type: 'success', text: `Campaign ${status.toLowerCase()}.` }); await load(); await selectCampaign(campaign.id); }
  };
  const archive = async (campaign: Campaign) => { if (!window.confirm('Archive this campaign? It will no longer qualify for bonuses.')) return; await setCampaignState(campaign, 'ARCHIVED', false); };
  const addSlab = async (event: React.FormEvent) => {
    event.preventDefault(); if (!selected) return;
    const response = await fetch(editingSlabId ? `/api/admin/wallet-bonus-campaigns/${selected.id}/slabs/${editingSlabId}` : `/api/admin/wallet-bonus-campaigns/${selected.id}/slabs`, { method: editingSlabId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(slab) });
    const data = await response.json(); if (!response.ok || !data.success) setMessage({ type: 'error', text: data.message || 'Unable to save slab.' }); else { setSlab(emptySlab); setEditingSlabId(null); await selectCampaign(selected.id); await load(); }
  };
  const removeSlab = async (slabId: string) => { if (!selected || !window.confirm('Delete this slab?')) return; const response = await fetch(`/api/admin/wallet-bonus-campaigns/${selected.id}/slabs/${slabId}`, { method: 'DELETE' }); const data = await response.json(); if (!response.ok || !data.success) setMessage({ type: 'error', text: data.message || 'Unable to delete slab.' }); else selectCampaign(selected.id); };

  return <div className="space-y-6">
    <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Wallet operations</p><h1 className="mt-1 text-2xl font-black text-slate-900">Bonus campaigns</h1><p className="mt-1 text-xs text-slate-500">Campaigns remain inactive until explicitly activated.</p></div><button onClick={load} className="rounded-xl bg-slate-100 p-2" aria-label="Refresh campaigns"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button></div></header>
    {message && <div className={`flex items-center gap-2 rounded-2xl border p-4 text-xs font-bold ${message.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}><AlertCircle className="h-4 w-4" />{message.text}</div>}
    <form onSubmit={save} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="font-black text-slate-900">{editingId ? 'Edit campaign' : 'Create campaign'}</h2><div className="mt-4 grid gap-3 md:grid-cols-2">
      <input required placeholder="Campaign name" value={form.campaignName} onChange={(e) => setForm({ ...form, campaignName: e.target.value })} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold" />
      <select value={form.bonusType} onChange={(e) => setForm({ ...form, bonusType: e.target.value })} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold"><option value="PERCENTAGE">Percentage bonus</option><option value="FIXED">Fixed bonus</option></select>
      <input type="number" min="0" max="100" step="0.01" value={String(form.bonusPercentage)} onChange={(e) => setForm({ ...form, bonusPercentage: Number(e.target.value) })} placeholder="Bonus percentage / fixed amount" className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold" />
      <input required type="number" min="0" step="0.01" value={String(form.minimumRechargeAmount)} onChange={(e) => setForm({ ...form, minimumRechargeAmount: Number(e.target.value) })} placeholder="Minimum recharge" className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold" />
      <input type="number" min="0" step="0.01" value={form.maximumBonusAmount} onChange={(e) => setForm({ ...form, maximumBonusAmount: e.target.value })} placeholder="Maximum bonus cap" className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold" />
      <input type="number" min="0" value={String(form.bonusExpiryDays)} onChange={(e) => setForm({ ...form, bonusExpiryDays: Number(e.target.value) })} placeholder="Bonus expiry days" className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold" />
      <input required type="datetime-local" value={form.campaignStartDate} onChange={(e) => setForm({ ...form, campaignStartDate: e.target.value })} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs" /><input required type="datetime-local" value={form.campaignEndDate} onChange={(e) => setForm({ ...form, campaignEndDate: e.target.value })} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs" />
      <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value, isActive: e.target.value === 'ACTIVE' })} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold"><option>DRAFT</option><option>ACTIVE</option><option>PAUSED</option><option>EXPIRED</option><option>ARCHIVED</option></select>
      <input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} placeholder="Priority" className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold" />
    </div><textarea className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs" rows={2} placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /><div className="mt-4 flex gap-2"><button className="rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black text-white"><Plus className="mr-1 inline h-4 w-4" />{editingId ? 'Update campaign' : 'Create campaign'}</button>{editingId && <button type="button" onClick={() => { setEditingId(null); setForm(empty); }} className="rounded-xl bg-slate-100 px-4 py-3 text-xs font-bold">Cancel</button>}</div></form>
    <section className="grid gap-4 lg:grid-cols-2">{campaigns.map((campaign) => <article key={campaign.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h2 className="font-black text-slate-900">{campaign.campaignName}</h2><p className="mt-1 text-xs text-slate-500">Min ₹{campaign.minimumRechargeAmount} • {campaign.bonusExpiryDays} day expiry</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-black ${campaign.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{campaign.status}</span></div><p className="mt-3 text-xs text-slate-600">{campaign.description || 'No description'}</p><div className="mt-4 flex flex-wrap gap-2"><button onClick={() => selectCampaign(campaign.id)} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white">Details</button><button onClick={() => { setEditingId(campaign.id); setForm({ campaignName: campaign.campaignName, description: campaign.description, bonusType: campaign.bonusType, bonusPercentage: campaign.bonusPercentage ?? 0, minimumRechargeAmount: campaign.minimumRechargeAmount, maximumBonusAmount: campaign.maximumBonusAmount ?? '', campaignStartDate: campaign.campaignStartDate.slice(0, 16), campaignEndDate: campaign.campaignEndDate.slice(0, 16), bonusExpiryDays: campaign.bonusExpiryDays, status: campaign.status, isActive: campaign.isActive, priority: campaign.priority }); }} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold">Edit</button>{campaign.status === 'ACTIVE' ? <button onClick={() => setCampaignState(campaign, 'PAUSED', false)} className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">Pause</button> : campaign.status !== 'ARCHIVED' && <button onClick={() => setCampaignState(campaign, 'ACTIVE', true)} className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">Activate</button>}<button onClick={() => archive(campaign)} className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">Archive</button></div></article>)}</section>
    {selected && <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="text-lg font-black text-slate-900">{selected.campaignName} details</h2><p className="text-xs text-slate-500">Promotional transactions: {selected.transactions?.length || 0}</p></div><button onClick={() => setSelected(null)} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold">Close</button></div><div className="mt-5 grid gap-4 lg:grid-cols-2"><form onSubmit={addSlab} className="rounded-2xl bg-slate-50 p-4"><h3 className="text-sm font-black">{editingSlabId ? 'Edit recharge slab' : 'Add recharge slab'}</h3><div className="mt-3 grid gap-2 sm:grid-cols-2">{Object.keys(emptySlab).map((key) => <input key={key} type="number" step="0.01" placeholder={key} value={slab[key]} onChange={(e) => setSlab({ ...slab, [key]: e.target.value })} className="rounded-xl border border-slate-200 bg-white p-2 text-xs" />)}</div><div className="mt-3 flex gap-2"><button className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">{editingSlabId ? 'Update slab' : 'Add slab'}</button>{editingSlabId && <button type="button" onClick={() => { setEditingSlabId(null); setSlab(emptySlab); }} className="rounded-xl bg-white px-3 py-2 text-xs font-bold">Cancel</button>}</div></form><div><h3 className="text-sm font-black">Recharge slabs</h3><div className="mt-3 space-y-2">{selected.slabs.map((item) => <div key={item.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-xs"><span>₹{item.minimumAmount}–{item.maximumAmount ?? '∞'} • {item.bonusPercentage !== null ? `${item.bonusPercentage}%` : `₹${item.fixedBonusAmount}`}</span><span className="flex gap-1"><button onClick={() => { setEditingSlabId(item.id); setSlab({ minimumAmount: String(item.minimumAmount), maximumAmount: item.maximumAmount === null ? '' : String(item.maximumAmount), bonusPercentage: item.bonusPercentage === null ? '' : String(item.bonusPercentage), fixedBonusAmount: item.fixedBonusAmount === null ? '' : String(item.fixedBonusAmount), maximumBonusAmount: item.maximumBonusAmount === null ? '' : String(item.maximumBonusAmount) }); }} className="rounded-lg bg-white px-2 py-1 font-bold text-slate-700">Edit</button><button onClick={() => removeSlab(item.id)} className="rounded-lg p-2 text-rose-700" aria-label="Delete slab"><Trash2 className="h-4 w-4" /></button></span></div>)}</div></div></div><div className="mt-5"><h3 className="text-sm font-black">Promotional transactions</h3><div className="mt-2 divide-y divide-slate-100">{selected.transactions?.map((tx) => <div key={tx.id} className="flex justify-between py-2 text-xs"><span>{tx.type} • {new Date(tx.createdAt).toLocaleString('en-IN')}</span><b>₹{tx.amount.toFixed(2)} • {tx.status}</b></div>)}</div></div></section>}
  </div>;
}
