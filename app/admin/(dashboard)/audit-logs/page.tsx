'use client';

import { useState, useEffect } from 'react';
import { History, ShieldCheck } from 'lucide-react';

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/admin/audit-logs')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setLogs(data.data);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
        <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase">
          Security & Audit Log
        </span>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">Administrative Audit Trail Logs</h1>
        <p className="text-xs text-slate-500">Immutable history of all sensitive administrative changes and system actions</p>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px]">
              <tr>
                <th className="p-3">Timestamp</th>
                <th className="p-3">User / Admin</th>
                <th className="p-3">Action</th>
                <th className="p-3">Old Value</th>
                <th className="p-3">New Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-400 font-medium">
                    No security audit logs recorded yet.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 text-slate-500 font-mono">{new Date(log.timestamp).toLocaleString()}</td>
                    <td className="p-3 font-bold text-slate-900">{log.userName || 'System'}</td>
                    <td className="p-3">
                      <span className="font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 text-[10px]">
                        {log.action}
                      </span>
                    </td>
                    <td className="p-3 text-slate-500 font-mono">{log.oldValue || '—'}</td>
                    <td className="p-3 text-slate-900 font-mono font-bold">{log.newValue || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
