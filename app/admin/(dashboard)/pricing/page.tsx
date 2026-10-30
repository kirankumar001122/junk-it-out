'use client';

import { useState } from 'react';
import { Tag, Save, Zap, AlertCircle, Scale, ShieldCheck } from 'lucide-react';

export default function AdminPricingPage() {
  const [rates, setRates] = useState({
    basePickupCharge: 49,
    minPickupCharge: 49,
    urgentSurcharge: 29,
    weekendFee: 19,
    heavyItemHandlingFee: 199,
    eWasteHandlingFee: 49,
  });

  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
        <div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase">
            Pricing Engine
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">Pricing & Fee Surcharges</h1>
          <p className="text-xs text-slate-500">Configure base pickup charges, urgent fees, heavy handling, & weekend rates</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
        {saved && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl text-xs font-bold flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Pricing rules updated successfully and active system-wide!</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="block text-xs font-extrabold text-slate-700 uppercase">Standard Base Pickup Fee (₹)</label>
            <input
              type="number"
              value={isNaN(rates.basePickupCharge) ? '' : rates.basePickupCharge}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setRates({ ...rates, basePickupCharge: isNaN(val) ? 0 : val });
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500"
            />
            <p className="text-[11px] text-slate-500">Fixed convenience fee charged per doorstep arrival</p>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-extrabold text-slate-700 uppercase">Minimum Pickup Fee (₹)</label>
            <input
              type="number"
              value={isNaN(rates.minPickupCharge) ? '' : rates.minPickupCharge}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setRates({ ...rates, minPickupCharge: isNaN(val) ? 0 : val });
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500"
            />
            <p className="text-[11px] text-slate-500">Minimum threshold charge for low-volume pickups</p>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-extrabold text-slate-700 uppercase">Urgent 20-30 Min Surcharge (₹)</label>
            <input
              type="number"
              value={isNaN(rates.urgentSurcharge) ? '' : rates.urgentSurcharge}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setRates({ ...rates, urgentSurcharge: isNaN(val) ? 0 : val });
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500"
            />
            <p className="text-[11px] text-slate-500">Added fee for ASAP express dispatch</p>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-extrabold text-slate-700 uppercase">Heavy Item / Furniture Handling Fee (₹)</label>
            <input
              type="number"
              value={isNaN(rates.heavyItemHandlingFee) ? '' : rates.heavyItemHandlingFee}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setRates({ ...rates, heavyItemHandlingFee: isNaN(val) ? 0 : val });
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500"
            />
            <p className="text-[11px] text-slate-500">Two-man heavy lifting fee for sofas, beds, & bulky scrap</p>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 flex justify-end">
          <button
            type="submit"
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-8 py-4 rounded-2xl shadow-lg shadow-emerald-600/20 flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            Save Pricing Rules
          </button>
        </div>
      </form>
    </div>
  );
}
