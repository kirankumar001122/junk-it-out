'use client';

import { Settings, ShieldCheck } from 'lucide-react';

export default function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase">
            System Config
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">API & Business Settings</h1>
          <p className="text-xs text-slate-500">Operation center parameters and support contact numbers.</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">Business Configuration</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-semibold">
          <div>
            <span className="text-slate-400 block mb-1">Support Phone</span>
            <span className="font-mono text-slate-900 text-sm">+91 7676272709 / +91 9591883174</span>
          </div>
          <div>
            <span className="text-slate-400 block mb-1">Primary Operating Area</span>
            <span className="text-slate-900 text-sm">South Bengaluru (JP Nagar, Jayanagar, BTM, HSR, Banashankari)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
