'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  FileBarChart,
  Download,
  RefreshCw,
  Calendar,
  Filter,
  CheckCircle2,
  Clock,
  Truck,
  RotateCcw,
  DollarSign,
  AlertCircle,
  FileSpreadsheet,
  PieChart,
  TrendingUp,
  X,
  Loader2,
} from 'lucide-react';
import { adminFetch } from '@/lib/api';

interface OrderItem {
  id: string;
  orderNumber: string;
  createdAt: string;
  status: string;
  estimatedTotal?: number;
  finalAmount?: number;
  customer?: { user?: { name?: string; phone?: string } };
  agent?: { user?: { name?: string } };
  address?: { area?: string };
}

export default function AdminReportsPage() {
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [limit, setLimit] = useState<number>(500);
  const [dateValidationErr, setDateValidationErr] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await adminFetch('/api/admin/reports?format=json');
      const data = await res.json();
      if (data.success && data.data) {
        setOrders(data.data.orders || data.data || []);
      }
    } catch (err: any) {
      console.error('Error loading reports data:', err);
      setErrorMsg(err.message || 'Failed to fetch operational report records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Summary Metrics
  const metrics = useMemo(() => {
    let totalEst = 0;
    let totalFinal = 0;
    let completedCount = 0;
    let activePipeline = 0;

    const statusCounts: Record<string, number> = {
      BOOKING_RECEIVED: 0,
      AGENT_ASSIGNED: 0,
      PICKUP_COMPLETED: 0,
      CANCELLED: 0,
    };

    for (const o of orders) {
      totalEst += Number(o.estimatedTotal) || 0;
      totalFinal += Number(o.finalAmount) || 0;
      const st = o.status || 'BOOKING_RECEIVED';
      statusCounts[st] = (statusCounts[st] || 0) + 1;

      if (st === 'PICKUP_COMPLETED') {
        completedCount++;
      } else if (['BOOKING_RECEIVED', 'AGENT_ASSIGNED', 'COLLECTING', 'ARRIVED'].includes(st)) {
        activePipeline++;
      }
    }

    return {
      totalOrders: orders.length,
      totalVolume: Math.round(totalFinal > 0 ? totalFinal : totalEst),
      completedCount,
      activePipeline,
      statusCounts,
    };
  }, [orders]);

  // Date Range Quick Preset Helpers
  const handleSetPreset = (preset: 'ALL' | 'TODAY' | '7D' | '30D') => {
    setDateValidationErr(null);
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    if (preset === 'ALL') {
      setStartDate('');
      setEndDate('');
    } else if (preset === 'TODAY') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === '7D') {
      const past = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      setStartDate(past.toISOString().split('T')[0]);
      setEndDate(todayStr);
    } else if (preset === '30D') {
      const past = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      setStartDate(past.toISOString().split('T')[0]);
      setEndDate(todayStr);
    }
  };

  // Reset all filters
  const handleResetFilters = () => {
    setStatusFilter('ALL');
    setStartDate('');
    setEndDate('');
    setLimit(500);
    setDateValidationErr(null);
  };

  // Validate date range
  const handleStartDateChange = (val: string) => {
    setStartDate(val);
    if (val && endDate && new Date(val) > new Date(endDate)) {
      setDateValidationErr('Start date cannot be after end date.');
    } else {
      setDateValidationErr(null);
    }
  };

  const handleEndDateChange = (val: string) => {
    setEndDate(val);
    if (startDate && val && new Date(startDate) > new Date(val)) {
      setDateValidationErr('Start date cannot be after end date.');
    } else {
      setDateValidationErr(null);
    }
  };

  // Build CSV Export URL
  const exportUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (statusFilter && statusFilter !== 'ALL') params.set('status', statusFilter);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (limit) params.set('limit', String(limit));
    const qs = params.toString();
    return `/api/admin/reports${qs ? `?${qs}` : ''}`;
  }, [statusFilter, startDate, endDate, limit]);

  // Download Handler & Verification
  const handleDownloadReport = async () => {
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      setDateValidationErr('Start date cannot be after end date.');
      return;
    }

    setDownloading(true);
    setDownloadSuccess(null);
    try {
      const res = await adminFetch(exportUrl);
      if (!res.ok) {
        throw new Error(`Failed to generate CSV export (${res.status})`);
      }
      const text = await res.text();
      const lines = text.trim().split('\n');
      const rowCount = Math.max(0, lines.length - 1);

      // Trigger client file download
      const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `junkitout_orders_report_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setDownloadSuccess(`Export completed: ${rowCount} order records successfully downloaded.`);
      setTimeout(() => setDownloadSuccess(null), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error downloading CSV report.');
    } finally {
      setDownloading(false);
    }
  };

  // Filtered orders for live preview
  const previewOrders = useMemo(() => {
    return orders.filter((o) => {
      if (statusFilter !== 'ALL' && o.status !== statusFilter) return false;
      if (startDate) {
        const orderDate = new Date(o.createdAt).toISOString().split('T')[0];
        if (orderDate < startDate) return false;
      }
      if (endDate) {
        const orderDate = new Date(o.createdAt).toISOString().split('T')[0];
        if (orderDate > endDate) return false;
      }
      return true;
    });
  }, [orders, statusFilter, startDate, endDate]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase tracking-wider">
            Data Exports & Advanced Analytics
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">Reports & Analytics Hub</h1>
          <p className="text-xs text-slate-500">Operational performance, pickup order ledgers, and real-time revenue analytics.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            onClick={loadData}
            className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 cursor-pointer transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh Analytics
          </button>

          <button
            onClick={handleDownloadReport}
            disabled={downloading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-md flex items-center gap-2 cursor-pointer transition-colors disabled:opacity-50"
          >
            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {downloading ? 'Exporting...' : 'Quick Download (All)'}
          </button>
        </div>
      </div>

      {/* Global Toast Banners */}
      {downloadSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 font-bold flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{downloadSuccess}</span>
          </div>
          <button onClick={() => setDownloadSuccess(null)} className="text-emerald-600 hover:text-emerald-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 font-bold flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-rose-600 hover:text-rose-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Pickups</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <FileBarChart className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">{metrics.totalOrders}</div>
          <div className="text-[11px] font-bold text-slate-400">All recorded customer bookings</div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Gross Scrap Volume</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-600">₹{metrics.totalVolume.toLocaleString('en-IN')}</div>
          <div className="text-[11px] font-bold text-emerald-700">Realized scrap transaction value</div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Completed Pickups</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-purple-700">{metrics.completedCount}</div>
          <div className="text-[11px] font-bold text-purple-600">Collected and verified orders</div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Active Pipeline</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-amber-600">{metrics.activePipeline}</div>
          <div className="text-[11px] font-bold text-amber-700">In dispatch / assigned transit</div>
        </div>
      </div>

      {/* Interactive Charts & Analytics Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Status Distribution Bar & Legend */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PieChart className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                Order Pipeline by Status
              </h3>
            </div>
            <span className="text-[11px] text-slate-400 font-bold">{metrics.totalOrders} Total Orders</span>
          </div>

          {/* Visual Distribution Bar */}
          <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden flex">
            {metrics.totalOrders > 0 ? (
              <>
                <div
                  style={{ width: `${(metrics.statusCounts.BOOKING_RECEIVED / metrics.totalOrders) * 100}%` }}
                  className="bg-amber-400 transition-all"
                  title={`Received: ${metrics.statusCounts.BOOKING_RECEIVED}`}
                />
                <div
                  style={{ width: `${(metrics.statusCounts.AGENT_ASSIGNED / metrics.totalOrders) * 100}%` }}
                  className="bg-blue-500 transition-all"
                  title={`Assigned: ${metrics.statusCounts.AGENT_ASSIGNED}`}
                />
                <div
                  style={{ width: `${(metrics.statusCounts.PICKUP_COMPLETED / metrics.totalOrders) * 100}%` }}
                  className="bg-emerald-500 transition-all"
                  title={`Completed: ${metrics.statusCounts.PICKUP_COMPLETED}`}
                />
                <div
                  style={{ width: `${(metrics.statusCounts.CANCELLED / metrics.totalOrders) * 100}%` }}
                  className="bg-rose-400 transition-all"
                  title={`Cancelled: ${metrics.statusCounts.CANCELLED}`}
                />
              </>
            ) : null}
          </div>

          {/* Legend and Selectable Filtering */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-2">
            <button
              onClick={() => setStatusFilter(statusFilter === 'BOOKING_RECEIVED' ? 'ALL' : 'BOOKING_RECEIVED')}
              className={`p-2.5 rounded-xl border text-left transition-all ${
                statusFilter === 'BOOKING_RECEIVED'
                  ? 'border-amber-400 bg-amber-50 text-amber-900 font-bold'
                  : 'border-slate-100 bg-slate-50 hover:bg-slate-100 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
                <span className="text-[10px] font-extrabold uppercase">Received</span>
              </div>
              <span className="text-base font-black">{metrics.statusCounts.BOOKING_RECEIVED || 0}</span>
            </button>

            <button
              onClick={() => setStatusFilter(statusFilter === 'AGENT_ASSIGNED' ? 'ALL' : 'AGENT_ASSIGNED')}
              className={`p-2.5 rounded-xl border text-left transition-all ${
                statusFilter === 'AGENT_ASSIGNED'
                  ? 'border-blue-400 bg-blue-50 text-blue-900 font-bold'
                  : 'border-slate-100 bg-slate-50 hover:bg-slate-100 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
                <span className="text-[10px] font-extrabold uppercase">Assigned</span>
              </div>
              <span className="text-base font-black">{metrics.statusCounts.AGENT_ASSIGNED || 0}</span>
            </button>

            <button
              onClick={() => setStatusFilter(statusFilter === 'PICKUP_COMPLETED' ? 'ALL' : 'PICKUP_COMPLETED')}
              className={`p-2.5 rounded-xl border text-left transition-all ${
                statusFilter === 'PICKUP_COMPLETED'
                  ? 'border-emerald-400 bg-emerald-50 text-emerald-900 font-bold'
                  : 'border-slate-100 bg-slate-50 hover:bg-slate-100 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                <span className="text-[10px] font-extrabold uppercase">Completed</span>
              </div>
              <span className="text-base font-black">{metrics.statusCounts.PICKUP_COMPLETED || 0}</span>
            </button>

            <button
              onClick={() => setStatusFilter(statusFilter === 'CANCELLED' ? 'ALL' : 'CANCELLED')}
              className={`p-2.5 rounded-xl border text-left transition-all ${
                statusFilter === 'CANCELLED'
                  ? 'border-rose-400 bg-rose-50 text-rose-900 font-bold'
                  : 'border-slate-100 bg-slate-50 hover:bg-slate-100 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-400 inline-block" />
                <span className="text-[10px] font-extrabold uppercase">Cancelled</span>
              </div>
              <span className="text-base font-black">{metrics.statusCounts.CANCELLED || 0}</span>
            </button>
          </div>
        </div>

        {/* Chart 2: Realized Financial Valuation Overview */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                Operational Financial Volume
              </h3>
            </div>
            <span className="text-[11px] text-emerald-700 font-bold">Bangalore Logistics</span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
              <span className="text-[10px] font-extrabold uppercase text-slate-400 block">Gross Realized Value</span>
              <span className="text-xl font-black text-slate-900">₹{metrics.totalVolume.toLocaleString('en-IN')}</span>
              <p className="text-[11px] text-slate-500">Across verified weighments</p>
            </div>

            <div className="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-100 space-y-1">
              <span className="text-[10px] font-extrabold uppercase text-emerald-700 block">Fulfillment Rate</span>
              <span className="text-xl font-black text-emerald-700">
                {metrics.totalOrders > 0
                  ? `${Math.round((metrics.completedCount / metrics.totalOrders) * 100)}%`
                  : '100%'}
              </span>
              <p className="text-[11px] text-emerald-800">Closed pickup orders</p>
            </div>
          </div>

          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-xs text-slate-600">
            <span className="font-bold text-slate-800 block mb-0.5">Automated Ledger Invariant:</span>
            All historical bookings are immutable and streamed in batches of 500 records directly into RFC-4180 standard CSV files.
          </div>
        </div>
      </div>

      {/* Custom Report Export Generator */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
              Custom Order Export Generator
            </h2>
            <p className="text-xs text-slate-500">Configure parameters to generate filtered CSV exports.</p>
          </div>

          {/* Date Range Quick Presets */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-400 mr-1">Presets:</span>
            <button
              onClick={() => handleSetPreset('ALL')}
              className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-colors ${
                !startDate && !endDate ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              All Time
            </button>
            <button
              onClick={() => handleSetPreset('TODAY')}
              className="text-[11px] font-bold px-2.5 py-1 rounded-lg border bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 transition-colors"
            >
              Today
            </button>
            <button
              onClick={() => handleSetPreset('7D')}
              className="text-[11px] font-bold px-2.5 py-1 rounded-lg border bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 transition-colors"
            >
              Last 7 Days
            </button>
            <button
              onClick={() => handleSetPreset('30D')}
              className="text-[11px] font-bold px-2.5 py-1 rounded-lg border bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 transition-colors"
            >
              Last 30 Days
            </button>
          </div>
        </div>

        {/* Generator Controls Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-semibold">
          <div>
            <label className="block text-slate-700 mb-1 font-bold">Status Filter:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="ALL">All Statuses (Combined)</option>
              <option value="BOOKING_RECEIVED">BOOKING_RECEIVED</option>
              <option value="AGENT_ASSIGNED">AGENT_ASSIGNED</option>
              <option value="PICKUP_COMPLETED">PICKUP_COMPLETED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-700 mb-1 font-bold">Start Date:</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => handleStartDateChange(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-slate-700 mb-1 font-bold">End Date:</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => handleEndDateChange(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-slate-700 mb-1 font-bold">Export Limit (Rows):</label>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value={100}>100 records</option>
              <option value={500}>500 records (Default)</option>
              <option value={1000}>1,000 records</option>
              <option value={5000}>5,000 records</option>
              <option value={50000}>50,000 records (Max)</option>
            </select>
          </div>
        </div>

        {/* Date Validation Alert */}
        {dateValidationErr && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{dateValidationErr}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <button
            onClick={handleResetFilters}
            className="text-xs font-bold text-slate-600 hover:text-slate-800 flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Parameters
          </button>

          <button
            onClick={handleDownloadReport}
            disabled={downloading || Boolean(dateValidationErr)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-md flex items-center gap-2 cursor-pointer transition-colors disabled:opacity-50"
          >
            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {downloading ? 'Streaming CSV...' : 'Download Filtered CSV Report'}
          </button>
        </div>
      </div>

      {/* Live Matching Orders Preview Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
              Live Report Preview (Matching Orders)
            </h3>
            <p className="text-xs text-slate-500">
              Showing top records that match the active filter criteria.
            </p>
          </div>
          <span className="text-xs font-bold text-slate-500">
            {previewOrders.length} matching order(s)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px]">
              <tr>
                <th className="p-3">Order Number</th>
                <th className="p-3">Date</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Service Area</th>
                <th className="p-3">Status</th>
                <th className="p-3">Estimated Total</th>
                <th className="p-3">Final Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center p-8 text-slate-400 font-semibold">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                      Loading orders data preview...
                    </div>
                  </td>
                </tr>
              ) : previewOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center p-8 text-slate-400 font-semibold">
                    No orders match the selected filters or date range.
                  </td>
                </tr>
              ) : (
                previewOrders.slice(0, 5).map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3 font-mono font-bold text-slate-900">{o.orderNumber}</td>
                    <td className="p-3 text-slate-500 whitespace-nowrap">
                      {new Date(o.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-3 font-bold text-slate-800">{o.customer?.user?.name || 'Customer'}</td>
                    <td className="p-3 text-slate-600">{o.address?.area || 'Bengaluru Cluster'}</td>
                    <td className="p-3">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                          o.status === 'PICKUP_COMPLETED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : o.status === 'AGENT_ASSIGNED'
                            ? 'bg-blue-100 text-blue-800'
                            : o.status === 'CANCELLED'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {o.status}
                      </span>
                    </td>
                    <td className="p-3 font-bold text-slate-700">₹{o.estimatedTotal || 0}</td>
                    <td className="p-3 font-black text-slate-900">₹{o.finalAmount || o.estimatedTotal || 0}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Available Standard Reports Directory */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
          Standard Report Downloads
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-semibold">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span className="font-extrabold text-slate-900 text-sm">Orders & Pickups Log</span>
              </div>
              <p className="text-slate-500 text-[11px]">
                Complete historical pickup orders CSV including customer contacts, areas, and agent assignments.
              </p>
            </div>
            <a
              href="/api/admin/reports"
              download
              className="text-emerald-700 font-bold hover:underline flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              Download Full CSV
            </a>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                <span className="font-extrabold text-slate-900 text-sm">Completed Pickups Report</span>
              </div>
              <p className="text-slate-500 text-[11px]">
                Filtered audit log of successfully collected and settled pickup orders.
              </p>
            </div>
            <a
              href="/api/admin/reports?status=PICKUP_COMPLETED"
              download
              className="text-emerald-700 font-bold hover:underline flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              Download Completed CSV
            </a>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Truck className="w-4 h-4 text-emerald-600" />
                <span className="font-extrabold text-slate-900 text-sm">Assigned & In-Transit</span>
              </div>
              <p className="text-slate-500 text-[11px]">
                Active agent dispatch queue for operations dispatch tracking.
              </p>
            </div>
            <a
              href="/api/admin/reports?status=AGENT_ASSIGNED"
              download
              className="text-emerald-700 font-bold hover:underline flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              Download Queue CSV
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
