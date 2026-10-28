'use client';

import { useState, useEffect, useRef } from 'react';
import { Save, ShieldCheck, AlertCircle, RefreshCw } from 'lucide-react';

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

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSubmittingRef = useRef(false);

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/settings');
      const data = await res.json();
      if (data.success && data.data) {
        setSettings(data.data);
      } else {
        setError(data.message || 'Failed to load business settings.');
      }
    } catch {
      setError('Network error while loading settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current || saving) return;

    isSubmittingRef.current = true;
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 4000);
      } else {
        setError(data.error?.message || data.message || 'Failed to update business settings.');
      }
    } catch {
      setError('Network error while updating settings.');
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
            Platform Configuration
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">Admin & Business Settings</h1>
          <p className="text-xs text-slate-500">Manage legal identity, DPIIT registration, support helplines, & API integrations in DB</p>
        </div>

        <button
          onClick={loadSettings}
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
            <span>Business settings updated successfully and logged to security audit trail!</span>
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
            <label className="block text-xs font-extrabold text-slate-700 uppercase">Registered Entity Name</label>
            <input
              type="text"
              disabled={loading || saving}
              value={settings.companyName}
              onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-extrabold text-slate-700 uppercase">DPIIT Registration Number</label>
            <input
              type="text"
              disabled={loading || saving}
              value={settings.dpiitNumber}
              onChange={(e) => setSettings({ ...settings, dpiitNumber: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-extrabold text-slate-700 uppercase">Customer Support Helpline</label>
            <input
              type="text"
              disabled={loading || saving}
              value={settings.supportPhone}
              onChange={(e) => setSettings({ ...settings, supportPhone: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-extrabold text-slate-700 uppercase">Support Email Address</label>
            <input
              type="email"
              disabled={loading || saving}
              value={settings.supportEmail}
              onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-extrabold text-slate-700 uppercase">Dispatch Target SLA (Minutes)</label>
            <input
              type="number"
              min="5"
              max="120"
              disabled={loading || saving}
              value={settings.dispatchSlaMinutes}
              onChange={(e) => setSettings({ ...settings, dispatchSlaMinutes: parseInt(e.target.value) || 30 })}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-extrabold text-slate-700 uppercase">Razorpay Payment Key ID</label>
            <input
              type="text"
              disabled={loading || saving}
              value={settings.razorpayKeyId}
              onChange={(e) => setSettings({ ...settings, razorpayKeyId: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold text-slate-900 font-mono focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            />
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
                <span>Saving Settings...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save Business Settings</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
