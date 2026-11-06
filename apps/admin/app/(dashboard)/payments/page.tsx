'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  CreditCard,
  RefreshCw,
  RotateCcw,
  Loader2,
  Search,
  X,
  Eye,
  Download,
  ArrowUpRight,
  ArrowDownLeft,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Filter,
} from 'lucide-react';
import { adminFetch } from '@/lib/api';

interface PaymentRecord {
  id: string;
  orderId?: string;
  orderNumber?: string;
  orderStatus?: string | null;
  customer?: string;
  amount: number;
  serviceCharge?: number;
  scrapValue?: number;
  direction?: 'CUSTOMER_PAYS' | 'JUNKITOUT_PAYS' | string;
  gateway?: string;
  gatewayOrderId?: string;
  gatewayPaymentId?: string;
  paymentId?: string;
  razorpayPaymentId?: string;
  status: string;
  totalRefundedAmount?: number;
  inFlightRefundAmount?: number;
  remainingRefundableAmount?: number;
  availableRefundableAmount?: number;
  razorpayRefundId?: string | null;
  refundFailureReason?: string | null;
  refundAttempts?: any[];
  actualWeight?: number;
  settlementStatus?: string;
  date?: string;
  createdAt?: string;
}

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [directionFilter, setDirectionFilter] = useState<'ALL' | 'CUSTOMER_PAYS' | 'JUNKITOUT_PAYS'>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'DATE_DESC' | 'DATE_ASC' | 'AMOUNT_DESC' | 'AMOUNT_ASC'>('DATE_DESC');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  // Modals State
  const [detailsPayment, setDetailsPayment] = useState<PaymentRecord | null>(null);
  const [refundTarget, setRefundTarget] = useState<PaymentRecord | null>(null);
  const [refundAmount, setRefundAmount] = useState<string>('');
  const [refundReason, setRefundReason] = useState('Admin initiated refund');
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundMessage, setRefundMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadPayments = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await adminFetch('/api/admin/payments');
      const data = await res.json();
      if (data.success) {
        setPayments(data.data || []);
      } else {
        setErrorMsg(data.message || 'Failed to load payments ledger.');
      }
    } catch (e: any) {
      console.error('Error fetching payments:', e);
      setErrorMsg(e.message || 'Network error fetching payments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments();
  }, []);

  // Summary Metrics
  const metrics = useMemo(() => {
    let totalGross = 0;
    let settledVolume = 0;
    let refundedVolume = 0;
    let capturedCount = 0;

    for (const p of payments) {
      const amt = Number(p.amount) || 0;
      totalGross += amt;
      if (['SUCCESS', 'CAPTURED', 'SETTLEMENT_COMPLETED'].includes(p.status)) {
        settledVolume += amt;
        capturedCount++;
      }
      if (p.totalRefundedAmount && p.totalRefundedAmount > 0) {
        refundedVolume += Number(p.totalRefundedAmount);
      } else if (p.status === 'REFUNDED') {
        refundedVolume += amt;
      }
    }

    return {
      totalGross: Math.round(totalGross),
      settledVolume: Math.round(settledVolume),
      refundedVolume: Math.round(refundedVolume),
      capturedCount,
      totalCount: payments.length,
    };
  }, [payments]);

  // Filtering & Sorting
  const filteredPayments = useMemo(() => {
    return payments
      .filter((p) => {
        // Direction Filter
        if (directionFilter !== 'ALL' && p.direction !== directionFilter) {
          return false;
        }

        // Status Filter
        if (statusFilter !== 'ALL') {
          if (statusFilter === 'CAPTURED' && !['CAPTURED', 'SUCCESS', 'SETTLEMENT_COMPLETED'].includes(p.status)) {
            return false;
          } else if (statusFilter === 'INITIATED' && !['INITIATED', 'PENDING'].includes(p.status)) {
            return false;
          } else if (statusFilter === 'REFUNDED' && p.status !== 'REFUNDED') {
            return false;
          } else if (statusFilter === 'PARTIALLY_REFUNDED' && p.status !== 'PARTIALLY_REFUNDED') {
            return false;
          } else if (statusFilter === 'REFUND_FAILED' && p.status !== 'REFUND_FAILED') {
            return false;
          }
        }

        // Search Query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const pId = (p.gatewayPaymentId || p.paymentId || p.gatewayOrderId || p.id || '').toLowerCase();
          const ord = (p.orderNumber || p.orderId || '').toLowerCase();
          const cust = (p.customer || '').toLowerCase();
          const gway = (p.gateway || '').toLowerCase();
          return pId.includes(q) || ord.includes(q) || cust.includes(q) || gway.includes(q);
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'AMOUNT_DESC') {
          return (Number(b.amount) || 0) - (Number(a.amount) || 0);
        }
        if (sortBy === 'AMOUNT_ASC') {
          return (Number(a.amount) || 0) - (Number(b.amount) || 0);
        }
        if (sortBy === 'DATE_ASC') {
          return new Date(a.createdAt || a.date || 0).getTime() - new Date(b.createdAt || b.date || 0).getTime();
        }
        // DATE_DESC
        return new Date(b.createdAt || b.date || 0).getTime() - new Date(a.createdAt || a.date || 0).getTime();
      });
  }, [payments, directionFilter, statusFilter, searchQuery, sortBy]);

  // Pagination calculations
  const totalItems = filteredPayments.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginatedPayments = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredPayments.slice(start, start + pageSize);
  }, [filteredPayments, currentPage, pageSize]);

  // Adjust page if exceeds bounds
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const handleOpenRefundModal = (payment: PaymentRecord) => {
    setRefundTarget(payment);
    setRefundAmount(String(payment.remainingRefundableAmount ?? payment.amount ?? ''));
    setRefundReason('Admin initiated refund');
    setRefundMessage(null);
  };

  const handleConfirmRefund = async () => {
    if (!refundTarget) return;
    const numAmount = Number(refundAmount);
    const maxRefundable = Number(refundTarget.remainingRefundableAmount ?? refundTarget.amount ?? 0);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      setRefundMessage({ type: 'error', text: 'Please enter a valid refund amount greater than 0.' });
      return;
    }
    if (numAmount > maxRefundable) {
      setRefundMessage({ type: 'error', text: `Refund amount cannot exceed remaining balance of ₹${maxRefundable}.` });
      return;
    }

    setRefundLoading(true);
    setRefundMessage(null);

    try {
      const res = await adminFetch('/api/admin/payments/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentRecordId: refundTarget.id,
          amount: numAmount,
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

  const handleCheckRefundStatus = async (payment: PaymentRecord) => {
    try {
      const res = await adminFetch('/api/admin/payments/refund', {
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
          const resetRes = await adminFetch('/api/admin/payments/refund', {
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
      await loadPayments();
    } catch {
      window.alert('Refund status could not be checked. No new refund request was sent.');
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredPayments.length === 0) return;
    const headers = ['Transaction ID', 'Order Number', 'Customer', 'Flow Direction', 'Gateway', 'Gross Amount (INR)', 'Status', 'Date'];
    const rows = filteredPayments.map((p) => [
      `"${p.gatewayPaymentId || p.paymentId || p.id}"`,
      `"${p.orderNumber || p.orderId || ''}"`,
      `"${p.customer || 'Customer'}"`,
      `"${p.direction || 'CUSTOMER_PAYS'}"`,
      `"${p.gateway || 'RAZORPAY'}"`,
      p.amount,
      `"${p.status}"`,
      `"${p.date || p.createdAt || ''}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `junkitout-payments-ledger-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase tracking-wider">
            Financial Ledger & Settlements
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">Payments & Settlement Ledger</h1>
          <p className="text-xs text-slate-500">Razorpay transactions, customer payouts, and settlement audit log.</p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={handleExportCSV}
            disabled={filteredPayments.length === 0}
            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold text-xs px-3.5 py-2.5 rounded-xl flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-40 transition-colors"
            title="Export filtered transactions to CSV"
          >
            <Download className="w-4 h-4 text-slate-500" />
            Export CSV
          </button>

          <button
            onClick={loadPayments}
            className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 cursor-pointer transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Gross Volume</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">₹{metrics.totalGross.toLocaleString('en-IN')}</div>
          <div className="text-[11px] font-bold text-slate-400">Across {metrics.totalCount} total transactions</div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Settled / Captured</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-600">₹{metrics.settledVolume.toLocaleString('en-IN')}</div>
          <div className="text-[11px] font-bold text-emerald-700">{metrics.capturedCount} completed settlements</div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Refunded</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <RotateCcw className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-purple-700">₹{metrics.refundedVolume.toLocaleString('en-IN')}</div>
          <div className="text-[11px] font-bold text-purple-600">Issued to customers</div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Active Records</span>
            <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">{metrics.totalCount}</div>
          <div className="text-[11px] font-bold text-slate-500">Payments in ledger</div>
        </div>
      </div>

      {/* Controls & Filter Bar */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* Search Input */}
          <div className="md:col-span-4 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search by Payment ID, Order #, Customer..."
              className="w-full pl-10 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                title="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Ledger Flow Direction */}
          <div className="md:col-span-3">
            <select
              value={directionFilter}
              onChange={(e) => {
                setDirectionFilter(e.target.value as any);
                setCurrentPage(1);
              }}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="ALL">All Financial Flows</option>
              <option value="CUSTOMER_PAYS">Customer Inflow (Charges)</option>
              <option value="JUNKITOUT_PAYS">Scrap Outflow (Payouts)</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="md:col-span-3">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="ALL">All Payment Statuses</option>
              <option value="CAPTURED">Captured / Settled</option>
              <option value="INITIATED">Initiated / Pending</option>
              <option value="REFUNDED">Refunded</option>
              <option value="PARTIALLY_REFUNDED">Partially Refunded</option>
              <option value="REFUND_FAILED">Refund Failed</option>
            </select>
          </div>

          {/* Sort Control */}
          <div className="md:col-span-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="DATE_DESC">Newest First</option>
              <option value="DATE_ASC">Oldest First</option>
              <option value="AMOUNT_DESC">Amount: High → Low</option>
              <option value="AMOUNT_ASC">Amount: Low → High</option>
            </select>
          </div>
        </div>

        {/* Page Size & Results Count */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-500 pt-2 border-t border-slate-100">
          <div>
            Showing <span className="font-bold text-slate-800">{totalItems}</span> matching transactions
          </div>
          <div className="flex items-center gap-2">
            <span>Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="p-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 font-bold flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-rose-600 hover:text-rose-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Payments Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden p-6 space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px]">
              <tr>
                <th className="p-3">Payment ID / Order</th>
                <th className="p-3">Flow Direction</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Method</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Status</th>
                <th className="p-3">Date</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center p-8 text-slate-400 font-semibold">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                      Loading payments ledger...
                    </div>
                  </td>
                </tr>
              ) : paginatedPayments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center p-8 text-slate-400 font-semibold">
                    No payment transactions match the active filters.
                  </td>
                </tr>
              ) : (
                paginatedPayments.map((p) => {
                  const isCustomerPays = p.direction === 'CUSTOMER_PAYS';
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3">
                        <span className="font-mono font-extrabold text-slate-900 block truncate max-w-[180px]">
                          {p.gatewayPaymentId || p.paymentId || p.gatewayOrderId || p.id}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Order #{p.orderNumber || p.orderId || '—'}
                        </span>
                        {p.razorpayRefundId && (
                          <span className="block font-mono text-[10px] text-purple-700 font-bold mt-0.5">
                            Refund: {p.razorpayRefundId}
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                            isCustomerPays
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {isCustomerPays ? (
                            <>
                              <ArrowDownLeft className="w-3 h-3 text-emerald-600" />
                              Customer Charge
                            </>
                          ) : (
                            <>
                              <ArrowUpRight className="w-3 h-3 text-amber-600" />
                              Scrap Payout
                            </>
                          )}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="font-bold text-slate-800 block">{p.customer || 'Customer'}</span>
                      </td>
                      <td className="p-3 font-bold text-slate-700">
                        {p.gateway || 'RAZORPAY'}
                      </td>
                      <td className="p-3">
                        <span className="font-black text-slate-900 text-sm">₹{p.amount}</span>
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                            p.status === 'SUCCESS' || p.status === 'CAPTURED' || p.status === 'SETTLEMENT_COMPLETED'
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
                        {p.totalRefundedAmount && p.totalRefundedAmount > 0 ? (
                          <span className="block text-[10px] text-indigo-700 font-bold mt-1">
                            Refunded: ₹{p.totalRefundedAmount} (Bal: ₹{p.remainingRefundableAmount ?? 0})
                          </span>
                        ) : null}
                      </td>
                      <td className="p-3 text-slate-500 whitespace-nowrap">
                        {p.date || (p.createdAt ? new Date(p.createdAt).toLocaleString() : 'N/A')}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setDetailsPayment(p)}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
                            title="View Transaction Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {p.status === 'CAPTURED' ||
                          p.status === 'SUCCESS' ||
                          (p.status === 'PARTIALLY_REFUNDED' && (p.remainingRefundableAmount ?? 0) > 0) ? (
                            <button
                              onClick={() => handleOpenRefundModal(p)}
                              className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold px-2.5 py-1.5 rounded-lg text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
                              title="Issue full or partial refund"
                            >
                              <RotateCcw className="w-3 h-3" />
                              {p.status === 'PARTIALLY_REFUNDED' ? 'Refund More' : 'Refund'}
                            </button>
                          ) : ['REFUND_PROCESSING', 'REFUND_PENDING', 'REFUND_PENDING_RECONCILIATION'].includes(
                              p.status
                            ) ? (
                            <button
                              onClick={() => handleCheckRefundStatus(p)}
                              className="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold px-2.5 py-1.5 rounded-lg text-[11px] cursor-pointer transition-colors"
                            >
                              Check status
                            </button>
                          ) : p.status === 'REFUND_FAILED' ? (
                            <button
                              onClick={() => handleCheckRefundStatus(p)}
                              className="bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 font-bold px-2.5 py-1.5 rounded-lg text-[11px] cursor-pointer transition-colors"
                              title="Verify with Razorpay and safely recover"
                            >
                              Reconcile
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100">
          <span className="text-xs font-semibold text-slate-500">
            Showing page {currentPage} of {totalPages} ({totalItems} total transactions)
          </span>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>

            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i + 1}
                  onClick={() => setCurrentPage(i + 1)}
                  className={`text-xs font-bold w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                    currentPage === i + 1
                      ? 'bg-emerald-600 text-white'
                      : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Transaction Details Modal */}
      {detailsPayment && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-lg">
                  💳
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Transaction Details</h3>
                  <p className="text-xs text-slate-500 font-mono">
                    {detailsPayment.gatewayPaymentId || detailsPayment.paymentId || detailsPayment.id}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailsPayment(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Transaction Status</span>
                <span
                  className={`text-xs font-black uppercase ${
                    detailsPayment.status === 'CAPTURED' || detailsPayment.status === 'SUCCESS' || detailsPayment.status === 'SETTLEMENT_COMPLETED'
                      ? 'text-emerald-700'
                      : detailsPayment.status === 'REFUNDED'
                      ? 'text-purple-700'
                      : 'text-amber-700'
                  }`}
                >
                  {detailsPayment.status}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Gross Amount</span>
                <span className="text-xs font-black text-slate-900">₹{detailsPayment.amount}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Flow Direction</span>
                <span className="text-xs font-black text-slate-800">
                  {detailsPayment.direction === 'CUSTOMER_PAYS' ? 'Customer Charge' : 'Scrap Payout'}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Gateway</span>
                <span className="text-xs font-black text-slate-800">{detailsPayment.gateway || 'RAZORPAY'}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Linked Order</span>
                <span className="text-xs font-black text-slate-900">#{detailsPayment.orderNumber || detailsPayment.orderId}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Customer</span>
                <span className="text-xs font-black text-slate-900">{detailsPayment.customer || 'Customer'}</span>
              </div>
            </div>

            {/* Refund Context if present */}
            {detailsPayment.totalRefundedAmount && detailsPayment.totalRefundedAmount > 0 ? (
              <div className="p-3 bg-purple-50 rounded-2xl border border-purple-100 text-xs text-purple-900 space-y-1">
                <span className="font-bold block">Refund Audit Breakdown:</span>
                <p className="text-[11px] text-purple-800">
                  Total Refunded: <strong>₹{detailsPayment.totalRefundedAmount}</strong> | Remaining Refundable Balance: <strong>₹{detailsPayment.remainingRefundableAmount ?? 0}</strong>
                </p>
                {detailsPayment.razorpayRefundId && (
                  <p className="font-mono text-[10px] text-purple-700">Gateway Refund ID: {detailsPayment.razorpayRefundId}</p>
                )}
              </div>
            ) : null}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setDetailsPayment(null)}
                className="w-full bg-slate-100 text-slate-700 font-bold text-xs py-3 rounded-xl hover:bg-slate-200 transition-colors"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Refund Modal */}
      {refundTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
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

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Order:</span>
                <span className="font-bold text-slate-800">#{refundTarget.orderNumber || refundTarget.orderId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Original Total:</span>
                <span className="font-bold text-slate-800">₹{refundTarget.amount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Refunded So Far:</span>
                <span className="font-bold text-indigo-700">₹{refundTarget.totalRefundedAmount || 0}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1 font-bold">
                <span className="text-slate-700">Remaining Balance:</span>
                <span className="text-emerald-700">
                  ₹{refundTarget.remainingRefundableAmount ?? refundTarget.amount ?? 0}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">Refund Amount (₹):</label>
              <input
                type="number"
                step="any"
                min="1"
                max={refundTarget.remainingRefundableAmount ?? refundTarget.amount ?? 0}
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                placeholder="Refund amount"
                disabled={refundLoading}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

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
