'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Trash2,
  Plus,
  Check,
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

  // Filters & Pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

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
    return categories.filter((cat) => {
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
    });
  }, [categories, searchQuery, statusFilter, categoryFilter]);

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
    return { total, activeCount, inactiveCount };
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

  const handleImageFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type.toLowerCase())) {
      setUploadError('Invalid file format. Only JPG, JPEG, PNG, and WEBP images are allowed.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const maxBytes = 10 * 1024 * 1024;
    if (file.size > maxBytes) {
      setUploadError('Image exceeds maximum allowed size of 10MB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setLocalPreviewUrl(objectUrl);
    setUploadingImage(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('purpose', 'material');

      const res = await fetch('/api/upload?purpose=material', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (!res.ok || !data.success || !data.url) {
        throw new Error(data.message || 'Failed to upload material image.');
      }

      setForm((prev) => ({ ...prev, imageUrl: data.url }));
      setLocalPreviewUrl(null);
    } catch (err: any) {
      setUploadError(err?.message || 'Error uploading image. Please try again.');
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
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

  const formatDate = (dateVal?: string | null) => {
    if (!dateVal) return '—';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
        <div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase">
            Accepted Materials & Catalog CRUD
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">
            Accepted Materials Management
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Create, edit, upload material photos, configure scrap rates (₹/kg), and control live customer website visibility.
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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Materials</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{stats.total}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Configured in PostgreSQL database</p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center font-black">
            <ImageIcon className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-emerald-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Active on Customer Website</p>
            <p className="text-2xl font-black text-emerald-700 mt-1">{stats.activeCount}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Live on homepage, categories, pricing & booking</p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-black">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Inactive / Archived</p>
            <p className="text-2xl font-black text-slate-700 mt-1">{stats.inactiveCount}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Hidden from new bookings; preserved in order history</p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center font-black">
            <Archive className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Feedback Banner */}
      {banner && (
        <div
          className={`p-4 rounded-2xl border flex items-center justify-between gap-3 text-xs font-bold ${
            banner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {banner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{banner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="p-1 rounded-lg hover:bg-black/5 text-current cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search & Filters Bar */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search material name, description, or category..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-2.5 text-xs font-bold text-slate-900 focus:bg-white focus:border-emerald-500 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            aria-label="Filter by Status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE');
              setPage(1);
            }}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:border-emerald-500 focus:outline-none"
          >
            <option value="ALL">All Statuses ({categories.length})</option>
            <option value="ACTIVE">Active Only ({stats.activeCount})</option>
            <option value="INACTIVE">Inactive / Archived ({stats.inactiveCount})</option>
          </select>

          <select
            aria-label="Filter by Category"
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:border-emerald-500 focus:outline-none"
          >
            <option value="ALL">All Material Categories</option>
            {availableCategoryTypes.map((catType) => (
              <option key={catType} value={catType}>
                {catType}
              </option>
            ))}
          </select>

          <select
            aria-label="Rows per page"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:border-emerald-500 focus:outline-none"
          >
            <option value={10}>10 per page</option>
            <option value={20}>20 per page</option>
            <option value={50}>50 per page</option>
          </select>
        </div>
      </div>

      {/* Materials Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs font-medium flex flex-col items-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-emerald-600" />
            <span>Loading accepted materials from PostgreSQL...</span>
          </div>
        ) : paginatedCategories.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <p className="text-sm font-bold text-slate-700">No accepted materials match your filters.</p>
            <p className="text-xs text-slate-500">Try clearing your search filter or add a new accepted material.</p>
            <button
              type="button"
              onClick={openCreateModal}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl inline-flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add Accepted Material
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px] border-b border-slate-200">
                <tr>
                  <th className="p-4">Material</th>
                  <th className="p-4">Category / Model</th>
                  <th className="p-4">Description</th>
                  <th className="p-4">Price per Kg (₹)</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Orders Linked</th>
                  <th className="p-4">Created / Updated</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedCategories.map((cat) => {
                  const thumbUrl = getMaterialImageUrl(cat);
                  const orderItemsCount = cat?._count?.orderItems ?? 0;

                  return (
                    <tr
                      key={cat.id}
                      className={`hover:bg-slate-50/90 transition-colors ${!cat.active ? 'opacity-65 bg-slate-50/40' : ''}`}
                    >
                      {/* Thumbnail + Name */}
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-14 h-14 rounded-2xl border border-slate-200 bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
                            <img
                              src={thumbUrl}
                              alt={cat.name}
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src = '/categories/household-waste.webp';
                              }}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div>
                            <span className="font-black text-slate-900 text-sm block">{cat.name}</span>
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 mt-0.5">
                              <ArrowUpDown className="w-3 h-3" />
                              Order #{cat.displayOrder ?? 0}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Category & Financial Type */}
                      <td className="p-4">
                        <span className="inline-block text-[11px] font-extrabold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                          {cat.category || 'Recyclables'}
                        </span>
                        <span
                          className={`block mt-1 text-[10px] font-extrabold uppercase ${
                            cat.type === 'RECYCLABLE_BUY' ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {cat.type === 'RECYCLABLE_BUY' ? 'Pay Customer' : 'Service Charge'}
                        </span>
                      </td>

                      {/* Description */}
                      <td className="p-4 max-w-xs">
                        <p className="text-slate-600 text-xs line-clamp-2 leading-relaxed">{cat.description}</p>
                      </td>

                      {/* Price per Kg */}
                      <td className="p-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-400">₹</span>
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            aria-label={`Price per kg for ${cat.name}`}
                            value={cat.pricePerKg}
                            onChange={(e) => handleQuickRateChange(cat.id, e.target.value)}
                            className="w-20 bg-slate-50 border border-slate-200 rounded-xl p-2 font-black text-slate-900 text-center focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => void saveQuickUpdate(cat)}
                            disabled={savingId === cat.id}
                            title="Save updated rate"
                            className={`px-2.5 py-2 rounded-xl font-bold text-[11px] transition-all cursor-pointer ${
                              savedId === cat.id
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-900 hover:bg-slate-800 text-white'
                            }`}
                          >
                            {savingId === cat.id ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : savedId === cat.id ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              'Save'
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Active Status */}
                      <td className="p-4">
                        <button
                          type="button"
                          onClick={() => void toggleActive(cat)}
                          disabled={savingId === cat.id}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider transition-colors cursor-pointer ${
                            cat.active
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                              : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                          }`}
                        >
                          <Power className="w-3 h-3" />
                          {cat.active ? 'Active' : 'Inactive'}
                        </button>
                      </td>

                      {/* Historical Orders Count */}
                      <td className="p-4">
                        <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg text-[11px]">
                          {orderItemsCount} {orderItemsCount === 1 ? 'order' : 'orders'}
                        </span>
                      </td>

                      {/* Created / Updated Dates */}
                      <td className="p-4 text-[11px] text-slate-500">
                        <div>
                          <span className="font-semibold text-slate-400">Created: </span>
                          <span className="font-mono">{formatDate(cat.createdAt)}</span>
                        </div>
                        <div className="mt-0.5">
                          <span className="font-semibold text-slate-400">Updated: </span>
                          <span className="font-mono">{formatDate(cat.updatedAt || cat.createdAt)}</span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="p-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(cat)}
                            className="bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 text-slate-700 border border-slate-200 font-bold px-3 py-1.5 rounded-xl text-[11px] inline-flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(cat)}
                            className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold px-3 py-1.5 rounded-xl text-[11px] inline-flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
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

        {/* Pagination Footer */}
        {!loading && totalCount > 0 && (
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <span className="font-semibold text-slate-500">
              Showing <strong className="text-slate-900">{(currentPage - 1) * pageSize + 1}</strong> to{' '}
              <strong className="text-slate-900">{Math.min(currentPage * pageSize, totalCount)}</strong> of{' '}
              <strong className="text-slate-900">{totalCount}</strong> materials
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 inline-flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Prev
              </button>
              <span className="font-bold text-slate-700 px-2">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 inline-flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* CREATE / EDIT MATERIAL MODAL */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label={modalMode === 'create' ? 'Add Accepted Material' : 'Edit Accepted Material'}
        >
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full overflow-hidden my-8">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                  {modalMode === 'create' ? 'New Catalog Entry' : 'Update Catalog Entry'}
                </span>
                <h2 className="text-lg font-black">
                  {modalMode === 'create' ? 'Add New Accepted Material' : `Edit Material: ${form.name}`}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
              {formError && (
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 mb-1.5">
                    Material Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Copper & Brass Scrap"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 focus:bg-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 mb-1.5">
                    Material Category / Type *
                  </label>
                  <input
                    type="text"
                    list="material-category-options"
                    required
                    placeholder="Select or type category"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 focus:bg-white focus:border-emerald-500 focus:outline-none"
                  />
                  <datalist id="material-category-options">
                    {MATERIAL_CATEGORY_OPTIONS.map((opt) => (
                      <option key={opt} value={opt} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 mb-1.5">
                    Price per Kg (₹/kg) *
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    required
                    value={form.pricePerKg}
                    onChange={(e) => setForm({ ...form, pricePerKg: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-black text-slate-900 focus:bg-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 mb-1.5">
                    Settlement Model
                  </label>
                  <select
                    value={form.type}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        type: e.target.value as 'RECYCLABLE_BUY' | 'WASTE_CHARGE',
                      })
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 focus:bg-white focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="RECYCLABLE_BUY">Recyclable Buy (Pay Customer)</option>
                    <option value="WASTE_CHARGE">Junk Removal (Service Charge)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 mb-1.5">
                    Display Order
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.displayOrder}
                    onChange={(e) => setForm({ ...form, displayOrder: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 focus:bg-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 mb-1.5">
                  Material Description *
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Describe accepted items, preparation guidelines, and examples..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-900 focus:bg-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              {/* Image Upload & Preview Section */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700">
                      Material Image Upload & Preview
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Upload JPG, JPEG, PNG, or WebP (max 10MB) or choose a preset image.
                    </p>
                  </div>

                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp"
                      onChange={handleImageFileSelect}
                      className="hidden"
                      id="material-image-upload-input"
                    />
                    <label
                      htmlFor="material-image-upload-input"
                      className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                        uploadingImage
                          ? 'bg-slate-200 text-slate-500 border-slate-300 cursor-wait'
                          : 'bg-slate-900 hover:bg-slate-800 text-white border-slate-900'
                      }`}
                    >
                      {uploadingImage ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Uploading...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-3.5 h-3.5" />
                          <span>{form.imageUrl ? 'Replace Image' : 'Upload Image'}</span>
                        </>
                      )}
                    </label>
                  </div>
                </div>

                {uploadError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{uploadError}</span>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <div className="w-28 h-24 rounded-2xl border border-slate-200 bg-white overflow-hidden shrink-0 flex items-center justify-center shadow-xs">
                    <img
                      src={
                        localPreviewUrl ||
                        form.imageUrl ||
                        getMaterialImageUrl({ name: form.name, category: form.category })
                      }
                      alt="Material preview"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = '/categories/household-waste.webp';
                      }}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="flex-1 w-full space-y-2">
                    <input
                      type="text"
                      placeholder="Image URL (auto-filled on upload or enter /categories/...)"
                      value={form.imageUrl}
                      onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-700 focus:border-emerald-500 focus:outline-none"
                    />
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase mr-1">Presets:</span>
                      {PRESET_IMAGES.map((preset) => (
                        <button
                          key={preset.url}
                          type="button"
                          onClick={() => setForm({ ...form, imageUrl: preset.url })}
                          className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                            form.imageUrl === preset.url
                              ? 'bg-emerald-100 border-emerald-300 text-emerald-900'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Active Status Toggle */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <div>
                  <p className="text-xs font-black text-slate-900">Active on Customer Website</p>
                  <p className="text-[11px] text-slate-500">
                    When enabled, customers can view and select this material for doorstep pickup.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.active}
                  onClick={() => setForm((prev) => ({ ...prev, active: !prev.active }))}
                  className={`relative inline-flex h-7 w-13 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                    form.active ? 'bg-emerald-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out ${
                      form.active ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingForm || uploadingImage}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white text-xs font-bold inline-flex items-center gap-2 shadow-sm cursor-pointer disabled:cursor-not-allowed"
                >
                  {submittingForm && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{modalMode === 'create' ? 'Create Accepted Material' : 'Save Material Changes'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE / ARCHIVE CONFIRMATION DIALOG */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm Delete Material"
        >
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">
                  {(deleteTarget?._count?.orderItems ?? 0) > 0
                    ? `Archive / Deactivate "${deleteTarget.name}"?`
                    : `Delete "${deleteTarget.name}"?`}
                </h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  {(deleteTarget?._count?.orderItems ?? 0) > 0 ? (
                    <>
                      This material is referenced by{' '}
                      <strong className="text-slate-900">{deleteTarget._count.orderItems} historical order(s)</strong>.
                      To protect historical order records and snapshot pricing, it will be safely{' '}
                      <strong className="text-emerald-800">deactivated/archived</strong> and removed from the customer
                      website without corrupting order history.
                    </>
                  ) : (
                    <>
                      This material has no historical order references and will be permanently removed from the catalog.
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void confirmDeleteMaterial()}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {deleting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>
                  {(deleteTarget?._count?.orderItems ?? 0) > 0
                    ? 'Confirm Safe Archive'
                    : 'Confirm Permanent Delete'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
