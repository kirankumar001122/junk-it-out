'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { CreditCard, RefreshCw, ArrowUpRight, ArrowDownLeft, Search, AlertCircle, RotateCcw } from 'lucide-react';

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  // Refund modal state
  const [refundModalPayment, setRefundModalPayment] = useState<any | null>(null);
  const [refundAmount, setRefundAmount] = useState<string>('');
  const [refunding, setRefunding] = useState(false);
  const [refundReason, setRefundReason] = useState('Customer request / order adjustment');
  const requestId = useRef(0);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSubmittedSearch(searchTerm.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [searchTerm]);

  const loadPayments = useCallback(async (signal?: AbortSignal) => {
    const currentRequestId = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (submittedSearch) params.set('search', submittedSearch);
      const res = await fetch(`/api/admin/payments?${params}`, { signal });
      if (!res.ok) throw new Error(`Payments request failed (${res.status}).`);
      const data = await res.json();
      if (currentRequestId !== requestId.current) return;
      if (data.success) {
        setPayments(data.data);
        setHasMore(Boolean(data.hasMore));
      } else {
        setError(data.message || 'Failed to fetch payments.');
      }
    } catch (e: any) {
      if (signal?.aborted) return;
      if (currentRequestId !== requestId.current) return;
      setError(e.message || 'Database error fetching payments.');
    } finally {
      if (!signal?.aborted && currentRequestId === requestId.current) setLoading(false);
    }
  }, [page, submittedSearch]);

  useEffect(() => {
    const controller = new AbortController();
    void loadPayments(controller.signal);
    return () => controller.abort();
  }, [loadPayments]);

  const handleConfirmRefund = async () => {
    if (!refundModalPayment || refunding) return;
    const numAmount = Number(refundAmount);
    const maxRefundable = Number(refundModalPayment.remainingRefundableAmount ?? refundModalPayment.amount ?? 0);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      alert('Please enter a valid refund amount greater than 0.');
      return;
    }
    if (numAmount > maxRefundable) {
      alert(`Refund amount cannot exceed remaining refundable balance of ₹${maxRefundable}.`);
      return;
    }

    setRefunding(true);
    try {
      const res = await fetch('/api/admin/payments/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentRecordId: refundModalPayment.id,
          amount: numAmount,
          reason: refundReason,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setRefundModalPayment(null);
        loadPayments();
      } else {
        alert(data.message || 'Failed to issue refund.');
      }
    } catch (e: any) {
      alert(e.message || 'Error processing refund request.');
    } finally {
      setRefunding(false);
    }
  };

  const handleCheckRefundStatus = async (payment: any) => {
    try {
      const res = await fetch('/api/admin/payments/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentRecordId: payment.id }),
      });
      const data = await res.json();
      if (data.data?.canResetToCaptured) {
        const confirmReset = window.confirm(
          `${data.message}\n\nDo you want to reset this payment back to CAPTURED so you can re-initiate the refund?`
        );
        if (confirmReset) {
          const resetRes = await fetch('/api/admin/payments/refund', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentRecordId: payment.id, action: 'reset_failed' }),
          });
          const resetData = await resetRes.json();
          window.alert(resetData.message || 'Payment reset.');
        }
      } else {
        window.alert(data.message || 'Refund status checked.');
      }
      void loadPayments();
    } catch {
      window.alert('Refund status could not be checked. No new refund request was sent.');
    }
  };

  const filteredPayments = payments;

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
          onClick={() => void loadPayments()}
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
            <button onClick={() => void loadPayments()} className="bg-rose-600 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg">
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
                  <th className="p-3 text-right">Actions</th>
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
                      {p.totalRefundedAmount > 0 && (
                        <span className="block text-indigo-700 font-bold mt-0.5">
                          Refunded: ₹{p.totalRefundedAmount} (Bal: ₹{p.remainingRefundableAmount ?? 0})
                        </span>
                      )}
                      {p.razorpayRefundId && (
                        <span className="block text-purple-700 font-bold">Refund: {p.razorpayRefundId}</span>
                      )}
                      {p.refundFailureReason && (
                        <span className="block text-rose-600 font-semibold" title={p.refundFailureReason}>
                          Fail: {p.refundFailureReason}
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-bold text-slate-700">{p.actualWeight || 0} kg</td>
                    <td className="p-3">
                      <span
                        className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase ${
                          p.status === 'SETTLEMENT_COMPLETED' || p.status === 'CAPTURED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : p.status === 'REFUNDED'
                            ? 'bg-purple-100 text-purple-800'
                            : p.status === 'PARTIALLY_REFUNDED'
                            ? 'bg-indigo-100 text-indigo-800'
                            : p.status === 'REFUND_FAILED'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="p-3 text-slate-500 font-mono text-[11px]">{p.date}</td>
                    <td className="p-3 text-right">
                      {p.status === 'CAPTURED' || (p.status === 'PARTIALLY_REFUNDED' && (p.remainingRefundableAmount ?? 0) > 0) ? (
                        <button
                          onClick={() => {
                            setRefundModalPayment(p);
                            setRefundAmount(String(p.remainingRefundableAmount ?? p.amount ?? ''));
                            setRefundReason('Customer request / order adjustment');
                          }}
                          className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold text-[11px] rounded-xl flex items-center gap-1 ml-auto transition-colors"
                          title="Initiate server-side Razorpay refund"
                        >
                          <RotateCcw className="w-3 h-3" />
                          {p.status === 'PARTIALLY_REFUNDED' ? 'Refund More' : 'Refund'}
                        </button>
                      ) : ['REFUND_PROCESSING', 'REFUND_PENDING', 'REFUND_PENDING_RECONCILIATION'].includes(p.status) ? (
                        <button
                          onClick={() => handleCheckRefundStatus(p)}
                          className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 font-bold text-[11px] rounded-xl ml-auto transition-colors"
                        >
                          Check refund status
                        </button>
                      ) : p.status === 'REFUND_FAILED' ? (
                        <button
                          onClick={() => handleCheckRefundStatus(p)}
                          className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-800 font-bold text-[11px] rounded-xl ml-auto transition-colors"
                          title="Verify with Razorpay and safely recover"
                        >
                          Reconcile / Recover
                        </button>
                      ) : p.status === 'REFUNDED' ? (
                        <span className="text-[11px] text-purple-700 font-bold px-2 py-1 bg-purple-50 rounded-lg">
                          Refunded
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px] font-medium">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && !error && (page > 1 || hasMore) && (
          <div className="flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-slate-500">
            <span>Showing {(page - 1) * 50 + 1}–{(page - 1) * 50 + payments.length}</span>
            <div className="flex gap-2">
              <button type="button" disabled={page === 1} onClick={() => setPage((current) => current - 1)} className="rounded-lg border border-slate-200 px-3 py-2 font-bold disabled:opacity-40">Previous</button>
              <button type="button" disabled={!hasMore} onClick={() => setPage((current) => current + 1)} className="rounded-lg border border-slate-200 px-3 py-2 font-bold disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Razorpay Refund Confirmation Modal */}
      {refundModalPayment && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 flex items-center justify-center">
                <RotateCcw className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Initiate Razorpay Refund</h3>
                <p className="text-xs text-slate-500">Order: {refundModalPayment.orderNumber}</p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs space-y-2 font-medium">
              <div className="flex justify-between">
                <span className="text-slate-500">Customer:</span>
                <span className="font-bold text-slate-900">{refundModalPayment.customer}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Gateway Payment ID:</span>
                <span className="font-mono font-bold text-slate-900">{refundModalPayment.gatewayPaymentId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Original Total:</span>
                <span className="font-bold text-slate-900">₹{refundModalPayment.amount || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Refunded So Far:</span>
                <span className="font-bold text-indigo-700">₹{refundModalPayment.totalRefundedAmount || 0}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1.5">
                <span className="text-slate-700 font-bold">Remaining Refundable:</span>
                <span className="font-black text-sm text-emerald-700">₹{refundModalPayment.remainingRefundableAmount ?? refundModalPayment.amount ?? 0}</span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Refund Amount (₹)</label>
              <input
                type="number"
                step="any"
                min="1"
                max={refundModalPayment.remainingRefundableAmount ?? refundModalPayment.amount ?? 0}
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                placeholder="Enter refund amount"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-900"
              />
              <p className="text-[11px] text-slate-500">
                Enter any amount up to ₹{refundModalPayment.remainingRefundableAmount ?? refundModalPayment.amount ?? 0} for a partial refund, or leave full remaining.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Refund Reason (Internal Notes)</label>
              <input
                type="text"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="e.g. Order cancellation / Customer service request"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-900"
              />
            </div>

            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-xs text-rose-900 space-y-1">
              <p className="font-bold">⚠️ Warning: Irreversible Payout Action</p>
              <p className="text-[11px] text-rose-800">
                This will trigger Razorpay REST API to refund ₹{Number(refundAmount) || 0} back to the customer&apos;s source account. Status will be tracked atomically in PostgreSQL.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                disabled={refunding}
                onClick={() => setRefundModalPayment(null)}
                className="w-1/2 bg-slate-100 text-slate-700 font-bold text-xs py-3 rounded-xl hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={refunding}
                onClick={handleConfirmRefund}
                className="w-1/2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-3 rounded-xl shadow-md flex items-center justify-center gap-2"
              >
                {refunding ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Refunding...
                  </>
                ) : (
                  'Confirm Refund'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

