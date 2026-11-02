'use client';

import { useState, useEffect } from 'react';
import { Download } from 'lucide-react';

export default function AdminReportsPage() {
  const [stats, setStats] = useState<any>(null);
  const [statsError, setStatsError] = useState(false);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    fetch('/api/admin/stats')
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error('Failed to load report statistics.');
        }
        if (active) setStats(data.data);
      })
      .catch(() => {
        if (active) setStatsError(true);
      })
      .finally(() => {
        if (active) setStatsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const metricValue = (value: number | undefined) => {
    if (statsLoading) return 'Loading…';
    if (statsError) return 'Unavailable';
    return value ?? 0;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
        <div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase">
            Business Intelligence
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">Reports & Analytics</h1>
          <p className="text-xs text-slate-500">Operational totals, settlement records, and dispatch SLA metrics</p>
        </div>

        <a
          href="/api/admin/reports"
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-3 rounded-2xl shadow-md inline-flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          EXPORT FULL CSV REPORT
        </a>
      </div>

      {statsError && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Report statistics could not be loaded. Refresh the page to try again.
        </p>
      )}

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-2">
          <span className="text-xs font-bold text-slate-500 uppercase">Total Completed Pickups</span>
          <span className="text-3xl font-black text-slate-900 block">{metricValue(stats?.completedPickups)}</span>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-2">
          <span className="text-xs font-bold text-slate-500 uppercase">Total Waste Collected (kg)</span>
          <span className="text-3xl font-black text-slate-900 block">{metricValue(stats?.totalWeightKg)} <span className="text-base text-slate-500">kg</span></span>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-2">
          <span className="text-xs font-bold text-slate-500 uppercase">Customer Settlement Records</span>
          <span className="text-3xl font-black text-slate-900 block">₹{metricValue(stats?.totalCustomerPayouts)}</span>
          <span className="text-[11px] text-slate-500 font-medium">Ledger total; not proof of transfer</span>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-2">
          <span className="text-xs font-bold text-slate-500 uppercase">Dispatch SLA Target</span>
          <span className="text-3xl font-black text-emerald-600 block">{metricValue(stats?.slaOnTimeRate)}%</span>
          <span className="text-[11px] text-emerald-700 font-bold">Under 30 Min Arrival</span>
        </div>
      </div>
    </div>
  );
}
