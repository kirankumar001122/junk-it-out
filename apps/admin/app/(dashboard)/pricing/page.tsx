'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { adminFetch } from '@/lib/api';
import {
  Tag,
  ShieldCheck,
  Search,
  Plus,
  RefreshCw,
  Edit2,
  Trash2,
  Eye,
  Check,
  X,
  AlertCircle,
  CheckCircle2,
  DollarSign,
  TrendingUp,
  Percent,
  Sliders,
  Sparkles,
  Layers,
  ArrowUpDown,
  Filter,
} from 'lucide-react';

interface PricingConfig {
  basePickupCharge: number;
  minPickupCharge: number;
  urgentSurcharge: number;
  weekendFee: number;
  heavyItemHandlingFee: number;
  eWasteHandlingFee: number;
}

interface WasteItem {
  id: string;
  name: string;
  category?: string;
  pricePerKg?: number;
  type?: 'RECYCLABLE_BUY' | 'WASTE_CHARGE' | string;
  isActive?: boolean;
  description?: string;
  icon?: string;
  imageUrl?: string;
}

const DEFAULT_CONFIG: PricingConfig = {
  basePickupCharge: 50,
  minPickupCharge: 50,
  urgentSurcharge: 29,
  weekendFee: 19,
  heavyItemHandlingFee: 199,
  eWasteHandlingFee: 49,
};

export default function AdminPricingPage() {
  // System Fees State
  const [config, setConfig] = useState<PricingConfig>(DEFAULT_CONFIG);
  const [editedConfig, setEditedConfig] = useState<PricingConfig>(DEFAULT_CONFIG);
  const [savingConfig, setSavingConfig] = useState(false);

  // Scrap Materials Rates State
  const [items, setItems] = useState<WasteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [sortBy, setSortBy] = useState<'name' | 'priceAsc' | 'priceDesc'>('name');

  // Inline Rate Editing State
  const [inlineRates, setInlineRates] = useState<Record<string, number>>({});
  const [savingInlineId, setSavingInlineId] = useState<string | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  // Feedback State
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modals State
  const [detailsItem, setDetailsItem] = useState<WasteItem | null>(null);
  const [editItem, setEditItem] = useState<WasteItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<WasteItem | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [submittingModal, setSubmittingModal] = useState(false);

  // Form Data for Add / Edit
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    category: 'Recyclables',
    pricePerKg: 20,
    unit: 'kg',
    type: 'RECYCLABLE_BUY',
    description: '',
    isActive: true,
  });

  const isFetchingRef = useRef(false);

  // Fetch both System Fees and Scrap Rates
  const fetchData = async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setLoading(true);
    setErrorMsg(null);

    try {
      // 1. Fetch System Pricing Rules
      const configRes = await adminFetch('/api/admin/pricing');
      if (configRes.ok) {
        const configJson = await configRes.json().catch(() => ({}));
        const data = configJson.data || configJson;
        if (data && typeof data.basePickupCharge === 'number') {
          const loadedConfig = {
            basePickupCharge: Number(data.basePickupCharge ?? 50),
            minPickupCharge: Number(data.minPickupCharge ?? 50),
            urgentSurcharge: Number(data.urgentSurcharge ?? 29),
            weekendFee: Number(data.weekendFee ?? 19),
            heavyItemHandlingFee: Number(data.heavyItemHandlingFee ?? 199),
            eWasteHandlingFee: Number(data.eWasteHandlingFee ?? 49),
          };
          setConfig(loadedConfig);
          setEditedConfig(loadedConfig);
        }
      }

      // 2. Fetch Scrap Material Rates
      const itemsRes = await adminFetch('/api/waste-categories');
      if (itemsRes.ok) {
        const itemsJson = await itemsRes.json().catch(() => ({}));
        const raw = itemsJson.data || itemsJson;
        if (Array.isArray(raw)) {
          setItems(raw);
          const initialInline: Record<string, number> = {};
          raw.forEach((it) => {
            initialInline[it.id] = it.pricePerKg ?? 0;
          });
          setInlineRates(initialInline);
        }
      }
    } catch (err: any) {
      console.error('Failed to load pricing data:', err);
      setErrorMsg(err.message || 'Error loading pricing data.');
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Save System Fees
  const handleSaveSystemFees = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingConfig) return;
    setSavingConfig(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await adminFetch('/api/admin/pricing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editedConfig),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error?.message || json?.message || 'Failed to update system pricing.');
      }

      setConfig(editedConfig);
      setSuccessMsg('System service fee rules updated successfully.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update system pricing.');
    } finally {
      setSavingConfig(false);
    }
  };

  // Reset System Fees Form
  const handleResetSystemFees = () => {
    setEditedConfig(config);
  };

  // Save Inline Scrap Rate
  const handleSaveInlineRate = async (item: WasteItem) => {
    const newRate = inlineRates[item.id];
    if (newRate === undefined || Number.isNaN(newRate) || newRate < 0) {
      setErrorMsg('Invalid price value. Must be a non-negative number.');
      return;
    }

    setSavingInlineId(item.id);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await adminFetch('/api/waste-categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          pricePerKg: Number(newRate),
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error?.message || json?.message || 'Failed to save rate.');
      }

      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, pricePerKg: Number(newRate) } : i))
      );
      setSuccessMsg(`Rate for "${item.name}" updated to ₹${newRate}/kg.`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update rate.');
    } finally {
      setSavingInlineId(null);
    }
  };

  // Toggle Material Status
  const handleToggleStatus = async (item: WasteItem) => {
    const nextStatus = !item.isActive;
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await adminFetch('/api/waste-categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          isActive: nextStatus,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error?.message || json?.message || 'Failed to toggle status.');
      }

      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, isActive: nextStatus } : i))
      );
      setSuccessMsg(`Status for "${item.name}" set to ${nextStatus ? 'Active' : 'Inactive'}.`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update status.');
    }
  };

  // Open Edit Modal
  const openEditModal = (item: WasteItem) => {
    setEditItem(item);
    setFormData({
      id: item.id,
      name: item.name,
      category: item.category || 'Recyclables',
      pricePerKg: item.pricePerKg ?? 0,
      unit: 'kg',
      type: item.type || 'RECYCLABLE_BUY',
      description: item.description || '',
      isActive: item.isActive !== false,
    });
  };

  // Handle Update Material Modal
  const handleUpdateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editItem || submittingModal) return;
    setSubmittingModal(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await adminFetch('/api/waste-categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editItem.id,
          name: formData.name.trim(),
          category: formData.category,
          pricePerKg: Number(formData.pricePerKg),
          type: formData.type,
          description: formData.description.trim(),
          isActive: formData.isActive,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error?.message || json?.message || 'Failed to update rate.');
      }

      setItems((prev) =>
        prev.map((i) =>
          i.id === editItem.id
            ? {
                ...i,
                name: formData.name.trim(),
                category: formData.category,
                pricePerKg: Number(formData.pricePerKg),
                type: formData.type,
                description: formData.description.trim(),
                isActive: formData.isActive,
              }
            : i
        )
      );
      setInlineRates((prev) => ({ ...prev, [editItem.id]: Number(formData.pricePerKg) }));
      setSuccessMsg(`Pricing for "${formData.name}" updated successfully.`);
      setEditItem(null);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update item.');
    } finally {
      setSubmittingModal(false);
    }
  };

  // Handle Add New Rate Modal
  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingModal) return;
    setSubmittingModal(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await adminFetch('/api/waste-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          category: formData.category,
          pricePerKg: Number(formData.pricePerKg),
          type: formData.type,
          description: formData.description.trim(),
          isActive: formData.isActive,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error?.message || json?.message || 'Failed to register rate.');
      }

      setSuccessMsg(`New scrap rate for "${formData.name}" registered successfully.`);
      setIsAddModalOpen(false);
      await fetchData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create pricing rate.');
    } finally {
      setSubmittingModal(false);
    }
  };

  // Handle Confirm Delete Modal (Safe soft-delete or remove)
  const handleConfirmDelete = async () => {
    if (!deleteItem || submittingModal) return;
    setSubmittingModal(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await adminFetch(`/api/waste-categories?id=${encodeURIComponent(deleteItem.id)}`, {
        method: 'DELETE',
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error?.message || json?.message || 'Failed to delete rate.');
      }

      setSuccessMsg(`Pricing record "${deleteItem.name}" deleted successfully.`);
      setDeleteItem(null);
      await fetchData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete rate.');
    } finally {
      setSubmittingModal(false);
    }
  };

  // Distinct Categories for Filter Dropdown
  const distinctCategories = useMemo(() => {
    const cats = new Set<string>();
    items.forEach((it) => {
      if (it.category) cats.add(it.category);
    });
    return Array.from(cats).sort();
  }, [items]);

  // Filtered & Sorted Items
  const filteredItems = useMemo(() => {
    let result = items.filter((it) => {
      const matchesSearch =
        it.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (it.category && it.category.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (it.description && it.description.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesCategory =
        categoryFilter === 'ALL' || it.category === categoryFilter;

      const matchesStatus =
        statusFilter === 'ALL'
          ? true
          : statusFilter === 'ACTIVE'
          ? it.isActive !== false
          : it.isActive === false;

      return matchesSearch && matchesCategory && matchesStatus;
    });

    if (sortBy === 'name') {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'priceAsc') {
      result.sort((a, b) => (a.pricePerKg ?? 0) - (b.pricePerKg ?? 0));
    } else if (sortBy === 'priceDesc') {
      result.sort((a, b) => (b.pricePerKg ?? 0) - (a.pricePerKg ?? 0));
    }

    return result;
  }, [items, searchQuery, categoryFilter, statusFilter, sortBy]);

  // Pagination Slice
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  // Adjust page if out of bounds
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  // Metrics
  const activeCount = useMemo(() => items.filter((i) => i.isActive !== false).length, [items]);
  const avgRate = useMemo(() => {
    if (items.length === 0) return 0;
    const sum = items.reduce((acc, it) => acc + (it.pricePerKg ?? 0), 0);
    return Math.round((sum / items.length) * 10) / 10;
  }, [items]);
  const maxRate = useMemo(() => {
    if (items.length === 0) return 0;
    return Math.max(...items.map((i) => i.pricePerKg ?? 0));
  }, [items]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase">
            Pricing Engine & Rates
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">
            Pricing Rules & Rates Management
          </h1>
          <p className="text-xs text-slate-500">
            Configure system baseline pickup charges, operational surcharges, and per-item scrap valuation rates.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setFormData({
                id: '',
                name: '',
                category: 'Recyclables',
                pricePerKg: 20,
                unit: 'kg',
                type: 'RECYCLABLE_BUY',
                description: '',
                isActive: true,
              });
              setIsAddModalOpen(true);
            }}
            className="inline-flex items-center gap-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 rounded-xl transition-all shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Pricing Rate
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-4 py-2.5 rounded-xl transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-700 font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* SECTION 1: System Baseline Service Fees & Operational Surcharges */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-emerald-600" />
            <div>
              <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                System Service Charges & Surcharges
              </h2>
              <p className="text-xs text-slate-500">
                Core charges applied during order checkout and agent dispatch across all South Bengaluru zones.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetSystemFees}
              className="text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={handleSaveSystemFees}
              disabled={savingConfig}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50 shadow-sm"
            >
              <Check className="w-3.5 h-3.5" />
              {savingConfig ? 'Saving...' : 'Save System Fees'}
            </button>
          </div>
        </div>

        <form onSubmit={handleSaveSystemFees} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
          {/* Base Pickup Charge */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">Base Pickup Fee</span>
              <span className="text-[10px] uppercase font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                Standard
              </span>
            </div>
            <p className="text-[11px] text-slate-500">Standard booking fee applied to all pickup requests</p>
            <div className="flex items-center gap-2 pt-1">
              <span className="font-bold text-slate-400 text-sm">₹</span>
              <input
                type="number"
                min="0"
                step="1"
                required
                value={editedConfig.basePickupCharge}
                onChange={(e) =>
                  setEditedConfig({ ...editedConfig, basePickupCharge: Number(e.target.value) })
                }
                className="w-full text-sm font-black font-mono text-slate-900 p-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              />
            </div>
          </div>

          {/* Minimum Pickup Charge */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">Minimum Order Fee</span>
              <span className="text-[10px] uppercase font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                Threshold
              </span>
            </div>
            <p className="text-[11px] text-slate-500">Floor charge if estimated scrap payout falls below threshold</p>
            <div className="flex items-center gap-2 pt-1">
              <span className="font-bold text-slate-400 text-sm">₹</span>
              <input
                type="number"
                min="0"
                step="1"
                required
                value={editedConfig.minPickupCharge}
                onChange={(e) =>
                  setEditedConfig({ ...editedConfig, minPickupCharge: Number(e.target.value) })
                }
                className="w-full text-sm font-black font-mono text-slate-900 p-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              />
            </div>
          </div>

          {/* Urgent Surcharge */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">Urgent Surcharge (60-min)</span>
              <span className="text-[10px] uppercase font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                Priority
              </span>
            </div>
            <p className="text-[11px] text-slate-500">Express SLA delivery charge for immediate dispatch</p>
            <div className="flex items-center gap-2 pt-1">
              <span className="font-bold text-slate-400 text-sm">₹</span>
              <input
                type="number"
                min="0"
                step="1"
                required
                value={editedConfig.urgentSurcharge}
                onChange={(e) =>
                  setEditedConfig({ ...editedConfig, urgentSurcharge: Number(e.target.value) })
                }
                className="w-full text-sm font-black font-mono text-slate-900 p-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              />
            </div>
          </div>

          {/* Weekend Fee */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">Weekend Surcharge</span>
              <span className="text-[10px] uppercase font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">
                Sat / Sun
              </span>
            </div>
            <p className="text-[11px] text-slate-500">Peak operational fee applied on Saturday and Sunday</p>
            <div className="flex items-center gap-2 pt-1">
              <span className="font-bold text-slate-400 text-sm">₹</span>
              <input
                type="number"
                min="0"
                step="1"
                required
                value={editedConfig.weekendFee}
                onChange={(e) =>
                  setEditedConfig({ ...editedConfig, weekendFee: Number(e.target.value) })
                }
                className="w-full text-sm font-black font-mono text-slate-900 p-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              />
            </div>
          </div>

          {/* Heavy Item Handling Fee */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">Heavy Item Handling Fee</span>
              <span className="text-[10px] uppercase font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full">
                &gt; 50 kg
              </span>
            </div>
            <p className="text-[11px] text-slate-500">Labor surcharge for appliances, machinery, and furniture</p>
            <div className="flex items-center gap-2 pt-1">
              <span className="font-bold text-slate-400 text-sm">₹</span>
              <input
                type="number"
                min="0"
                step="1"
                required
                value={editedConfig.heavyItemHandlingFee}
                onChange={(e) =>
                  setEditedConfig({
                    ...editedConfig,
                    heavyItemHandlingFee: Number(e.target.value),
                  })
                }
                className="w-full text-sm font-black font-mono text-slate-900 p-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              />
            </div>
          </div>

          {/* E-Waste Special Handling Fee */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">E-Waste Disposal Surcharge</span>
              <span className="text-[10px] uppercase font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                Compliant
              </span>
            </div>
            <p className="text-[11px] text-slate-500">Hazardous electronic sorting and certified recycling fee</p>
            <div className="flex items-center gap-2 pt-1">
              <span className="font-bold text-slate-400 text-sm">₹</span>
              <input
                type="number"
                min="0"
                step="1"
                required
                value={editedConfig.eWasteHandlingFee}
                onChange={(e) =>
                  setEditedConfig({ ...editedConfig, eWasteHandlingFee: Number(e.target.value) })
                }
                className="w-full text-sm font-black font-mono text-slate-900 p-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              />
            </div>
          </div>
        </form>
      </div>

      {/* Metrics Summary Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <Tag className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Total Rates</span>
            <span className="text-2xl font-black text-slate-900">{items.length}</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Active Rates</span>
            <span className="text-2xl font-black text-slate-900">{activeCount}</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Average Rate</span>
            <span className="text-2xl font-black text-slate-900">₹{avgRate}/kg</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Top Scrap Rate</span>
            <span className="text-2xl font-black text-slate-900">₹{maxRate}/kg</span>
          </div>
        </div>
      </div>

      {/* SECTION 2: Scrap Material Pricing Directory */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
              Scrap Valuation Rates & Materials Directory
            </h2>
            <p className="text-xs text-slate-500">
              Configure buying rates per kilogram, toggle customer catalog visibility, and manage units.
            </p>
          </div>
        </div>

        {/* Filters, Search & Sorting Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search Input */}
          <div className="relative lg:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search rates by material, category, description..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full text-xs pl-9 pr-8 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            >
              <option value="ALL">All Categories ({distinctCategories.length})</option>
              {distinctCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as any);
                setCurrentPage(1);
              }}
              className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active ({activeCount})</option>
              <option value="INACTIVE">Inactive ({items.length - activeCount})</option>
            </select>
          </div>

          {/* Sort By */}
          <div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            >
              <option value="name">Sort: Name (A-Z)</option>
              <option value="priceAsc">Sort: Rate (Low → High)</option>
              <option value="priceDesc">Sort: Rate (High → Low)</option>
            </select>
          </div>
        </div>

        {/* Rates Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-bold border-b border-slate-200">
              <tr>
                <th className="p-3.5">Material & Stream</th>
                <th className="p-3.5">Category</th>
                <th className="p-3.5">Valuation Type</th>
                <th className="p-3.5">Quick Rate (₹/Kg)</th>
                <th className="p-3.5">Visibility</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    No scrap pricing records found matching current filters.
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item) => {
                  const isActive = item.isActive !== false;
                  const isSavingInline = savingInlineId === item.id;
                  const currentInlineVal = inlineRates[item.id] ?? item.pricePerKg ?? 0;
                  const hasChangedInline = currentInlineVal !== (item.pricePerKg ?? 0);

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Name & Icon */}
                      <td className="p-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-sm shrink-0 border border-emerald-100">
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt={item.name}
                                className="w-full h-full object-cover rounded-xl"
                              />
                            ) : (
                              '♻️'
                            )}
                          </div>
                          <div>
                            <span className="font-extrabold text-slate-900 block text-sm">
                              {item.name}
                            </span>
                            <span className="text-[11px] text-slate-500 line-clamp-1">
                              {item.description || 'No description provided'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="p-3.5">
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-700 font-bold rounded-lg text-[11px]">
                          {item.category || 'General'}
                        </span>
                      </td>

                      {/* Valuation Type */}
                      <td className="p-3.5">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                            item.type === 'WASTE_CHARGE'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {item.type === 'WASTE_CHARGE' ? 'Disposal Fee' : 'Buy Scrap (Payout)'}
                        </span>
                      </td>

                      {/* Inline Quick Rate Input */}
                      <td className="p-3.5">
                        <div className="flex items-center gap-2">
                          <div className="relative w-24">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                              ₹
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              value={currentInlineVal}
                              onChange={(e) =>
                                setInlineRates({
                                  ...inlineRates,
                                  [item.id]: Number(e.target.value),
                                })
                              }
                              className="w-full pl-6 pr-2 py-1.5 rounded-lg border border-slate-200 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                            />
                          </div>
                          {hasChangedInline && (
                            <button
                              onClick={() => handleSaveInlineRate(item)}
                              disabled={isSavingInline}
                              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs shadow-sm disabled:opacity-50"
                              title="Save updated rate"
                            >
                              {isSavingInline ? '...' : 'Save'}
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Visibility Toggle */}
                      <td className="p-3.5">
                        <button
                          onClick={() => handleToggleStatus(item)}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase transition-all ${
                            isActive
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-rose-100 hover:text-rose-800'
                              : 'bg-rose-100 text-rose-800 hover:bg-emerald-100 hover:text-emerald-800'
                          }`}
                          title={`Click to ${isActive ? 'Deactivate' : 'Activate'}`}
                        >
                          {isActive ? 'Active' : 'Inactive'}
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setDetailsItem(item)}
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                            title="View pricing details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openEditModal(item)}
                            className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit rate & properties"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteItem(item)}
                            className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Delete / Archive rate"
                          >
                            <Trash2 className="w-4 h-4" />
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

        {/* Pagination & Page Size Row */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="text-xs p-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="5">5</option>
              <option value="10">10</option>
              <option value="25">25</option>
            </select>
            <span className="text-xs text-slate-500">
              Showing page {currentPage} of {totalPages} ({filteredItems.length} total scrap rates)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentPage(i + 1)}
                  className={`w-7 h-7 text-xs font-bold rounded-lg transition-colors ${
                    currentPage === i + 1
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* MODAL 1: Pricing Details Breakdown Modal */}
      {detailsItem && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm"
        >
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center text-lg">
                  ♻️
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">{detailsItem.name}</h3>
                  <p className="text-xs text-slate-500">{detailsItem.category || 'General Scrap'}</p>
                </div>
              </div>
              <button
                onClick={() => setDetailsItem(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Valuation Rate</span>
                <span className="text-lg font-black font-mono text-emerald-700">
                  ₹{detailsItem.pricePerKg ?? 0} / kg
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Type</span>
                <span className="text-xs font-extrabold text-slate-900">
                  {detailsItem.type === 'WASTE_CHARGE' ? 'Disposal Fee' : 'Customer Payout'}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Status</span>
                <span className="text-xs font-extrabold text-slate-900">
                  {detailsItem.isActive !== false ? 'Active on Portal' : 'Inactive'}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Standard Unit</span>
                <span className="text-xs font-extrabold text-slate-900">Kilograms (kg)</span>
              </div>
            </div>

            <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-xs space-y-1">
              <p className="font-bold text-emerald-950">Customer Pricing Calculation Rule</p>
              <p className="text-emerald-800 text-[11px]">
                Upon weight verification by field agents, payout = (Verified Weight in kg) × ₹
                {detailsItem.pricePerKg ?? 0}. If total order payout is less than ₹
                {config.minPickupCharge}, the minimum order rule applies.
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setDetailsItem(null)}
                className="w-full bg-slate-100 text-slate-700 font-bold text-xs py-3 rounded-xl hover:bg-slate-200 transition-colors"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Add New Pricing Rate */}
      {isAddModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm"
        >
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-900">Register New Pricing Rate</h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateItem} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Material Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Copper Scrap (Wire Grade 1)"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    <option value="Recyclables">Recyclables</option>
                    <option value="Metal & Scrap">Metal & Scrap</option>
                    <option value="E-Waste">E-Waste</option>
                    <option value="Paper & Cardboard">Paper & Cardboard</option>
                    <option value="Plastic Waste">Plastic Waste</option>
                    <option value="Appliances">Appliances</option>
                    <option value="Household Junk">Household Junk</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Valuation Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    <option value="RECYCLABLE_BUY">Buy Scrap (Payout to Customer)</option>
                    <option value="WASTE_CHARGE">Disposal Fee (Charge Customer)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Rate (₹) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    required
                    value={formData.pricePerKg}
                    onChange={(e) =>
                      setFormData({ ...formData, pricePerKg: Number(e.target.value) })
                    }
                    className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Unit</label>
                  <select
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    <option value="kg">Per Kilogram (kg)</option>
                    <option value="piece">Per Piece / Item</option>
                    <option value="ton">Per Ton</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Notes on grades, acceptable conditions, sorting requirements..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  disabled={submittingModal}
                  onClick={() => setIsAddModalOpen(false)}
                  className="w-1/2 bg-slate-100 text-slate-700 font-bold text-xs py-3 rounded-xl hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingModal}
                  className="w-1/2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-3 rounded-xl shadow-md flex items-center justify-center gap-2"
                >
                  {submittingModal ? 'Registering...' : 'Register Rate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Edit Existing Rate */}
      {editItem && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm"
        >
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-900">Edit Pricing Rate</h3>
              <button
                onClick={() => setEditItem(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateItem} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Material Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    <option value="Recyclables">Recyclables</option>
                    <option value="Metal & Scrap">Metal & Scrap</option>
                    <option value="E-Waste">E-Waste</option>
                    <option value="Paper & Cardboard">Paper & Cardboard</option>
                    <option value="Plastic Waste">Plastic Waste</option>
                    <option value="Appliances">Appliances</option>
                    <option value="Household Junk">Household Junk</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Valuation Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    <option value="RECYCLABLE_BUY">Buy Scrap (Payout to Customer)</option>
                    <option value="WASTE_CHARGE">Disposal Fee (Charge Customer)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Rate (₹) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    required
                    value={formData.pricePerKg}
                    onChange={(e) =>
                      setFormData({ ...formData, pricePerKg: Number(e.target.value) })
                    }
                    className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Status</label>
                  <select
                    value={formData.isActive ? 'ACTIVE' : 'INACTIVE'}
                    onChange={(e) =>
                      setFormData({ ...formData, isActive: e.target.value === 'ACTIVE' })
                    }
                    className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    <option value="ACTIVE">ACTIVE (Visible)</option>
                    <option value="INACTIVE">INACTIVE (Hidden)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  disabled={submittingModal}
                  onClick={() => setEditItem(null)}
                  className="w-1/2 bg-slate-100 text-slate-700 font-bold text-xs py-3 rounded-xl hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingModal}
                  className="w-1/2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-3 rounded-xl shadow-md flex items-center justify-center gap-2"
                >
                  {submittingModal ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Delete Confirmation Modal */}
      {deleteItem && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm"
        >
          <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Delete Pricing Rate?</h3>
                <p className="text-xs text-slate-500">{deleteItem.name}</p>
              </div>
            </div>

            <div className="border border-rose-200 bg-rose-50 rounded-2xl p-4 text-xs text-rose-900 space-y-2">
              <p className="font-bold">Notice on Scrap Pricing Deletion:</p>
              <ul className="list-disc list-inside space-y-1 text-[11px]">
                <li>
                  If historical orders reference <strong>{deleteItem.name}</strong>, it will be safely deactivated/archived rather than hard-deleted.
                </li>
                <li>Customer catalog visibility will be removed immediately.</li>
              </ul>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                disabled={submittingModal}
                onClick={() => setDeleteItem(null)}
                className="w-1/2 bg-slate-100 text-slate-700 font-bold text-xs py-3 rounded-xl hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingModal}
                onClick={handleConfirmDelete}
                className="w-1/2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-3 rounded-xl shadow-md flex items-center justify-center gap-2"
              >
                {submittingModal ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
