'use client';

import { FileBarChart, Download } from 'lucide-react';
import { getApiUrl } from '@/lib/api';

export default function AdminReportsPage() {
  const exportUrl = getApiUrl('/api/admin/reports');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase">
            Data Exports & Analytics
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">Reports & CSV Exports</h1>
          <p className="text-xs text-slate-500">Export operations data, pickup ledgers, and metrics reports.</p>
        </div>

        <a
          href={exportUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-3 rounded-xl shadow-md flex items-center gap-2 self-start sm:self-auto"
        >
          <Download className="w-4 h-4" />
          DOWNLOAD FULL CSV REPORT
        </a>
      </div>

      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">Available Reports</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-semibold">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between">
            <div>
              <span className="font-extrabold text-slate-900 block text-sm">Orders & Pickups Log</span>
              <span className="text-slate-500">Complete historical pickup orders CSV</span>
            </div>
            <a href={exportUrl} className="text-emerald-700 font-bold hover:underline">
              Download
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
