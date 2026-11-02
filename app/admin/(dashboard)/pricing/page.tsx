'use client';

import { useState, useEffect, useRef } from 'react';
import { Save, AlertCircle, ShieldCheck, RefreshCw } from 'lucide-react';

export default function AdminPricingPage() {
  const [rates, setRates] = useState({
    basePickupCharge: 49,
    minPickupCharge: 49,
    urgentSurcharge: 29,
    weekendFee: 19,
    heavyItemHandlingFee: 199,
    eWasteHandlingFee: 49,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSubmittingRef = useRef(false);

  const loadPricing = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/pricing');
      const data = await res.json();
      if (data.success && data.data) {
        setRates(data.data);
      } else {
        setError(data.message || 'Failed to load pricing configurations.');
      }
    } catch {
      setError('Network error while loading pricing.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPricing();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current || saving) return;

    isSubmittingRef.current = true;
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const res = await fetch('/api/admin/pricing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rates),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 4000);
      } else {
        setError(data.error?.message || data.message || 'Failed to save pricing rules.');
      }
    } catch {
      setError('Network error while updating pricing rules.');
    } finally {
      setSaving(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
        <div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase">
            Pricing Engine
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">Pricing & Fee Surcharges</h1>
          <p className="text-xs text-slate-500">Configure base pickup charges, urgent fees, heavy handling, & weekend rates stored in DB</p>
        </div>

        <button
          onClick={loadPricing}
          disabled={loading || saving}
          className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 flex items-center gap-1.5 self-start sm:self-auto disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <form onSubmit={handleSave} className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
        {saved && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl text-xs font-bold flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Pricing rules updated successfully in PostgreSQL and active system-wide!</span>
          </div>
        )}

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-2xl text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="block text-xs font-extrabold text-slate-700 uppercase">Standard Base Pickup Fee (₹)</label>
            <input
              type="number"
              min="0"
              step="1"
              disabled={loading || saving}
              value={isNaN(rates.basePickupCharge) ? '' : rates.basePickupCharge}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setRates({ ...rates, basePickupCharge: isNaN(val) ? 0 : val });
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            />
            <p className="text-[11px] text-slate-500">Fixed convenience fee charged per doorstep arrival across Bengaluru zones</p>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-extrabold text-slate-700 uppercase">Minimum Pickup Fee (₹)</label>
            <input
              type="number"
              min="0"
              step="1"
              disabled={loading || saving}
              value={isNaN(rates.minPickupCharge) ? '' : rates.minPickupCharge}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setRates({ ...rates, minPickupCharge: isNaN(val) ? 0 : val });
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            />
            <p className="text-[11px] text-slate-500">Minimum threshold charge for low-volume pickups</p>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-extrabold text-slate-700 uppercase">Urgent 20-30 Min Surcharge (₹)</label>
            <input
              type="number"
              min="0"
              step="1"
              disabled={loading || saving}
              value={isNaN(rates.urgentSurcharge) ? '' : rates.urgentSurcharge}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setRates({ ...rates, urgentSurcharge: isNaN(val) ? 0 : val });
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            />
            <p className="text-[11px] text-slate-500">Added fee for ASAP express dispatch</p>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-extrabold text-slate-700 uppercase">Heavy Item / Furniture Handling Fee (₹)</label>
            <input
              type="number"
              min="0"
              step="1"
              disabled={loading || saving}
              value={isNaN(rates.heavyItemHandlingFee) ? '' : rates.heavyItemHandlingFee}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setRates({ ...rates, heavyItemHandlingFee: isNaN(val) ? 0 : val });
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            />
            <p className="text-[11px] text-slate-500">Two-man heavy lifting fee for sofas, beds, & bulky scrap</p>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 flex justify-end">
          <button
            type="submit"
            disabled={loading || saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-8 py-4 rounded-2xl shadow-lg shadow-emerald-600/20 flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Saving Rules...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save Pricing Rules</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
