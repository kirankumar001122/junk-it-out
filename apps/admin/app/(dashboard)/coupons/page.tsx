'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Ticket,
  RefreshCw,
  Plus,
  Search,
  X,
  Eye,
  Trash2,
  Copy,
  Check,
  Download,
  Percent,
  DollarSign,
  Calendar,
  AlertCircle,
  Loader2,
  ShieldCheck,
  CheckCircle2,
  Power,
} from 'lucide-react';
import { adminFetch } from '@/lib/api';

interface CouponRecord {
  id: string;
  code: string;
  discountType: 'FLAT' | 'PERCENTAGE' | string;
  discountValue: number;
  minOrderValue?: number;
  maxDiscount?: number;
  active: boolean;
  expiryDate?: string | null;
  createdAt?: string;
}

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<CouponRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'FLAT' | 'PERCENTAGE'>('ALL');
  const [sortBy, setSortBy] = useState<'CODE_ASC' | 'DATE_DESC' | 'DISCOUNT_DESC' | 'DISCOUNT_ASC'>('DATE_DESC');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  // Modals State
  const [detailsCoupon, setDetailsCoupon] = useState<CouponRecord | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deleteCoupon, setDeleteCoupon] = useState<CouponRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Add Coupon Form State
  const [formData, setFormData] = useState({
    code: '',
    discountType: 'FLAT',
    discountValue: '',
    minOrderValue: '100',
    maxDiscount: '100',
    expiryDate: '',
  });
  const [formError, setFormError] = useState<string | null>(null);

  const loadCoupons = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await adminFetch('/api/admin/coupons');
      const data = await res.json();
      if (data.success) {
        setCoupons(data.data || []);
      } else {
        setErrorMsg(data.message || 'Failed to load coupons database.');
      }
    } catch (e: any) {
      console.error('Error fetching coupons:', e);
      setErrorMsg(e.message || 'Network error fetching coupons.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCoupons();
  }, []);

  // Summary Metrics
  const metrics = useMemo(() => {
    let activeCount = 0;
    let inactiveCount = 0;
    let flatSum = 0;
    let flatCount = 0;

    for (const c of coupons) {
      if (c.active) {
        activeCount++;
        if (c.discountType === 'FLAT') {
          flatSum += Number(c.discountValue) || 0;
          flatCount++;
        }
      } else {
        inactiveCount++;
      }
    }

    return {
      total: coupons.length,
      active: activeCount,
      inactive: inactiveCount,
      avgFlatDiscount: flatCount > 0 ? Math.round(flatSum / flatCount) : 50,
    };
  }, [coupons]);

  // Filtering & Sorting
  const filteredCoupons = useMemo(() => {
    return coupons
      .filter((c) => {
        // Status Filter
        if (statusFilter === 'ACTIVE' && !c.active) return false;
        if (statusFilter === 'INACTIVE' && c.active) return false;

        // Discount Type Filter
        if (typeFilter !== 'ALL' && c.discountType !== typeFilter) return false;

        // Search Query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const codeMatch = (c.code || '').toLowerCase().includes(q);
          const valMatch = String(c.discountValue || '').includes(q);
          const minMatch = String(c.minOrderValue || '').includes(q);
          return codeMatch || valMatch || minMatch;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'CODE_ASC') {
          return a.code.localeCompare(b.code);
        }
        if (sortBy === 'DISCOUNT_DESC') {
          return (Number(b.discountValue) || 0) - (Number(a.discountValue) || 0);
        }
        if (sortBy === 'DISCOUNT_ASC') {
          return (Number(a.discountValue) || 0) - (Number(b.discountValue) || 0);
        }
        // DATE_DESC
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });
  }, [coupons, statusFilter, typeFilter, searchQuery, sortBy]);

  // Pagination Calculations
  const totalItems = filteredCoupons.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginatedCoupons = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredCoupons.slice(start, start + pageSize);
  }, [filteredCoupons, currentPage, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  // Toggle Active Status
  const handleToggleStatus = async (coupon: CouponRecord) => {
    const nextActive = !coupon.active;
    try {
      const res = await adminFetch('/api/admin/coupons', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: coupon.id, active: nextActive }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg(`Coupon "${coupon.code}" marked ${nextActive ? 'ACTIVE' : 'INACTIVE'}.`);
        setTimeout(() => setSuccessMsg(null), 3000);
        loadCoupons();
      } else {
        setErrorMsg(data.message || 'Failed to update coupon status.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Network error updating coupon status.');
    }
  };

  // Create Coupon
  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanCode = formData.code.toUpperCase().trim();
    if (!cleanCode || cleanCode.length < 3 || cleanCode.length > 20) {
      setFormError('Coupon code must be between 3 and 20 alphanumeric characters.');
      return;
    }

    const val = Number(formData.discountValue);
    if (!Number.isFinite(val) || val <= 0) {
      setFormError('Discount value must be a positive number greater than 0.');
      return;
    }

    if (formData.discountType === 'PERCENTAGE' && val > 100) {
      setFormError('Percentage discount cannot exceed 100%.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await adminFetch('/api/admin/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: cleanCode,
          discountType: formData.discountType,
          discountValue: val,
          minOrderValue: Number(formData.minOrderValue) || 0,
          maxDiscount: Number(formData.maxDiscount) || val,
          expiryDate: formData.expiryDate || null,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg(`Coupon "${cleanCode}" created successfully.`);
        setTimeout(() => setSuccessMsg(null), 3000);
        setIsAddModalOpen(false);
        setFormData({
          code: '',
          discountType: 'FLAT',
          discountValue: '',
          minOrderValue: '100',
          maxDiscount: '100',
          expiryDate: '',
        });
        loadCoupons();
      } else {
        setFormError(data.message || 'Failed to create coupon.');
      }
    } catch (err: any) {
      setFormError(err.message || 'Network error creating coupon.');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Coupon
  const handleConfirmDelete = async () => {
    if (!deleteCoupon) return;
    setSubmitting(true);
    try {
      const res = await adminFetch(`/api/admin/coupons?id=${encodeURIComponent(deleteCoupon.id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg(`Coupon "${deleteCoupon.code}" deleted successfully.`);
        setTimeout(() => setSuccessMsg(null), 3000);
        setDeleteCoupon(null);
        loadCoupons();
      } else {
        setErrorMsg(data.message || 'Failed to delete coupon.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Network error deleting coupon.');
    } finally {
      setSubmitting(false);
    }
  };

  // Copy Code to Clipboard
  const handleCopyCode = (code: string) => {
    navigator.clipboard?.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Export CSV
  const handleExportCSV = () => {
    if (filteredCoupons.length === 0) return;
    const headers = ['Coupon Code', 'Discount Type', 'Discount Value', 'Min Order (INR)', 'Max Discount (INR)', 'Status', 'Expiry Date'];
    const rows = filteredCoupons.map((c) => [
      `"${c.code}"`,
      `"${c.discountType}"`,
      c.discountValue,
      c.minOrderValue || 0,
      c.maxDiscount || c.discountValue,
      `"${c.active ? 'ACTIVE' : 'INACTIVE'}"`,
      `"${c.expiryDate || 'No Expiry'}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `junkitout-coupons-export-${new Date().toISOString().slice(0, 10)}.csv`);
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
            Promotions & Marketing
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">Coupons & Promo Codes</h1>
          <p className="text-xs text-slate-500">Manage promotional discount codes, validity periods, and minimum order rules.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            onClick={handleExportCSV}
            disabled={filteredCoupons.length === 0}
            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold text-xs px-3.5 py-2.5 rounded-xl flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-40 transition-colors"
            title="Export coupons to CSV"
          >
            <Download className="w-4 h-4 text-slate-500" />
            Export CSV
          </button>

          <button
            onClick={loadCoupons}
            className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 cursor-pointer transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          <button
            onClick={() => {
              setIsAddModalOpen(true);
              setFormError(null);
            }}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-md cursor-pointer transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Coupon
          </button>
        </div>
      </div>

      {/* Global Toast Banners */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 font-bold flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-600 hover:text-emerald-800">
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
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Coupons</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Ticket className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">{metrics.total}</div>
          <div className="text-[11px] font-bold text-slate-400">All registered promo codes</div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Active Promos</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-600">{metrics.active}</div>
          <div className="text-[11px] font-bold text-emerald-700">Currently claimable at checkout</div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Inactive / Expired</span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <Power className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-rose-600">{metrics.inactive}</div>
          <div className="text-[11px] font-bold text-rose-700">Disabled or expired campaigns</div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Avg Flat Value</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-purple-700">₹{metrics.avgFlatDiscount}</div>
          <div className="text-[11px] font-bold text-purple-600">Per active flat coupon</div>
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
              placeholder="Search coupons by code or value..."
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

          {/* Status Filter */}
          <div className="md:col-span-3">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as any);
                setCurrentPage(1);
              }}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active Promos</option>
              <option value="INACTIVE">Inactive / Paused</option>
            </select>
          </div>

          {/* Discount Type Filter */}
          <div className="md:col-span-3">
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value as any);
                setCurrentPage(1);
              }}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="ALL">All Discount Types</option>
              <option value="FLAT">Flat Rupee (₹)</option>
              <option value="PERCENTAGE">Percentage (%)</option>
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
              <option value="CODE_ASC">Code (A-Z)</option>
              <option value="DISCOUNT_DESC">Discount: High → Low</option>
              <option value="DISCOUNT_ASC">Discount: Low → High</option>
            </select>
          </div>
        </div>

        {/* Page Size & Count Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-500 pt-2 border-t border-slate-100">
          <div>
            Showing <span className="font-bold text-slate-800">{totalItems}</span> matching coupons
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
              <option value={3}>3</option>
              <option value={5}>5</option>
              <option value={10}>10</option>
            </select>
          </div>
        </div>
      </div>

      {/* Coupons Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden p-6 space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px]">
              <tr>
                <th className="p-3">Coupon Code</th>
                <th className="p-3">Discount Type</th>
                <th className="p-3">Discount Value</th>
                <th className="p-3">Min Order</th>
                <th className="p-3">Max Discount</th>
                <th className="p-3">Expiry Date</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center p-8 text-slate-400 font-semibold">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                      Loading coupons database...
                    </div>
                  </td>
                </tr>
              ) : paginatedCoupons.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center p-8 text-slate-400 font-semibold">
                    No promo coupons match the active filters.
                  </td>
                </tr>
              ) : (
                paginatedCoupons.map((c) => {
                  const isPercent = c.discountType === 'PERCENTAGE';
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-emerald-700 text-sm tracking-wider">
                            {c.code}
                          </span>
                          <button
                            onClick={() => handleCopyCode(c.code)}
                            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                            title="Copy coupon code"
                          >
                            {copiedCode === c.code ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="p-3 font-semibold text-slate-700">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                            isPercent
                              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {isPercent ? <Percent className="w-3 h-3" /> : <DollarSign className="w-3 h-3" />}
                          {c.discountType}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="font-black text-slate-900 text-sm">
                          {isPercent ? `${c.discountValue}% Off` : `₹${c.discountValue} Flat`}
                        </span>
                      </td>
                      <td className="p-3 font-bold text-slate-700">₹{c.minOrderValue || 0}</td>
                      <td className="p-3 font-bold text-slate-700">
                        {isPercent ? `₹${c.maxDiscount || c.discountValue}` : '—'}
                      </td>
                      <td className="p-3 text-slate-600 whitespace-nowrap">
                        {c.expiryDate ? (
                          <span className="flex items-center gap-1 font-mono text-[11px]">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            {c.expiryDate}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">No expiry</span>
                        )}
                      </td>
                      <td className="p-3">
                        <button
                          onClick={() => handleToggleStatus(c)}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase transition-all cursor-pointer ${
                            c.active
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                              : 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                          }`}
                          title={`Click to ${c.active ? 'deactivate' : 'activate'}`}
                        >
                          {c.active ? 'ACTIVE' : 'INACTIVE'}
                        </button>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setDetailsCoupon(c)}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
                            title="View Coupon Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => setDeleteCoupon(c)}
                            className="p-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Delete Coupon"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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
            Showing page {currentPage} of {totalPages} ({totalItems} total coupons)
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

      {/* Create Coupon Modal */}
      {isAddModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                  🎟️
                </div>
                <h3 className="text-base font-extrabold text-slate-900">Create New Promo Coupon</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCoupon} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Coupon Code *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. FESTIVE2026"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono uppercase font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Discount Type</label>
                  <select
                    value={formData.discountType}
                    onChange={(e) => setFormData({ ...formData, discountType: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="FLAT">Flat Rupee (₹)</option>
                    <option value="PERCENTAGE">Percentage (%)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {formData.discountType === 'PERCENTAGE' ? 'Discount Percentage (%) *' : 'Discount Amount (₹) *'}
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    min="1"
                    max={formData.discountType === 'PERCENTAGE' ? 100 : 5000}
                    placeholder="e.g. 50"
                    value={formData.discountValue}
                    onChange={(e) => setFormData({ ...formData, discountValue: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Min Order Value (₹)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="100"
                    value={formData.minOrderValue}
                    onChange={(e) => setFormData({ ...formData, minOrderValue: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Max Discount Cap (₹)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="100"
                    value={formData.maxDiscount}
                    onChange={(e) => setFormData({ ...formData, maxDiscount: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Expiry Date (Optional)</label>
                <input
                  type="date"
                  value={formData.expiryDate}
                  onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-800">
                  {formError}
                </div>
              )}

              <div className="flex gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="w-1/2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-3 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-1/2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-3 rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {submitting ? 'Creating...' : 'Create Coupon'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Coupon Details Modal */}
      {detailsCoupon && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                  🎟️
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">{detailsCoupon.code}</h3>
                  <p className="text-xs text-slate-500">ID: {detailsCoupon.id}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailsCoupon(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Status</span>
                <span className={`text-xs font-black uppercase ${detailsCoupon.active ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {detailsCoupon.active ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Discount Type</span>
                <span className="text-xs font-black text-slate-900">{detailsCoupon.discountType}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Discount Value</span>
                <span className="text-xs font-black text-slate-900">
                  {detailsCoupon.discountType === 'PERCENTAGE' ? `${detailsCoupon.discountValue}%` : `₹${detailsCoupon.discountValue}`}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Min Order Value</span>
                <span className="text-xs font-black text-slate-900">₹{detailsCoupon.minOrderValue || 0}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Max Discount Cap</span>
                <span className="text-xs font-black text-slate-900">₹{detailsCoupon.maxDiscount || detailsCoupon.discountValue}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Expiry Date</span>
                <span className="text-xs font-black text-slate-900">{detailsCoupon.expiryDate || 'No Expiration'}</span>
              </div>
            </div>

            <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-100 text-xs text-emerald-900 space-y-1">
              <span className="font-bold block">Eligibility & Redemption Rule:</span>
              <p className="text-[11px] text-emerald-800">
                Applicable at customer pickup checkout when scrap booking order value meets or exceeds ₹{detailsCoupon.minOrderValue || 0}. Valid across all active Bengaluru service clusters.
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setDetailsCoupon(null)}
                className="w-full bg-slate-100 text-slate-700 font-bold text-xs py-3 rounded-xl hover:bg-slate-200 transition-colors"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Safe Delete Confirmation Modal */}
      {deleteCoupon && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Delete Promo Coupon</h3>
                <p className="text-xs text-slate-500">Remove code: {deleteCoupon.code}</p>
              </div>
            </div>

            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-900 space-y-1">
              <span className="font-bold block">Warning:</span>
              <p className="text-[11px] text-rose-800">
                Deleting coupon <strong>{deleteCoupon.code}</strong> will permanently remove it from the promotions directory. Customers will no longer be able to apply this code at checkout.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteCoupon(null)}
                disabled={submitting}
                className="w-1/2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-3 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={submitting}
                className="w-1/2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-3 rounded-xl shadow-md flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {submitting ? 'Deleting...' : 'Delete Coupon'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
