'use client';

import { UserCog, ShieldCheck } from 'lucide-react';

export default function AdminUsersPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase">
            Access Control
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">Admin Users Roster</h1>
          <p className="text-xs text-slate-500">Authorized administrative personnel and access levels.</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px]">
              <tr>
                <th className="p-3">Admin Name</th>
                <th className="p-3">Phone</th>
                <th className="p-3">Department</th>
                <th className="p-3">Role</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              <tr className="hover:bg-slate-50/80">
                <td className="p-3 font-bold text-slate-900">Junk It Out Primary Admin</td>
                <td className="p-3 font-mono text-slate-600">+91 7676272709</td>
                <td className="p-3 text-slate-700">Operations & Management</td>
                <td className="p-3 font-extrabold text-emerald-700">SUPER_ADMIN</td>
                <td className="p-3">
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800">
                    ACTIVE
                  </span>
                </td>
              </tr>
              <tr className="hover:bg-slate-50/80">
                <td className="p-3 font-bold text-slate-900">Junk It Out Admin (Darshan)</td>
                <td className="p-3 font-mono text-slate-600">+91 8884176048</td>
                <td className="p-3 text-slate-700">Operations & Management</td>
                <td className="p-3 font-extrabold text-emerald-700">SUPER_ADMIN</td>
                <td className="p-3">
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800">
                    ACTIVE
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
