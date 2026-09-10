'use client';

import { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, Search, RefreshCw, MessageSquare } from 'lucide-react';

export default function AdminComplaintsPage() {
  const [complaints, setComplaints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const loadComplaints = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/complaints');
      const data = await res.json();
      if (data.success) {
        setComplaints(data.data);
      } else {
        setError(data.message || 'Failed to fetch support complaints.');
      }
    } catch (e: any) {
      setError(e.message || 'Database connection error.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComplaints();
  }, []);

  const resolveComplaint = async (id: string) => {
    const resolutionNotes = prompt('Enter resolution details/notes for this ticket:', 'Resolved by Admin Operations.');
    if (resolutionNotes === null) return;

    try {
      const res = await fetch('/api/admin/complaints', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'RESOLVED', resolutionNotes }),
      });
      const data = await res.json();
      if (data.success) {
        loadComplaints();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const filteredComplaints = complaints.filter(
    (c) =>
      c.orderNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
        <div>
          <span className="text-xs font-bold text-amber-700 bg-amber-100 px-3 py-1 rounded-full uppercase">
            Support Desk
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">Support & Customer Complaints</h1>
          <p className="text-xs text-slate-500">Manage real customer weight disputes, agent behavior, delays, & payment inquiries from DB</p>
        </div>

        <button
          onClick={loadComplaints}
          className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 flex items-center gap-1.5 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Desk
        </button>
      </div>

      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search Order # / Customer / Category"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-2.5 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400 text-xs font-medium">
            Loading support complaints from database...
          </div>
        ) : error ? (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 p-6 rounded-2xl text-center space-y-2">
            <AlertCircle className="w-6 h-6 mx-auto text-rose-600" />
            <p className="text-xs font-bold">{error}</p>
            <button onClick={loadComplaints} className="bg-rose-600 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg">
              Retry
            </button>
          </div>
        ) : filteredComplaints.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <MessageSquare className="w-10 h-10 mx-auto text-slate-300" />
            <p className="font-bold text-slate-700 text-sm">No complaints logged.</p>
            <p className="text-xs text-slate-500">There are no support tickets or complaints matching your criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px]">
                <tr>
                  <th className="p-3">Ticket ID</th>
                  <th className="p-3">Order Number</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Description</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Created</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredComplaints.map((cmp) => (
                  <tr key={cmp.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-mono font-bold text-slate-900">{cmp.id.substring(0, 8)}</td>
                    <td className="p-3 font-mono font-bold text-slate-700">{cmp.orderNumber}</td>
                    <td className="p-3">
                      <span className="font-bold text-slate-900 block">{cmp.customerName}</span>
                      <span className="text-[11px] text-slate-500">{cmp.customerPhone}</span>
                    </td>
                    <td className="p-3 font-bold text-slate-800">{cmp.category.replace(/_/g, ' ')}</td>
                    <td className="p-3 text-slate-600 max-w-xs">{cmp.description}</td>
                    <td className="p-3">
                      <span
                        className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase ${
                          cmp.status === 'RESOLVED' || cmp.status === 'CLOSED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {cmp.status}
                      </span>
                    </td>
                    <td className="p-3 text-slate-500 font-mono text-[11px]">{cmp.createdAt}</td>
                    <td className="p-3">
                      {cmp.status === 'OPEN' || cmp.status === 'INVESTIGATING' ? (
                        <button
                          onClick={() => resolveComplaint(cmp.id)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg text-[11px]"
                        >
                          Resolve Ticket
                        </button>
                      ) : (
                        <span className="text-slate-400 font-bold text-[11px]">Closed</span>
                      )}
                    </td>
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
