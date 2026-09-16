'use client';

import { Tag, ShieldCheck } from 'lucide-react';

export default function AdminPricingPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase">
            Pricing Engine Rules
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">Pricing Rules & Service Fee Controls</h1>
          <p className="text-xs text-slate-500">Configured baseline service charges, coupon rules, and valuation rules.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">Base Service Charge</h2>
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between">
            <div>
              <span className="font-bold text-emerald-950 block text-base">₹69 Standard Pickup Fee</span>
              <span className="text-xs text-emerald-700">Applies to all South Bengaluru service zones</span>
            </div>
            <span className="font-mono font-black text-emerald-800 text-lg">₹69.00</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">Active Promotional Discounts</h2>
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl flex items-center justify-between">
            <div>
              <span className="font-bold text-blue-950 block text-base">WELCOME50 Coupon</span>
              <span className="text-xs text-blue-700">₹50 flat discount for first-time pickups</span>
            </div>
            <span className="font-mono font-black text-blue-800 text-lg">-₹50.00</span>
          </div>
        </div>
      </div>
    </div>
  );
}
