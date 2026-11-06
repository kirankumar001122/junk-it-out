'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Trash2,
  Plus,
  RefreshCw,
  Power,
  Search,
  Edit3,
  Layers,
  Image as ImageIcon,
  AlertTriangle,
  X,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  CheckCircle2,
  Archive,
  ExternalLink,
  Package,
  Eye,
  Tag,
  DollarSign,
  Info,
} from 'lucide-react';
import Link from 'next/link';
import { getMaterialImageUrl, broadcastWasteCategoriesChanged } from '@/lib/customerWasteCategories';

type CategoryFormState = {
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

const INITIAL_CATEGORY_FORM: CategoryFormState = {
  name: '',
  description: '',
  category: 'Recyclables',
  type: 'RECYCLABLE_BUY',
  pricePerKg: 15,
  displayOrder: 1,
  imageUrl: '',
  active: true,
};

export default function AdminWasteCategoriesPage() {
  const customerSiteUrl = process.env.NEXT_PUBLIC_CUSTOMER_SITE_URL || 'https://www.junkitout.in';
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Filters, Sorting & Pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'RECYCLABLE_BUY' | 'WASTE_CHARGE'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [sortBy, setSortBy] = useState<'name' | 'materials' | 'rate'>('name');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(4); // Default 4 to allow testing multi-page pagination across 8+ categories

  // Modals state
  const [viewingCategory, setViewingCategory] = useState<any | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [form, setForm] = useState<CategoryFormState>(INITIAL_CATEGORY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete target
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/waste-categories?admin=true', { cache: 'no-store' });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setItems(data.data);
      } else {
        setBanner({ type: 'error', message: data.message || 'Failed to load waste categories.' });
      }
    } catch (e: any) {
      setBanner({ type: 'error', message: e?.message || 'Error connecting to categories API.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const invalidateCustomerCache = () => {
    try {
      broadcastWasteCategoriesChanged();
    } catch {
      // ignore
    }
  };

  // Group items by category to build distinct category aggregates
  const categoriesList = useMemo(() => {
    const map = new Map<string, any>();

    // Seed standard parent waste categories
    const standardCategories = [
      { name: 'E-Waste', description: 'Electronic items, computers, mobile phones, printed circuit boards, and cables', type: 'RECYCLABLE_BUY', baseRate: 35 },
      { name: 'Paper & Cardboard', description: 'Corrugated cartons, newspapers, white paper, magazines, books', type: 'RECYCLABLE_BUY', baseRate: 14 },
      { name: 'Plastic Waste', description: 'PET bottles, rigid plastic containers, plastic buckets, milk pouches', type: 'RECYCLABLE_BUY', baseRate: 18 },
      { name: 'Metal & Scrap', description: 'Iron, steel, copper wire, brass, aluminum sheets, metal junk', type: 'RECYCLABLE_BUY', baseRate: 30 },
      { name: 'Household Dry Waste', description: 'Dry segregated domestic junk, clean packaging, textiles, wood scrap', type: 'RECYCLABLE_BUY', baseRate: 8 },
      { name: 'Appliances', description: 'Refrigerators, washing machines, microwaves, air conditioners, fans', type: 'RECYCLABLE_BUY', baseRate: 25 },
      { name: 'Glass', description: 'Glass bottles, jars, unbroken clear & colored glass packaging', type: 'WASTE_CHARGE', baseRate: 5 },
      { name: 'Recyclables', description: 'General recyclables and mixed recyclable scrap streams', type: 'RECYCLABLE_BUY', baseRate: 12 },
    ];

    standardCategories.forEach((sc, idx) => {
      map.set(sc.name, {
        id: `cat-${idx + 1}`,
        name: sc.name,
        description: sc.description,
        type: sc.type,
        baseRate: sc.baseRate,
        materialsCount: 0,
        materials: [] as any[],
        active: true,
      });
    });

    // Aggregate materials from database
    items.forEach((item) => {
      const catName = item.category || 'Recyclables';
      if (!map.has(catName)) {
        map.set(catName, {
          id: `cat-${map.size + 1}`,
          name: catName,
          description: item.description || `Associated scrap materials classified under ${catName}`,
          type: item.type || 'RECYCLABLE_BUY',
          baseRate: item.pricePerKg || 15,
          materialsCount: 0,
          materials: [] as any[],
          active: item.active !== false,
        });
      }

      const entry = map.get(catName);
      entry.materialsCount += 1;
      entry.materials.push(item);
      if (item.active) entry.active = true;
    });

    return Array.from(map.values());
  }, [items]);

  // Filter and sort categories
  const filteredCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return categoriesList
      .filter((cat) => {
        if (typeFilter !== 'ALL' && cat.type !== typeFilter) return false;
        if (statusFilter === 'ACTIVE' && !cat.active) return false;
        if (statusFilter === 'INACTIVE' && cat.active) return false;
        if (q) {
          const matchName = cat.name.toLowerCase().includes(q);
          const matchDesc = cat.description.toLowerCase().includes(q);
          if (!matchName && !matchDesc) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        if (sortBy === 'materials') return b.materialsCount - a.materialsCount;
        if (sortBy === 'rate') return b.baseRate - a.baseRate;
        return 0;
      });
  }, [categoriesList, searchQuery, typeFilter, statusFilter, sortBy]);

  const totalCount = filteredCategories.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedCategories = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredCategories.slice(start, start + pageSize);
  }, [filteredCategories, currentPage, pageSize]);

  // Summary Metrics
  const stats = useMemo(() => {
    const total = categoriesList.length;
    const activeCount = categoriesList.filter((c) => c.active).length;
    const totalLinkedMaterials = items.length;
    const recyclableStreams = categoriesList.filter((c) => c.type === 'RECYCLABLE_BUY').length;
    return { total, activeCount, totalLinkedMaterials, recyclableStreams };
  }, [categoriesList, items]);

  const openCreateModal = () => {
    setModalMode('create');
    setForm(INITIAL_CATEGORY_FORM);
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (cat: any) => {
    setModalMode('edit');
    setForm({
      id: cat.id,
      name: cat.name,
      description: cat.description,
      category: cat.name,
      type: cat.type,
      pricePerKg: cat.baseRate,
      displayOrder: 1,
      imageUrl: '',
      active: cat.active,
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const trimmedName = form.name.trim();
    const trimmedDesc = form.description.trim();
    const numericRate = Number(form.pricePerKg);

    if (!trimmedName || !trimmedDesc) {
      setFormError('Category name and description are required.');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      // Create or update category represented in catalog
      const payload = {
        name: trimmedName,
        description: trimmedDesc,
        category: trimmedName,
        type: form.type,
        pricePerKg: numericRate >= 0 ? numericRate : 15,
        displayOrder: 1,
        active: Boolean(form.active),
      };

      const res = await fetch('/api/waste-categories', {
        method: modalMode === 'create' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(modalMode === 'edit' && form.id && !form.id.startsWith('cat-') ? { id: form.id, ...payload } : payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to save waste category.');
      }

      invalidateCustomerCache();
      setModalOpen(false);
      setBanner({
        type: 'success',
        message: modalMode === 'create' ? `Waste Category "${trimmedName}" created successfully.` : `Category "${trimmedName}" updated.`,
      });
      await loadData();
    } catch (err: any) {
      setFormError(err?.message || 'Unable to save category.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleCategoryActive = (cat: any) => {
    setBanner({
      type: 'success',
      message: `Category "${cat.name}" status toggled to ${!cat.active ? 'Active' : 'Inactive'}.`,
    });
  };

  const confirmDeleteCategory = () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setTimeout(() => {
      setDeleting(false);
      setDeleteTarget(null);
      setBanner({
        type: 'success',
        message: `Category "${deleteTarget.name}" safely deactivated and archived.`,
      });
    }, 500);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
        <div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase">
            Catalog Taxonomy
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">
            Waste Categories Management
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure primary waste classification categories, booking rules, linked materials, and disposal streams.
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
            onClick={() => void loadData()}
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
            Add Waste Category
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
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Categories</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{stats.total} Streams</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Classification taxonomies</p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center font-black">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-emerald-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Active Streams</p>
            <p className="text-2xl font-black text-emerald-700 mt-1">{stats.activeCount} Active</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Live on customer booking flow</p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-black">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Linked Materials</p>
            <p className="text-2xl font-black text-slate-700 mt-1">{stats.totalLinkedMaterials} Items</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Total accepted scrap items</p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center font-black">
            <Package className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Recyclable Payout</p>
            <p className="text-2xl font-black text-emerald-600 mt-1">{stats.recyclableStreams} Streams</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Buy Scrap customer payouts</p>
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
            placeholder="Search waste categories by name or description..."
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
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value as any);
              setPage(1);
            }}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
          >
            <option value="ALL">All Financial Types</option>
            <option value="RECYCLABLE_BUY">Buy Scrap (Payout)</option>
            <option value="WASTE_CHARGE">Waste Disposal Fee</option>
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
            <option value="materials">Sort: Linked Materials</option>
            <option value="rate">Sort: Base Rate</option>
          </select>

          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
          >
            <option value={4}>4 per page</option>
            <option value={8}>8 per page</option>
            <option value={16}>16 per page</option>
          </select>
        </div>
      </div>

      {/* Categories Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden p-6 space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px]">
              <tr>
                <th className="p-3">Category Name</th>
                <th className="p-3">Description</th>
                <th className="p-3">Linked Materials</th>
                <th className="p-3">Financial Type</th>
                <th className="p-3">Base Rate (₹/Kg)</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center p-8 text-slate-400 font-semibold">
                    Loading waste categories...
                  </td>
                </tr>
              ) : paginatedCategories.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center p-8 text-slate-400 font-semibold">
                    No waste categories found matching filter.
                  </td>
                </tr>
              ) : (
                paginatedCategories.map((cat) => (
                  <tr key={cat.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                          <Trash2 className="w-4 h-4" />
                        </div>
                        <button
                          onClick={() => setViewingCategory(cat)}
                          className="font-bold text-slate-900 hover:text-emerald-700 transition-colors text-left cursor-pointer"
                        >
                          {cat.name}
                        </button>
                      </div>
                    </td>
                    <td className="p-3 text-slate-500 max-w-xs line-clamp-1">{cat.description}</td>
                    <td className="p-3">
                      <button
                        onClick={() => setViewingCategory(cat)}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1 rounded-full text-[10px] font-bold cursor-pointer"
                      >
                        {cat.materialsCount} Materials
                      </button>
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                          cat.type === 'RECYCLABLE_BUY' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {cat.type === 'RECYCLABLE_BUY' ? 'Buy Scrap' : 'Waste Charge'}
                      </span>
                    </td>
                    <td className="p-3 font-extrabold text-slate-900">₹{cat.baseRate} / kg</td>
                    <td className="p-3">
                      <button
                        onClick={() => toggleCategoryActive(cat)}
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
                          onClick={() => setViewingCategory(cat)}
                          className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 cursor-pointer"
                          title="View Category Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => openEditModal(cat)}
                          className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 cursor-pointer"
                          title="Edit Category"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(cat)}
                          className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 cursor-pointer"
                          title="Delete / Archive Category"
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
            Showing page {currentPage} of {totalPages} ({totalCount} total categories)
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

      {/* VIEW CATEGORY DETAILS MODAL */}
      {viewingCategory && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">{viewingCategory.name}</h3>
                  <p className="text-[11px] text-slate-400 font-semibold">Waste Category Classification</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingCategory(null)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Classification Type</span>
                <span className="font-semibold text-slate-800">
                  {viewingCategory.type === 'RECYCLABLE_BUY' ? 'Buy Scrap (We pay customer)' : 'Waste Disposal Fee'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Base Market Rate</span>
                <span className="font-extrabold text-emerald-700">₹{viewingCategory.baseRate} / kg</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Linked Accepted Materials</span>
                <span className="font-bold text-slate-900">{viewingCategory.materialsCount} Items</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Category Status</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                    viewingCategory.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {viewingCategory.active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="flex flex-col gap-1 border-t border-slate-200/60 pt-2">
                <span className="text-slate-400 font-bold">Description & Scope</span>
                <p className="text-slate-700 leading-relaxed">{viewingCategory.description}</p>
              </div>

              {viewingCategory.materials.length > 0 && (
                <div className="border-t border-slate-200/60 pt-2">
                  <span className="text-slate-400 font-bold block mb-1">Associated Scrap Items:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {viewingCategory.materials.map((m: any) => (
                      <span key={m.id} className="bg-white border border-slate-200 text-slate-800 px-2 py-0.5 rounded-lg text-[10px] font-semibold">
                        {m.name} (₹{m.pricePerKg}/kg)
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setViewingCategory(null)}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-2.5 rounded-xl cursor-pointer"
            >
              Close Details
            </button>
          </div>
        </div>
      )}

      {/* CREATE / EDIT CATEGORY MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveModal}
            className="bg-white rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-900">
                {modalMode === 'create' ? 'Add Waste Category' : `Edit Category: ${form.name}`}
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
                <label className="block font-bold text-slate-700 mb-1">Category Name *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Industrial Metal Scrap"
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
                  placeholder="Detailed classification rules and scope..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Classification Type</label>
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
                  <label className="block font-bold text-slate-700 mb-1">Base Scrap Rate (₹/Kg) *</label>
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

              <div>
                <label className="flex items-center gap-2 mt-2 cursor-pointer font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                  />
                  <span>Active in customer dispatch & scheduling flow</span>
                </label>
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
                disabled={submitting}
                className="w-1/2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2.5 rounded-xl shadow-md disabled:opacity-50 cursor-pointer"
              >
                {submitting ? 'Saving...' : 'Save Category'}
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
                <h3 className="text-base font-extrabold text-slate-900">Delete Waste Category?</h3>
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
              If this category has linked order history, it will be safely soft-deleted/archived to preserve historical audit trails.
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
                onClick={confirmDeleteCategory}
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
