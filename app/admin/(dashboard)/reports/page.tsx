'use client';

import { useState, useEffect } from 'react';
import { Download, RefreshCw, AlertCircle } from 'lucide-react';

export default function AdminReportsPage() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/stats');
      const data = await res.json();
      if (data.success) {
        setStats(data.data);
      } else {
        setError(data.error?.message || data.message || 'Failed to load report analytics.');
      }
    } catch {
      setError('Network error while loading reports.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
        <div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase">
            Business Intelligence
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">Reports & Analytics</h1>
          <p className="text-xs text-slate-500">Live waste volume metrics, agent SLA compliance, & financial export reports</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadStats}
            disabled={loading}
            className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <a
            href="/api/admin/reports"
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-3 rounded-2xl shadow-md inline-flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            EXPORT FULL CSV REPORT
          </a>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-bold text-rose-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{error}</span>
          <button onClick={loadStats} className="underline ml-auto font-extrabold text-rose-800">
            Retry
          </button>
        </div>
      )}

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-2">
          <span className="text-xs font-bold text-slate-500 uppercase">Total Completed Pickups</span>
          <span className="text-3xl font-black text-slate-900 block">
            {loading ? '...' : (stats?.completedOrders ?? stats?.completedPickups ?? 0)}
          </span>
          <span className="text-[11px] text-emerald-600 font-bold">Verified on Database</span>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-2">
          <span className="text-xs font-bold text-slate-500 uppercase">Total Waste Diverted (kg)</span>
          <span className="text-3xl font-black text-slate-900 block">
            {loading ? '...' : (Number(stats?.totalWeightKg ?? 0)).toLocaleString()} <span className="text-base text-slate-500">kg</span>
          </span>
          <span className="text-[11px] text-emerald-600 font-bold">100% Certified Recycled</span>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-2">
          <span className="text-xs font-bold text-slate-500 uppercase">Scrap Customer Payouts</span>
          <span className="text-3xl font-black text-slate-900 block">
            ₹{loading ? '...' : (Number(stats?.totalCustomerPayouts ?? stats?.totalCustomerSettlements ?? stats?.pendingCustomerPayouts ?? 0)).toLocaleString()}
          </span>
          <span className="text-[11px] text-slate-500 font-medium">Direct UPI & Cash Payouts</span>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-2">
          <span className="text-xs font-bold text-slate-500 uppercase">Dispatch SLA Target</span>
          <span className="text-3xl font-black text-emerald-600 block">
            {loading ? '...' : `${stats?.slaOnTimeRate ?? 0}%`}
          </span>
          <span className="text-[11px] text-emerald-700 font-bold">Under 30 Min Arrival</span>
        </div>
      </div>

      {/* Analytics Breakdown Card */}
      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
        <h2 className="text-lg font-extrabold text-slate-900">South Bengaluru Volume Breakdown</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
            <span className="text-xs font-bold text-slate-500 block">JP Nagar Hub</span>
            <span className="text-2xl font-black text-slate-900">High Volume</span>
            <p className="text-[11px] text-slate-500">Target SLA: 25 mins</p>
          </div>
          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
            <span className="text-xs font-bold text-slate-500 block">Jayanagar Hub</span>
            <span className="text-2xl font-black text-slate-900">Primary Hub</span>
            <p className="text-[11px] text-slate-500">Target SLA: 25 mins</p>
          </div>
          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
            <span className="text-xs font-bold text-slate-500 block">Electronic City & HSR</span>
            <span className="text-2xl font-black text-slate-900">Active Coverage</span>
            <p className="text-[11px] text-slate-500">Target SLA: 30 mins</p>
          </div>
        </div>
      </div>
    </div>
  );
}
