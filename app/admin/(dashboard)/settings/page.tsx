'use client';

import { useState } from 'react';
import { Settings, Building, Phone, Mail, ShieldCheck, Key, Save } from 'lucide-react';

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState({
    companyName: 'Junk It Out Technologies Private Limited',
    dpiitNumber: 'DIPP265455',
    sector: 'Green Technology / Waste Management',
    supportPhone: '+91 7676272709 / +91 9591883174',
    supportEmail: 'info@junkitout.in',
    dispatchSlaMinutes: 30,
    razorpayKeyId: 'rzp_live_JunkItOut2026',
    whatsappApiStatus: 'CONNECTED',
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
            Platform Configuration
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">Admin & Business Settings</h1>
          <p className="text-xs text-slate-500">Manage legal identity, DPIIT registration, support helplines, & API integrations</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
        {saved && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl text-xs font-bold flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Business settings updated successfully!</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="block text-xs font-extrabold text-slate-700 uppercase">Registered Entity Name</label>
            <input
              type="text"
              value={settings.companyName}
              onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold text-slate-900"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-extrabold text-slate-700 uppercase">DPIIT Registration Number</label>
            <input
              type="text"
              value={settings.dpiitNumber}
              onChange={(e) => setSettings({ ...settings, dpiitNumber: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold text-slate-900"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-extrabold text-slate-700 uppercase">Customer Support Helpline</label>
            <input
              type="text"
              value={settings.supportPhone}
              onChange={(e) => setSettings({ ...settings, supportPhone: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold text-slate-900"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-extrabold text-slate-700 uppercase">Support Email Address</label>
            <input
              type="email"
              value={settings.supportEmail}
              onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold text-slate-900"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-extrabold text-slate-700 uppercase">Dispatch Target SLA (Minutes)</label>
            <input
              type="number"
              value={settings.dispatchSlaMinutes}
              onChange={(e) => setSettings({ ...settings, dispatchSlaMinutes: parseInt(e.target.value) })}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold text-slate-900"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-extrabold text-slate-700 uppercase">Razorpay Payment Key ID</label>
            <input
              type="text"
              value={settings.razorpayKeyId}
              onChange={(e) => setSettings({ ...settings, razorpayKeyId: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold text-slate-900 font-mono"
            />
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 flex justify-end">
          <button
            type="submit"
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-8 py-4 rounded-2xl shadow-lg shadow-emerald-600/20 flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            Save Business Settings
          </button>
        </div>
      </form>
    </div>
  );
}
