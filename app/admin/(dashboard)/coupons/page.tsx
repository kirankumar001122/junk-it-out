'use client';

import { useState, useEffect, useRef } from 'react';
import { Ticket, Plus, RefreshCw, AlertCircle } from 'lucide-react';

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newVal, setNewVal] = useState(50);
  const [minOrder, setMinOrder] = useState(100);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // In-flight concurrency guards
  const addInFlightRef = useRef(false);
  const isTogglingRef = useRef<string | null>(null);
  const [togglingCouponId, setTogglingCouponId] = useState<string | null>(null);

  const loadCoupons = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/coupons');
      const data = await res.json();
      if (data.success) {
        setCoupons(data.data);
      } else {
        setError(data.message || 'Failed to fetch coupons.');
      }
    } catch (e: any) {
      setError(e.message || 'Database error.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCoupons();
  }, []);

  // Keyboard accessibility and body scroll lock for modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowAddModal(false);
      }
    };
    if (showAddModal) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [showAddModal]);

  const toggleCoupon = async (id: string, currentActive: boolean) => {
    if (isTogglingRef.current) return;
    isTogglingRef.current = id;
    setTogglingCouponId(id);

    try {
      const res = await fetch('/api/admin/coupons', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, active: !currentActive }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        await loadCoupons();
      } else {
        alert(data?.message || 'Failed to update coupon status.');
      }
    } catch (e) {
      console.error(e);
      alert('Network error while updating coupon status.');
    } finally {
      isTogglingRef.current = null;
      setTogglingCouponId(null);
    }
  };

  const handleAddCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (addInFlightRef.current || addLoading || !newCode.trim()) return;

    addInFlightRef.current = true;
    setAddLoading(true);
    setAddError(null);

    try {
      const res = await fetch('/api/admin/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: newCode.trim().toUpperCase(),
          discountType: 'FLAT',
          discountValue: newVal,
          minOrderValue: minOrder,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setNewCode('');
        setShowAddModal(false);
        await loadCoupons();
      } else {
        setAddError(data?.error?.message || data?.message || 'Failed to create coupon.');
      }
    } catch (e) {
      console.error(e);
      setAddError('Network error while creating coupon.');
    } finally {
      addInFlightRef.current = false;
      setAddLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
        <div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase">
            Promotions & Rewards
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">Coupons & Promo Codes</h1>
          <p className="text-xs text-slate-500">Create and manage promotional discount codes stored in Prisma DB</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadCoupons}
            disabled={loading}
            className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-md flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            CREATE NEW COUPON
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-xs font-medium">
            Loading coupons from database...
          </div>
        ) : error ? (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 p-6 rounded-2xl text-center space-y-2">
            <AlertCircle className="w-6 h-6 mx-auto text-rose-600" />
            <p className="text-xs font-bold">{error}</p>
            <button onClick={loadCoupons} className="bg-rose-600 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg">
              Retry
            </button>
          </div>
        ) : coupons.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <Ticket className="w-10 h-10 mx-auto text-slate-300" />
            <p className="font-bold text-slate-700 text-sm">No coupons available.</p>
            <p className="text-xs text-slate-500">Click "Create New Coupon" to add promotional codes to the database.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px]">
                <tr>
                  <th className="p-3">Coupon Code</th>
                  <th className="p-3">Discount Type</th>
                  <th className="p-3">Discount Value</th>
                  <th className="p-3">Min Order Value</th>
                  <th className="p-3">Expiry Date</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {coupons.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-mono font-black text-emerald-700 text-sm">{c.code}</td>
                    <td className="p-3 font-bold text-slate-800">{c.discountType}</td>
                    <td className="p-3 font-black text-slate-900">
                      {c.discountType === 'FLAT' ? `₹${c.discountValue}` : `${c.discountValue}%`}
                    </td>
                    <td className="p-3 font-bold text-slate-700">₹{c.minOrderValue}</td>
                    <td className="p-3 text-slate-500 font-mono">{c.expiryDate}</td>
                    <td className="p-3">
                      <span
                        className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase ${
                          c.active ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {c.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => toggleCoupon(c.id, c.active)}
                        disabled={togglingCouponId === c.id}
                        className={`text-xs font-bold px-3 py-1.5 rounded-lg border inline-flex items-center gap-1.5 disabled:opacity-50 transition-colors ${
                          c.active
                            ? 'border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100'
                            : 'border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                        }`}
                      >
                        {togglingCouponId === c.id && <RefreshCw className="w-3 h-3 animate-spin shrink-0" />}
                        <span>{c.active ? 'Deactivate' : 'Activate'}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAddModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Create Promo Coupon"
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 overflow-y-auto"
        >
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm cursor-pointer"
            onClick={() => setShowAddModal(false)}
            aria-hidden="true"
          />
          <form onSubmit={handleAddCoupon} className="relative bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl z-10 my-auto">
            <h3 className="text-base font-extrabold text-slate-900">Create Promo Coupon</h3>

            {addError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{addError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">Coupon Code</label>
              <input
                type="text"
                required
                placeholder="e.g. BENGALURU100"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold uppercase"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">Discount Amount (₹)</label>
              <input
                type="number"
                required
                value={isNaN(newVal) ? '' : newVal}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setNewVal(isNaN(val) ? 0 : val);
                }}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">Min Order Value (₹)</label>
              <input
                type="number"
                required
                value={isNaN(minOrder) ? '' : minOrder}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setMinOrder(isNaN(val) ? 0 : val);
                }}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                disabled={addLoading}
                className="w-1/2 bg-slate-100 text-slate-700 font-bold text-xs py-3 rounded-xl disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addLoading}
                className="w-1/2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-3 rounded-xl shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {addLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Creating...</span>
                  </>
                ) : (
                  <span>Create Coupon</span>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
