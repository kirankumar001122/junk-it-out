'use client';

import { useState, useEffect } from 'react';
import { CreditCard, RefreshCw, ArrowUpRight, ArrowDownLeft, Search, AlertCircle } from 'lucide-react';

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const loadPayments = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/payments');
      const data = await res.json();
      if (data.success) {
        setPayments(data.data);
      } else {
        setError(data.message || 'Failed to fetch payments.');
      }
    } catch (e: any) {
      setError(e.message || 'Database error fetching payments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments();
  }, []);

  const filteredPayments = payments.filter(
    (p) =>
      p.orderNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.customer?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.gatewayOrderId?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
        <div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase">
            Financial Ledger
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">Payments & Customer Settlement</h1>
          <p className="text-xs text-slate-500">Track scrap payouts, Razorpay transactions, & customer service fees from DB</p>
        </div>

        <button
          onClick={loadPayments}
          className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 flex items-center gap-1.5 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Ledger
        </button>
      </div>

      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search Order # / Customer / Txn ID"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-2.5 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400 text-xs font-medium">
            Loading payment records from database...
          </div>
        ) : error ? (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 p-6 rounded-2xl text-center space-y-2">
            <AlertCircle className="w-6 h-6 mx-auto text-rose-600" />
            <p className="text-xs font-bold">{error}</p>
            <button onClick={loadPayments} className="bg-rose-600 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg">
              Retry
            </button>
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <CreditCard className="w-10 h-10 mx-auto text-slate-300" />
            <p className="font-bold text-slate-700 text-sm">No payment records available.</p>
            <p className="text-xs text-slate-500">No payment transactions match your filter criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px]">
                <tr>
                  <th className="p-3">Order Number</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3">Payout Direction</th>
                  <th className="p-3">Service / Scrap Value</th>
                  <th className="p-3">Payment Method / ID</th>
                  <th className="p-3">Actual Weight</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-mono font-bold text-slate-900">{p.orderNumber}</td>
                    <td className="p-3 font-bold text-slate-800">{p.customer}</td>
                    <td className="p-3">
                      {p.direction === 'JUNKITOUT_PAYS' ? (
                        <span className="text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full text-[10px] font-extrabold inline-flex items-center gap-1 border border-emerald-200">
                          <ArrowDownLeft className="w-3.5 h-3.5" /> JunkItOut Pays Customer
                        </span>
                      ) : (
                        <span className="text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full text-[10px] font-extrabold inline-flex items-center gap-1 border border-blue-200">
                          <ArrowUpRight className="w-3.5 h-3.5" /> Customer Pays Fee
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-black text-sm text-slate-900">
                      <span className="block">Service: ₹{p.serviceCharge || 0}</span>
                      <span className="block text-emerald-700">Scrap: ₹{p.scrapValue || 0}</span>
                    </td>
                    <td className="p-3 font-mono text-[11px] text-slate-600">
                      <span className="block font-bold text-slate-800">{p.gateway}</span>
                      <span className="block">Order: {p.gatewayOrderId}</span>
                      <span>Payment: {p.gatewayPaymentId || 'N/A'}</span>
                    </td>
                    <td className="p-3 font-bold text-slate-700">{p.actualWeight || 0} kg</td>
                    <td className="p-3">
                      <span
                        className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase ${
                          p.status === 'SETTLEMENT_COMPLETED' || p.status === 'CAPTURED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="p-3 text-slate-500 font-mono text-[11px]">{p.date}</td>
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
