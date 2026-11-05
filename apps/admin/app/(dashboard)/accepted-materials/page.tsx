'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Recycle,
  Plus,
  RefreshCw,
  Power,
  Search,
  Edit3,
  Upload,
  Image as ImageIcon,
  AlertTriangle,
  X,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  CheckCircle2,
  Archive,
  ExternalLink,
  Trash2,
  Check,
  Eye,
  Tag,
  DollarSign,
} from 'lucide-react';
import Link from 'next/link';
import { getMaterialImageUrl, broadcastWasteCategoriesChanged } from '@/lib/customerWasteCategories';

const MATERIAL_CATEGORY_OPTIONS = [
  'E-Waste',
  'Household Junk',
  'Paper & Cardboard',
  'Plastic Waste',
  'Metal & Scrap',
  'Appliances',
  'Glass',
  'Recyclables',
  'General',
];

const PRESET_IMAGES = [
  { label: 'E-Waste Card', url: '/categories/e-waste.webp' },
  { label: 'Household Junk Card', url: '/categories/household-waste.webp' },
  { label: 'Paper & Cardboard Card', url: '/categories/paper-carboard.jpg' },
  { label: 'Plastic Waste Card', url: '/categories/plastic-waste.jpg' },
];

type MaterialFormState = {
  id?: string;
  name: string;
  description: string;
  category: string;
  type: 'RECYCLABLE_BUY' | 'WASTE_CHARGE';
  pricePerKg: number | string;
  displayOrder: number | string;
  imageUrl: string;
  active: boolean;
};

const INITIAL_FORM: MaterialFormState = {
  name: '',
  description: '',
  category: 'Recyclables',
  type: 'RECYCLABLE_BUY',
  pricePerKg: 20,
  displayOrder: 10,
  imageUrl: '',
  active: true,
};

export default function AdminAcceptedMaterialsPage() {
  const customerSiteUrl = process.env.NEXT_PUBLIC_CUSTOMER_SITE_URL || 'https://www.junkitout.in';
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Filters, Sorting & Pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'name' | 'priceAsc' | 'priceDesc'>('name');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5); // Default 5 to support immediate multi-page pagination testing

  // Material Details Modal
  const [viewingMaterial, setViewingMaterial] = useState<any | null>(null);

  // Create / Edit Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [form, setForm] = useState<MaterialFormState>(INITIAL_FORM);
  const [submittingForm, setSubmittingForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Image Upload State
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Delete Confirmation Modal
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadCategories = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/waste-categories?admin=true', { cache: 'no-store' });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setCategories(data.data);
      } else {
        setBanner({ type: 'error', message: data.message || 'Failed to load accepted materials.' });
      }
    } catch (e: any) {
      setBanner({ type: 'error', message: e?.message || 'Error connecting to materials service.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCategories();
  }, []);

  const invalidateCustomerCache = () => {
    try {
      broadcastWasteCategoriesChanged();
    } catch {
      // ignore
    }
  };

  const availableCategoryTypes = useMemo(() => {
    const set = new Set<string>(MATERIAL_CATEGORY_OPTIONS);
    for (const c of categories) {
      if (c?.category && typeof c.category === 'string') {
        set.add(c.category.trim());
      }
    }
    return Array.from(set);
  }, [categories]);

  const filteredCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return categories
      .filter((cat) => {
        if (statusFilter === 'ACTIVE' && !cat.active) return false;
        if (statusFilter === 'INACTIVE' && cat.active) return false;
        if (
          categoryFilter !== 'ALL' &&
          String(cat.category || 'Recyclables').toLowerCase() !== categoryFilter.toLowerCase()
        ) {
          return false;
        }
        if (q) {
          const matchName = String(cat.name || '').toLowerCase().includes(q);
          const matchDesc = String(cat.description || '').toLowerCase().includes(q);
          const matchCat = String(cat.category || '').toLowerCase().includes(q);
          if (!matchName && !matchDesc && !matchCat) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
        if (sortBy === 'priceAsc') return (Number(a.pricePerKg) || 0) - (Number(b.pricePerKg) || 0);
        if (sortBy === 'priceDesc') return (Number(b.pricePerKg) || 0) - (Number(a.pricePerKg) || 0);
        return 0;
      });
  }, [categories, searchQuery, statusFilter, categoryFilter, sortBy]);

  const totalCount = filteredCategories.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedCategories = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredCategories.slice(start, start + pageSize);
  }, [filteredCategories, currentPage, pageSize]);

  const stats = useMemo(() => {
    const total = categories.length;
    const activeCount = categories.filter((c) => c.active).length;
    const inactiveCount = total - activeCount;
    const avgRate = total > 0 ? (categories.reduce((acc, c) => acc + (Number(c.pricePerKg) || 0), 0) / total).toFixed(1) : '0';
    return { total, activeCount, inactiveCount, avgRate };
  }, [categories]);

  const openCreateModal = () => {
    setModalMode('create');
    setForm({
      ...INITIAL_FORM,
      displayOrder: categories.length + 1,
    });
    setFormError(null);
    setUploadError(null);
    setLocalPreviewUrl(null);
    setModalOpen(true);
  };

  const openEditModal = (cat: any) => {
    setModalMode('edit');
    setForm({
      id: cat.id,
      name: cat.name || '',
      description: cat.description || '',
      category: cat.category || 'Recyclables',
      type: cat.type || 'RECYCLABLE_BUY',
      pricePerKg: cat.pricePerKg ?? 20,
      displayOrder: cat.displayOrder ?? 0,
      imageUrl: cat.imageUrl || '',
      active: cat.active ?? true,
    });
    setFormError(null);
    setUploadError(null);
    setLocalPreviewUrl(null);
    setModalOpen(true);
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingForm || uploadingImage) return;

    const trimmedName = form.name.trim();
    const trimmedDesc = form.description.trim();
    const numericPrice = Number(form.pricePerKg);
    const numericOrder = Number(form.displayOrder);

    if (!trimmedName || !trimmedDesc) {
      setFormError('Material name and description are required.');
      return;
    }
    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      setFormError('Price per Kg must be a valid non-negative number.');
      return;
    }

    setSubmittingForm(true);
    setFormError(null);

    try {
      const method = modalMode === 'create' ? 'POST' : 'PUT';
      const payload = {
        ...(modalMode === 'edit' ? { id: form.id } : {}),
        name: trimmedName,
        description: trimmedDesc,
        category: form.category.trim() || 'Recyclables',
        type: form.type,
        pricePerKg: numericPrice,
        displayOrder: Number.isFinite(numericOrder) && numericOrder >= 0 ? Math.round(numericOrder) : 0,
        imageUrl: form.imageUrl.trim() || getMaterialImageUrl({ name: trimmedName, category: form.category }),
        active: Boolean(form.active),
      };

      const res = await fetch('/api/waste-categories', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error?.message || 'Failed to save material.');
      }

      invalidateCustomerCache();
      setModalOpen(false);
      setBanner({
        type: 'success',
        message:
          modalMode === 'create'
            ? `Accepted material "${trimmedName}" created and synced to customer catalog.`
            : `Accepted material "${trimmedName}" updated successfully.`,
      });
      await loadCategories();
    } catch (err: any) {
      setFormError(err?.message || 'Unable to save material.');
    } finally {
      setSubmittingForm(false);
    }
  };

  const handleQuickRateChange = (id: string, newPrice: string) => {
    const val = parseFloat(newPrice);
    if (isNaN(val)) return;
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, pricePerKg: val } : c)));
  };

  const saveQuickUpdate = async (cat: any) => {
    setSavingId(cat.id);
    setSavedId(null);
    try {
      const res = await fetch('/api/waste-categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: cat.id,
          pricePerKg: cat.pricePerKg,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to update rate.');
      }
      setSavedId(cat.id);
      invalidateCustomerCache();
      setTimeout(() => setSavedId(null), 2000);
      setBanner({
        type: 'success',
        message: `Updated rate for "${cat.name}" to ₹${cat.pricePerKg}/kg.`,
      });
    } catch (e: any) {
      setBanner({ type: 'error', message: e?.message || 'Failed to save rate update.' });
    } finally {
      setSavingId(null);
    }
  };

  const toggleActive = async (cat: any) => {
    const updatedActive = !cat.active;
    setCategories((prev) => prev.map((c) => (c.id === cat.id ? { ...c, active: updatedActive } : c)));
    setSavingId(cat.id);
    try {
      const res = await fetch('/api/waste-categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cat.id, active: updatedActive }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to update status.');
      }
      invalidateCustomerCache();
      setBanner({
        type: 'success',
        message: `"${cat.name}" is now ${updatedActive ? 'Active (visible on customer website)' : 'Inactive (hidden from customer website)'}.`,
      });
    } catch (e: any) {
      setCategories((prev) => prev.map((c) => (c.id === cat.id ? { ...c, active: !updatedActive } : c)));
      setBanner({ type: 'error', message: e?.message || 'Failed to toggle material status.' });
    } finally {
      setSavingId(null);
    }
  };

  const confirmDeleteMaterial = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/waste-categories?id=${encodeURIComponent(deleteTarget.id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error?.message || 'Failed to delete material.');
      }

      invalidateCustomerCache();
      const resultPayload = data.data || data;
      setDeleteTarget(null);
      setBanner({
        type: 'success',
        message:
          resultPayload.message ||
          (resultPayload.softDeleted
            ? `"${deleteTarget.name}" is referenced by historical orders and was safely deactivated/archived.`
            : `"${deleteTarget.name}" was permanently deleted.`),
      });
      await loadCategories();
    } catch (err: any) {
      setBanner({ type: 'error', message: err?.message || 'Failed to delete material.' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
        <div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase">
            Accepted Materials Directory
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">
            Accepted Materials & Pricing
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage accepted scrap materials, photos, rates per kg, and live customer website visibility.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href={`${customerSiteUrl}/categories`}
            target="_blank"
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3.5 py-2.5 rounded-xl flex items-center gap-1.5 transition-colors border border-slate-200"
          >
            <span>View Customer Catalog</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
          <button
            type="button"
            onClick={() => void loadCategories()}
            disabled={loading}
            className="bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold px-3.5 py-2.5 rounded-xl flex items-center gap-1.5 transition-colors border border-slate-200 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Accepted Material
          </button>
        </div>
      </div>

      {banner && (
        <div
          className={`p-4 rounded-2xl text-xs font-bold flex items-center justify-between border ${
            banner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span>{banner.message}</span>
          <button
            onClick={() => setBanner(null)}
            className="text-slate-400 hover:text-slate-600 ml-3 text-xs font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Materials</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{stats.total}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Scrap items in database</p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center font-black">
            <Recycle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-emerald-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Active On Website</p>
            <p className="text-2xl font-black text-emerald-700 mt-1">{stats.activeCount}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Live on customer booking</p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-black">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Inactive / Archived</p>
            <p className="text-2xl font-black text-slate-700 mt-1">{stats.inactiveCount}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Hidden from customer catalog</p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center font-black">
            <Archive className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Average Rate</p>
            <p className="text-2xl font-black text-emerald-600 mt-1">₹{stats.avgRate}/kg</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Current scrap market baseline</p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-black">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search material by name, description, category..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-8 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                setPage(1);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
          >
            <option value="ALL">All Categories</option>
            {availableCategoryTypes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as any);
              setPage(1);
            }}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active Only</option>
            <option value="INACTIVE">Inactive Only</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
          >
            <option value="name">Sort: Name (A-Z)</option>
            <option value="priceAsc">Sort: Price (Low → High)</option>
            <option value="priceDesc">Sort: Price (High → Low)</option>
          </select>

          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
          >
            <option value={5}>5 per page</option>
            <option value={10}>10 per page</option>
            <option value={25}>25 per page</option>
          </select>
        </div>
      </div>

      {/* Materials Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden p-6 space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px]">
              <tr>
                <th className="p-3">Material & Photo</th>
                <th className="p-3">Category</th>
                <th className="p-3">Type</th>
                <th className="p-3">Rate (₹/Kg)</th>
                <th className="p-3">Visibility</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center p-8 text-slate-400 font-semibold">
                    Loading accepted materials directory...
                  </td>
                </tr>
              ) : paginatedCategories.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center p-8 text-slate-400 font-semibold">
                    No accepted materials found matching filters.
                  </td>
                </tr>
              ) : (
                paginatedCategories.map((cat) => (
                  <tr key={cat.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={getMaterialImageUrl(cat)}
                          alt={cat.name}
                          className="w-10 h-10 rounded-xl object-cover border border-slate-200 bg-slate-100"
                        />
                        <div>
                          <button
                            onClick={() => setViewingMaterial(cat)}
                            className="font-bold text-slate-900 hover:text-emerald-700 transition-colors text-left cursor-pointer"
                          >
                            {cat.name}
                          </button>
                          <p className="text-[11px] text-slate-400 line-clamp-1">{cat.description}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full text-[10px] font-bold">
                        {cat.category || 'Recyclables'}
                      </span>
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                          cat.type === 'RECYCLABLE_BUY'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {cat.type === 'RECYCLABLE_BUY' ? 'Buy Scrap' : 'Waste Charge'}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400 font-bold">₹</span>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={cat.pricePerKg ?? ''}
                          onChange={(e) => handleQuickRateChange(cat.id, e.target.value)}
                          className="w-16 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-900 text-center"
                        />
                        <button
                          onClick={() => saveQuickUpdate(cat)}
                          disabled={savingId === cat.id}
                          className="p-1 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 cursor-pointer disabled:opacity-50"
                          title="Save Rate"
                        >
                          {savedId === cat.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <SaveIcon className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => toggleActive(cat)}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase flex items-center gap-1 cursor-pointer transition-colors ${
                          cat.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        <Power className="w-3 h-3" />
                        {cat.active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setViewingMaterial(cat)}
                          className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 cursor-pointer"
                          title="View Material Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => openEditModal(cat)}
                          className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 cursor-pointer"
                          title="Edit Material"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(cat)}
                          className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 cursor-pointer"
                          title="Delete / Archive Material"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100 text-xs text-slate-500 font-bold">
          <div>
            Showing page {currentPage} of {totalPages} ({totalCount} total accepted materials)
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1 cursor-pointer"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* VIEW MATERIAL DETAILS MODAL */}
      {viewingMaterial && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <img
                  src={getMaterialImageUrl(viewingMaterial)}
                  alt={viewingMaterial.name}
                  className="w-10 h-10 rounded-xl object-cover border border-slate-200"
                />
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">{viewingMaterial.name}</h3>
                  <p className="text-[11px] text-slate-400 font-semibold">{viewingMaterial.category}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingMaterial(null)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Category Group</span>
                <span className="font-extrabold text-slate-900">{viewingMaterial.category}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Scrap Rate</span>
                <span className="font-extrabold text-emerald-700">₹{viewingMaterial.pricePerKg} / kg</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Financial Type</span>
                <span className="font-semibold text-slate-800">
                  {viewingMaterial.type === 'RECYCLABLE_BUY' ? 'Buy Scrap (We pay customer)' : 'Waste Disposal Charge'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Customer Visibility</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                    viewingMaterial.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {viewingMaterial.active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="flex flex-col gap-1 border-t border-slate-200/60 pt-2">
                <span className="text-slate-400 font-bold">Description</span>
                <p className="text-slate-700 leading-relaxed">{viewingMaterial.description}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setViewingMaterial(null)}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-2.5 rounded-xl cursor-pointer"
            >
              Close Details
            </button>
          </div>
        </div>
      )}

      {/* CREATE / EDIT MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveModal}
            className="bg-white rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-900">
                {modalMode === 'create' ? 'Add Accepted Material' : `Edit Material: ${form.name}`}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl text-xs font-bold bg-rose-50 border border-rose-200 text-rose-800">
                {formError}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Material Name *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Copper Scrap"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Description *</label>
                <textarea
                  required
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Detailed specifications of accepted items..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Category Group</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                  >
                    {availableCategoryTypes.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Price per Kg (₹) *</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    required
                    value={form.pricePerKg}
                    onChange={(e) => setForm({ ...form, pricePerKg: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Financial Type</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value as any })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                  >
                    <option value="RECYCLABLE_BUY">Buy Scrap (Payout)</option>
                    <option value="WASTE_CHARGE">Waste Disposal Fee</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Customer Visibility</label>
                  <label className="flex items-center gap-2 mt-2 cursor-pointer font-bold text-slate-700">
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={(e) => setForm({ ...form, active: e.target.checked })}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                    />
                    <span>Active on Website</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="w-1/2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2.5 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingForm}
                className="w-1/2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2.5 rounded-xl shadow-md disabled:opacity-50 cursor-pointer"
              >
                {submittingForm ? 'Saving...' : 'Save Material'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* DELETE CONFIRMATION DIALOG */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
                <h3 className="text-base font-extrabold text-slate-900">Delete Material?</h3>
              </div>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete <strong className="text-slate-900 font-bold">{deleteTarget.name}</strong>?
              If this material is referenced by historical orders, it will be safely soft-deleted/archived instead of permanently removed.
            </p>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="w-1/2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2.5 rounded-xl disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteMaterial}
                disabled={deleting}
                className="w-1/2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-2.5 rounded-xl shadow-md disabled:opacity-50 cursor-pointer"
              >
                {deleting ? 'Processing...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SaveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
      <polyline points="17 21 17 13 7 13 7 21"></polyline>
      <polyline points="7 3 7 8 15 8"></polyline>
    </svg>
  );
}
