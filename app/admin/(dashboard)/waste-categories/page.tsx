'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, RefreshCw, AlertCircle, CheckCircle, XCircle } from 'lucide-react';

export default function AdminWasteCategoriesPage() {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newRate, setNewRate] = useState<number>(0);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Add Category Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [addName, setAddName] = useState('');
  const [addDescription, setAddDescription] = useState('');
  const [addType, setAddType] = useState('RECYCLABLE_BUY');
  const [addPrice, setAddPrice] = useState(20);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const isSubmittingRef = useRef(false);

  const loadCategories = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/waste-categories');
      const data = await res.json();
      if (data.success) {
        setCategories(data.data || []);
      } else {
        setError(data.error?.message || data.message || 'Failed to load waste categories.');
      }
    } catch {
      setError('Network error while loading waste categories.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  // Keyboard accessibility and body scroll lock for modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowAddModal(false);
        setAddError(null);
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

  const handleSaveRate = async (id: string) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setActionLoadingId(id);

    try {
      const res = await fetch('/api/waste-categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, pricePerKg: Number(newRate) }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setEditingId(null);
        await loadCategories();
      } else {
        alert(data?.error?.message || data?.message || 'Failed to update pricing rate.');
      }
    } catch {
      alert('Network error while saving category rate.');
    } finally {
      setActionLoadingId(null);
      isSubmittingRef.current = false;
    }
  };

  const handleToggleStatus = async (cat: any) => {
    if (isSubmittingRef.current || actionLoadingId) return;
    isSubmittingRef.current = true;
    setActionLoadingId(cat.id);

    const nextActive = !cat.active;
    try {
      const res = await fetch('/api/waste-categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cat.id, active: nextActive }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        await loadCategories();
      } else {
        alert(data?.error?.message || data?.message || 'Failed to update category activation.');
      }
    } catch {
      alert('Network error while updating category status.');
    } finally {
      setActionLoadingId(null);
      isSubmittingRef.current = false;
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current || addLoading || !addName.trim() || !addDescription.trim()) return;

    isSubmittingRef.current = true;
    setAddLoading(true);
    setAddError(null);

    try {
      const res = await fetch('/api/waste-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: addName.trim(),
          description: addDescription.trim(),
          type: addType,
          pricePerKg: Number(addPrice) || 0,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setShowAddModal(false);
        setAddName('');
        setAddDescription('');
        setAddPrice(20);
        await loadCategories();
      } else {
        setAddError(data?.error?.message || data?.message || 'Failed to create waste category.');
      }
    } catch {
      setAddError('Network error while creating category.');
    } finally {
      isSubmittingRef.current = false;
      setAddLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
        <div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase">
            Rate Catalog & Scrap Pricing
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">Waste Categories & Rate Manager</h1>
          <p className="text-xs text-slate-500">Update per-kg buying rates, manage active catalog items, and add scrap types in DB</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadCategories}
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
            ADD CATEGORY
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-2xl text-xs font-bold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden p-6">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-xs font-medium space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-600" />
            <p>Loading waste categories catalog from PostgreSQL...</p>
          </div>
        ) : categories.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <p className="font-bold text-slate-700 text-sm">No waste categories found.</p>
            <p className="text-xs text-slate-500">Click &quot;Add Category&quot; to seed or add a new scrap category.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px]">
                <tr>
                  <th className="p-3">Category Name</th>
                  <th className="p-3">Description</th>
                  <th className="p-3">Financial Model</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Current Rate (₹/kg)</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {categories.map((cat) => {
                  const isActionLoading = actionLoadingId === cat.id;

                  return (
                    <tr key={cat.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 font-extrabold text-slate-900 text-sm">{cat.name}</td>
                      <td className="p-3 text-slate-600 max-w-xs leading-relaxed">{cat.description}</td>
                      <td className="p-3">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                            cat.type === 'RECYCLABLE_BUY'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-orange-100 text-orange-800'
                          }`}
                        >
                          {cat.type === 'RECYCLABLE_BUY' ? 'We Pay Customer' : 'Customer Pays Fee'}
                        </span>
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                            cat.active
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {cat.active ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>
                      <td className="p-3 font-black text-sm text-slate-900">
                        {editingId === cat.id ? (
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={isNaN(newRate) ? '' : newRate}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              setNewRate(isNaN(val) ? 0 : val);
                            }}
                            className="w-24 bg-slate-50 border border-slate-300 rounded-lg p-1.5 text-xs font-bold"
                          />
                        ) : cat.pricePerKg === 0 ? (
                          <span className="text-emerald-700 font-extrabold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-xs">FREE</span>
                        ) : (
                          `₹${cat.pricePerKg} / kg`
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {editingId === cat.id ? (
                            <>
                              <button
                                onClick={() => handleSaveRate(cat.id)}
                                disabled={isActionLoading}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs disabled:opacity-50 inline-flex items-center gap-1"
                              >
                                {isActionLoading && <RefreshCw className="w-3 h-3 animate-spin" />}
                                Save
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                disabled={isActionLoading}
                                className="bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-lg text-xs"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingId(cat.id);
                                setNewRate(cat.pricePerKg);
                              }}
                              disabled={isActionLoading}
                              className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-3 py-1.5 rounded-lg text-xs"
                            >
                              Edit Rate
                            </button>
                          )}

                          <button
                            onClick={() => handleToggleStatus(cat)}
                            disabled={isActionLoading}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1 ${
                              cat.active
                                ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                            }`}
                          >
                            {isActionLoading && <RefreshCw className="w-3 h-3 animate-spin" />}
                            {cat.active ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Waste Category Modal */}
      {showAddModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add New Waste Category"
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 overflow-y-auto"
        >
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm cursor-pointer"
            onClick={() => {
              setShowAddModal(false);
              setAddError(null);
            }}
            aria-hidden="true"
          />
          <form onSubmit={handleCreateCategory} className="relative bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl z-10 my-auto">
            <h3 className="text-base font-extrabold text-slate-900">Add New Waste Category</h3>
            <p className="text-xs text-slate-500">Configure category details and base scrap buying rate</p>

            {addError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{addError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">Category Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Copper Scrap"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">Description</label>
              <textarea
                required
                rows={2}
                placeholder="e.g. Pure electrical wire scrap, copper tubes, stripped coils"
                value={addDescription}
                onChange={(e) => setAddDescription(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-medium"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">Financial Model</label>
                <select
                  value={addType}
                  onChange={(e) => setAddType(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold"
                >
                  <option value="RECYCLABLE_BUY">We Pay Customer</option>
                  <option value="WASTE_CHARGE">Customer Pays Fee</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">Price (₹/kg)</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  required
                  value={addPrice}
                  onChange={(e) => setAddPrice(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                disabled={addLoading}
                className="w-1/2 bg-slate-100 text-slate-700 font-bold text-xs py-3 rounded-xl hover:bg-slate-200 disabled:opacity-50"
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
                  <span>Create Category</span>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
