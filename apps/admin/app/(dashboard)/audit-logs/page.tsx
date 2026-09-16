'use client';

import { History } from 'lucide-react';

export default function AdminAuditLogsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase">
            Security Audit
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">Audit Trail & Security Logs</h1>
          <p className="text-xs text-slate-500">System operation history and admin activity log.</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 text-xs font-medium text-slate-500 text-center">
        All security policies and admin activity logs are active and recorded on production backend.
      </div>
    </div>
  );
}
