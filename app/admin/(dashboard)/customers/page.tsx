'use client';

import { useState, useEffect } from 'react';
import { UserCheck, Search, RefreshCw, AlertCircle, Users } from 'lucide-react';

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const loadCustomers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/customers');
      const data = await res.json();
      if (data.success) {
        setCustomers(data.data);
      } else {
        setError(data.message || 'Failed to load customers.');
      }
    } catch (e: any) {
      setError(e.message || 'Database connection error.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone.includes(searchTerm) ||
      c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.area.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
        <div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase">
            Customer Database
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">Customers Roster</h1>
          <p className="text-xs text-slate-500">Registered South Bengaluru users, order volume, & reward points from DB</p>
        </div>

        <button
          onClick={loadCustomers}
          className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 flex items-center gap-1.5 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Database
        </button>
      </div>

      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Search Customer Name / Phone / Area"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-2.5 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400 font-medium text-xs">
            Loading customers from database...
          </div>
        ) : error ? (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 p-6 rounded-2xl text-center space-y-2">
            <AlertCircle className="w-6 h-6 mx-auto text-rose-600" />
            <p className="text-xs font-bold">{error}</p>
            <button onClick={loadCustomers} className="bg-rose-600 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg">
              Retry
            </button>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <Users className="w-10 h-10 mx-auto text-slate-300" />
            <p className="font-bold text-slate-700 text-sm">No customers found.</p>
            <p className="text-xs text-slate-500">No customer records match your filter criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto pt-2">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px]">
                <tr>
                  <th className="p-3">Customer Name</th>
                  <th className="p-3">Phone & Email</th>
                  <th className="p-3">Primary Area</th>
                  <th className="p-3">Completed Pickups</th>
                  <th className="p-3">Green Points</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Joined Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredCustomers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3 font-extrabold text-slate-900 text-sm">{c.name}</td>
                    <td className="p-3">
                      <span className="font-bold text-slate-900 block">{c.phone}</span>
                      <span className="text-[11px] text-slate-500">{c.email}</span>
                    </td>
                    <td className="p-3 font-bold text-slate-700">{c.area}</td>
                    <td className="p-3 font-black text-emerald-700 text-sm">{c.pickupsCount} Pickups</td>
                    <td className="p-3">
                      <span className="font-extrabold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">
                        ⭐ {c.points} Pts
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2.5 py-1 rounded-full">
                        {c.status}
                      </span>
                    </td>
                    <td className="p-3 text-slate-500 font-mono">{c.joinedDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
