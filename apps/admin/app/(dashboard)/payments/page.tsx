'use client';

import { useState, useEffect } from 'react';
import { CreditCard, RefreshCw, RotateCcw, Loader2 } from 'lucide-react';
import { adminFetch } from '@/lib/api';

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refundTarget, setRefundTarget] = useState<any>(null);
  const [refundReason, setRefundReason] = useState('Admin initiated refund');
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundMessage, setRefundMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadPayments = async () => {
    setLoading(true);
    try {
      const res = await adminFetch('/api/admin/payments');
      const data = await res.json();
      if (data.success) {
        setPayments(data.data || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments();
  }, []);

  const handleOpenRefundModal = (payment: any) => {
    setRefundTarget(payment);
    setRefundReason('Admin initiated refund');
    setRefundMessage(null);
  };

  const handleConfirmRefund = async () => {
    if (!refundTarget) return;
    setRefundLoading(true);
    setRefundMessage(null);

    try {
      const res = await adminFetch('/api/admin/payments/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentRecordId: refundTarget.id,
          reason: refundReason.trim() || 'Admin initiated refund',
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setRefundMessage({ type: 'success', text: data.message || 'Refund issued successfully.' });
        setTimeout(() => {
          setRefundTarget(null);
          loadPayments();
        }, 1200);
      } else {
        setRefundMessage({ type: 'error', text: data.message || 'Failed to issue refund.' });
      }
    } catch (err: any) {
      setRefundMessage({ type: 'error', text: err.message || 'Network error initiating refund.' });
    } finally {
      setRefundLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase">
            Financial Ledger
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">Payments & Settlement Ledger</h1>
          <p className="text-xs text-slate-500">Razorpay transactions and payout settlement audit log.</p>
        </div>

        <button
          onClick={loadPayments}
          className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 self-start sm:self-auto cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px]">
              <tr>
                <th className="p-3">Payment ID / Order</th>
                <th className="p-3">Method</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Status</th>
                <th className="p-3">Date</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center p-8 text-slate-400 font-semibold">
                    Loading payments ledger...
                  </td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center p-8 text-slate-400 font-semibold">
                    No payment transactions recorded yet.
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3">
                      <span className="font-mono font-bold text-slate-900 block">{p.razorpayPaymentId || p.paymentId || p.id}</span>
                      <span className="text-[11px] text-slate-500">Order #{p.order?.orderNumber || p.orderId}</span>
                    </td>
                    <td className="p-3 font-bold text-slate-700">{p.paymentMethod || 'RAZORPAY_ONLINE'}</td>
                    <td className="p-3 font-bold text-slate-900">₹{p.amount}</td>
                    <td className="p-3">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                          p.status === 'SUCCESS' || p.status === 'CAPTURED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : p.status === 'REFUNDED'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="p-3 text-slate-500">
                      {p.createdAt ? new Date(p.createdAt).toLocaleString() : 'N/A'}
                    </td>
                    <td className="p-3">
                      {p.status === 'CAPTURED' || p.status === 'SUCCESS' ? (
                        <button
                          onClick={() => handleOpenRefundModal(p)}
                          className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold px-3 py-1.5 rounded-lg text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Refund
                        </button>
                      ) : p.status === 'REFUNDED' ? (
                        <span className="text-slate-400 font-semibold text-[11px]">Refunded</span>
                      ) : (
                        <span className="text-slate-400 font-semibold text-[11px]">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {refundTarget && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-900">Confirm Payment Refund</h3>
              <button
                type="button"
                onClick={() => setRefundTarget(null)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Are you sure you want to issue a refund of <strong className="text-slate-900 font-bold">₹{refundTarget.amount}</strong> for Order #{refundTarget.order?.orderNumber || refundTarget.orderId}?
            </p>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">Refund Reason:</label>
              <input
                type="text"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="Reason for refund"
                disabled={refundLoading}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            {refundMessage && (
              <div
                className={`p-3 rounded-xl text-xs font-bold ${
                  refundMessage.type === 'success'
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border border-rose-200 text-rose-800'
                }`}
              >
                {refundMessage.text}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRefundTarget(null)}
                disabled={refundLoading}
                className="w-1/2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-3 rounded-xl disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRefund}
                disabled={refundLoading}
                className="w-1/2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-3 rounded-xl shadow-md disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {refundLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                {refundLoading ? 'Processing...' : 'Confirm Refund'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
