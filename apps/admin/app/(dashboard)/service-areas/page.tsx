'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { ServiceZone } from '@/lib/geofence';
import InteractiveMap from '@/components/InteractiveMap';
import { adminFetch } from '@/lib/api';
import {
  RefreshCw,
  Power,
  Search,
  Plus,
  MapPin,
  AlertTriangle,
  Trash2,
  Edit2,
  X,
  CheckCircle2,
  Eye,
  ArrowUpDown,
} from 'lucide-react';

export default function AdminServiceAreasPage() {
  const [zones, setZones] = useState<ServiceZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [sortBy, setSortBy] = useState<'name' | 'feeAsc' | 'etaAsc'>('name');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(3);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal states
  const [detailsZone, setDetailsZone] = useState<ServiceZone | null>(null);
  const [toggleZone, setToggleZone] = useState<ServiceZone | null>(null);
  const [editZone, setEditZone] = useState<ServiceZone | null>(null);
  const [deleteZone, setDeleteZone] = useState<ServiceZone | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form states for Add / Edit
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    etaMinutes: 25,
    basePickupCharge: 50,
    centerLat: 12.9166,
    centerLng: 77.5996,
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
  });

  const isFetchingRef = useRef(false);

  const fetchServiceAreas = async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await adminFetch('/api/service-areas');
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        const data = json.data || json;
        if (Array.isArray(data)) {
          const parsed = data.map((z: any) => ({
            ...z,
            boundaryPolygon:
              typeof z.boundaryPolygon === 'string'
                ? JSON.parse(z.boundaryPolygon)
                : z.boundaryPolygon || [],
          }));
          setZones(parsed);
        }
      } else {
        const err = json?.error?.message || json?.message || `Failed to fetch service areas (${res.status})`;
        setErrorMsg(err);
      }
    } catch (err: any) {
      console.error('Failed to fetch service areas:', err);
      setErrorMsg(err.message || 'Network error fetching service areas.');
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServiceAreas();
  }, []);

  // Filtered and Sorted zones
  const filteredZones = useMemo(() => {
    const list = zones.filter((z) => {
      const matchesSearch =
        z.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        z.id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus =
        statusFilter === 'ALL'
          ? true
          : statusFilter === 'ACTIVE'
          ? z.status === 'ACTIVE'
          : z.status !== 'ACTIVE';
      return matchesSearch && matchesStatus;
    });

    if (sortBy === 'name') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'feeAsc') {
      list.sort((a, b) => (a.basePickupCharge || 50) - (b.basePickupCharge || 50));
    } else if (sortBy === 'etaAsc') {
      list.sort((a, b) => (a.etaMinutes || 25) - (b.etaMinutes || 25));
    }

    return list;
  }, [zones, searchQuery, statusFilter, sortBy]);

  const activeCount = useMemo(() => zones.filter((z) => z.status === 'ACTIVE').length, [zones]);
  const inactiveCount = useMemo(() => zones.filter((z) => z.status !== 'ACTIVE').length, [zones]);

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(filteredZones.length / pageSize));
  const paginatedZones = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredZones.slice(start, start + pageSize);
  }, [filteredZones, currentPage, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  // Handle Toggle Status
  const handleConfirmToggle = async () => {
    if (!toggleZone || submitting) return;
    const nextStatus = toggleZone.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await adminFetch('/api/service-areas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: toggleZone.id, status: nextStatus }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error?.message || json?.message || `Failed to update status (${res.status})`);
      }

      setSuccessMsg(`Zone "${toggleZone.name}" status updated to ${nextStatus}.`);
      setToggleZone(null);
      await fetchServiceAreas();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update zone status.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Add New Service Area
  const handleCreateZone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await adminFetch('/api/service-areas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          etaMinutes: Number(formData.etaMinutes),
          basePickupCharge: Number(formData.basePickupCharge),
          centerLat: Number(formData.centerLat),
          centerLng: Number(formData.centerLng),
          status: formData.status,
          boundaryPolygon: [
            [Number(formData.centerLat) + 0.015, Number(formData.centerLng) - 0.015],
            [Number(formData.centerLat) + 0.015, Number(formData.centerLng) + 0.015],
            [Number(formData.centerLat) - 0.015, Number(formData.centerLng) + 0.015],
            [Number(formData.centerLat) - 0.015, Number(formData.centerLng) - 0.015],
          ],
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error?.message || json?.message || `Failed to create service area (${res.status})`);
      }

      setSuccessMsg(`Service area "${formData.name}" created successfully.`);
      setIsAddModalOpen(false);
      setFormData({
        id: '',
        name: '',
        etaMinutes: 25,
        basePickupCharge: 50,
        centerLat: 12.9166,
        centerLng: 77.5996,
        status: 'ACTIVE',
      });
      await fetchServiceAreas();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create service area.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Edit Service Area
  const handleUpdateZone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editZone || submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await adminFetch('/api/service-areas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editZone.id,
          name: formData.name.trim(),
          etaMinutes: Number(formData.etaMinutes),
          basePickupCharge: Number(formData.basePickupCharge),
          centerLat: Number(formData.centerLat),
          centerLng: Number(formData.centerLng),
          status: formData.status,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error?.message || json?.message || `Failed to update service area (${res.status})`);
      }

      setSuccessMsg(`Service area "${formData.name}" updated successfully.`);
      setEditZone(null);
      await fetchServiceAreas();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update service area.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Delete Service Area
  const handleConfirmDelete = async () => {
    if (!deleteZone || submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await adminFetch(`/api/service-areas?id=${encodeURIComponent(deleteZone.id)}`, {
        method: 'DELETE',
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error?.message || json?.message || `Failed to delete service area (${res.status})`);
      }

      setSuccessMsg(`Service area "${deleteZone.name}" deleted successfully.`);
      setDeleteZone(null);
      await fetchServiceAreas();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete service area.');
    } finally {
      setSubmitting(false);
    }
  };

  const openEditModal = (z: ServiceZone) => {
    setEditZone(z);
    setFormData({
      id: z.id,
      name: z.name,
      etaMinutes: z.etaMinutes || 25,
      basePickupCharge: z.basePickupCharge || 50,
      centerLat: z.centerLat || 12.9166,
      centerLng: z.centerLng || 77.5996,
      status: z.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase">
            Geofence & Service Areas
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">
            Service Areas & Boundaries
          </h1>
          <p className="text-xs text-slate-500">
            Configure active Bengaluru service areas, SLA response times, and base pickup fees.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setFormData({
                id: '',
                name: '',
                etaMinutes: 25,
                basePickupCharge: 50,
                centerLat: 12.9166,
                centerLng: 77.5996,
                status: 'ACTIVE',
              });
              setIsAddModalOpen(true);
            }}
            className="inline-flex items-center gap-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 rounded-xl transition-all shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Service Area
          </button>
          <button
            onClick={fetchServiceAreas}
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
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
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

      {/* Interactive Map */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm overflow-hidden h-96">
        <InteractiveMap
          centerLat={12.9077}
          centerLng={77.5854}
          zoom={12}
          polygons={zones
            .filter((z) => z.boundaryPolygon && z.boundaryPolygon.length > 0)
            .map((z) => ({ name: z.name, coordinates: z.boundaryPolygon }))}
          className="h-full w-full rounded-2xl border border-slate-200"
        />
      </div>

      {/* Search, Filters and Sorting Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search service areas..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full text-xs pl-9 pr-8 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                setCurrentPage(1);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                setStatusFilter('ALL');
                setCurrentPage(1);
              }}
              className={`text-xs font-bold px-3 py-2 rounded-xl transition-all ${
                statusFilter === 'ALL'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All ({zones.length})
            </button>
            <button
              onClick={() => {
                setStatusFilter('ACTIVE');
                setCurrentPage(1);
              }}
              className={`text-xs font-bold px-3 py-2 rounded-xl transition-all ${
                statusFilter === 'ACTIVE'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Active ({activeCount})
            </button>
            <button
              onClick={() => {
                setStatusFilter('INACTIVE');
                setCurrentPage(1);
              }}
              className={`text-xs font-bold px-3 py-2 rounded-xl transition-all ${
                statusFilter === 'INACTIVE'
                  ? 'bg-rose-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Inactive ({inactiveCount})
            </button>
          </div>

          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as any);
              setCurrentPage(1);
            }}
            className="text-xs p-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
          >
            <option value="name">Sort: Name (A-Z)</option>
            <option value="feeAsc">Sort: Base Fee</option>
            <option value="etaAsc">Sort: ETA (Fastest)</option>
          </select>
        </div>
      </div>

      {/* Service Area Cards Grid */}
      {filteredZones.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-3xl border border-slate-200">
          <p className="text-sm font-bold text-slate-700">No service areas found</p>
          <p className="text-xs text-slate-400 mt-1">
            Try adjusting your search query or status filter.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedZones.map((z) => {
              const isActive = z.status === 'ACTIVE';
              return (
                <div
                  key={z.id}
                  className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4 flex flex-col justify-between hover:shadow-md transition-shadow"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 truncate">
                        <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-sm shrink-0">
                          📍
                        </div>
                        <span className="font-extrabold text-slate-900 text-sm truncate">{z.name}</span>
                      </div>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase shrink-0 ${
                          isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {z.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                      <div>
                        <span className="block text-[10px] uppercase font-bold text-slate-400">Target ETA</span>
                        <span className="font-black text-slate-900 text-xs">{z.etaMinutes} mins</span>
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase font-bold text-slate-400">Base Fee</span>
                        <span className="font-black text-slate-900 text-xs">₹{z.basePickupCharge}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase font-bold text-slate-400">Center Lat</span>
                        <span className="font-mono text-slate-700 text-[11px]">{z.centerLat?.toFixed(4) || '—'}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase font-bold text-slate-400">Center Lng</span>
                        <span className="font-mono text-slate-700 text-[11px]">{z.centerLng?.toFixed(4) || '—'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                    <button
                      onClick={() => setToggleZone(z)}
                      className={`flex-1 text-xs font-bold px-3 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                        isActive
                          ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                          : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                      }`}
                    >
                      <Power className="w-3.5 h-3.5" />
                      {isActive ? 'Deactivate' : 'Activate'}
                    </button>

                    <button
                      onClick={() => setDetailsZone(z)}
                      className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
                      title="View Area Details"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => openEditModal(z)}
                      className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
                      title="Edit Area Details"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => setDeleteZone(z)}
                      className="p-2 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors"
                      title="Delete Service Area"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Areas per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="text-xs p-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="3">3</option>
                <option value="6">6</option>
                <option value="12">12</option>
              </select>
              <span className="text-xs text-slate-500">
                Showing page {currentPage} of {totalPages} ({filteredZones.length} total service areas)
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
      )}

      {/* Confirmation Modal: Toggle Status */}
      {toggleZone && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm"
        >
          <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                  toggleZone.status === 'ACTIVE'
                    ? 'bg-amber-100 text-amber-600'
                    : 'bg-emerald-100 text-emerald-600'
                }`}
              >
                {toggleZone.status === 'ACTIVE' ? (
                  <AlertTriangle className="w-5 h-5" />
                ) : (
                  <MapPin className="w-5 h-5" />
                )}
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  {toggleZone.status === 'ACTIVE'
                    ? 'Deactivate Service Area?'
                    : 'Activate Service Area?'}
                </h3>
                <p className="text-xs text-slate-500">{toggleZone.name}</p>
              </div>
            </div>

            <div
              className={`border rounded-2xl p-4 text-xs space-y-2 ${
                toggleZone.status === 'ACTIVE'
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-900'
              }`}
            >
              {toggleZone.status === 'ACTIVE' ? (
                <>
                  <p className="font-bold">
                    Deactivating will pause new customer bookings in this zone.
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-[11px]">
                    <li>
                      Customers selecting pickup addresses in <strong>{toggleZone.name}</strong> will receive an out-of-service notification.
                    </li>
                    <li>
                      <strong>Existing & historical orders in this area are NOT affected or deleted.</strong>
                    </li>
                    <li>The service area record remains safe in the database.</li>
                  </ul>
                </>
              ) : (
                <>
                  <p className="font-bold">
                    Activating will enable customer scrap pickups in this zone immediately.
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-[11px]">
                    <li>
                      Customers can select addresses and book pickups in <strong>{toggleZone.name}</strong>.
                    </li>
                  </ul>
                </>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setToggleZone(null)}
                className="w-1/2 bg-slate-100 text-slate-700 font-bold text-xs py-3 rounded-xl hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleConfirmToggle}
                className={`w-1/2 font-bold text-xs py-3 rounded-xl shadow-md text-white flex items-center justify-center gap-2 ${
                  toggleZone.status === 'ACTIVE'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Updating...
                  </>
                ) : toggleZone.status === 'ACTIVE' ? (
                  'Deactivate Area'
                ) : (
                  'Activate Area'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add Service Area */}
      {isAddModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm"
        >
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-900">Add New Service Area</h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold flex items-center justify-between">
                <span>{errorMsg}</span>
                <button type="button" onClick={() => setErrorMsg(null)} className="text-rose-500 hover:text-rose-700">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <form onSubmit={handleCreateZone} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Area Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. HSR Layout (Sectors 1 to 7)"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Target ETA (Mins)</label>
                  <input
                    type="number"
                    min="5"
                    max="180"
                    value={formData.etaMinutes}
                    onChange={(e) => setFormData({ ...formData, etaMinutes: Number(e.target.value) })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Base Fee (₹)</label>
                  <input
                    type="number"
                    min="0"
                    max="500"
                    value={formData.basePickupCharge}
                    onChange={(e) =>
                      setFormData({ ...formData, basePickupCharge: Number(e.target.value) })
                    }
                    className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Center Latitude</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={formData.centerLat}
                    onChange={(e) => setFormData({ ...formData, centerLat: Number(e.target.value) })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Center Longitude</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={formData.centerLng}
                    onChange={(e) => setFormData({ ...formData, centerLng: Number(e.target.value) })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Initial Status</label>
                <select
                  value={formData.status}
                  onChange={(e) =>
                    setFormData({ ...formData, status: e.target.value as 'ACTIVE' | 'INACTIVE' })
                  }
                  className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                >
                  <option value="ACTIVE">ACTIVE (Accept Bookings)</option>
                  <option value="INACTIVE">INACTIVE (Disabled)</option>
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setIsAddModalOpen(false)}
                  className="w-1/2 bg-slate-100 text-slate-700 font-bold text-xs py-3 rounded-xl hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-1/2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-3 rounded-xl shadow-md flex items-center justify-center gap-2"
                >
                  {submitting ? 'Creating...' : 'Create Area'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Service Area */}
      {editZone && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm"
        >
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-900">Edit Service Area</h3>
              <button onClick={() => setEditZone(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold flex items-center justify-between">
                <span>{errorMsg}</span>
                <button type="button" onClick={() => setErrorMsg(null)} className="text-rose-500 hover:text-rose-700">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <form onSubmit={handleUpdateZone} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Area Name *</label>
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
                  <label className="block font-bold text-slate-700 mb-1">Target ETA (Mins)</label>
                  <input
                    type="number"
                    min="5"
                    max="180"
                    value={formData.etaMinutes}
                    onChange={(e) => setFormData({ ...formData, etaMinutes: Number(e.target.value) })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Base Fee (₹)</label>
                  <input
                    type="number"
                    min="0"
                    max="500"
                    value={formData.basePickupCharge}
                    onChange={(e) =>
                      setFormData({ ...formData, basePickupCharge: Number(e.target.value) })
                    }
                    className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Center Latitude</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={formData.centerLat}
                    onChange={(e) => setFormData({ ...formData, centerLat: Number(e.target.value) })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Center Longitude</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={formData.centerLng}
                    onChange={(e) => setFormData({ ...formData, centerLng: Number(e.target.value) })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) =>
                    setFormData({ ...formData, status: e.target.value as 'ACTIVE' | 'INACTIVE' })
                  }
                  className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setEditZone(null)}
                  className="w-1/2 bg-slate-100 text-slate-700 font-bold text-xs py-3 rounded-xl hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-1/2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-3 rounded-xl shadow-md flex items-center justify-center gap-2"
                >
                  {submitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Delete Area */}
      {deleteZone && (
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
                <h3 className="text-base font-extrabold text-slate-900">Delete Service Area?</h3>
                <p className="text-xs text-slate-500">{deleteZone.name}</p>
              </div>
            </div>

            <div className="border border-rose-200 bg-rose-50 rounded-2xl p-4 text-xs text-rose-900 space-y-2">
              <p className="font-bold">This action cannot be undone.</p>
              <ul className="list-disc list-inside space-y-1 text-[11px]">
                <li>
                  If active orders exist in <strong>{deleteZone.name}</strong>, deletion will be safely rejected.
                </li>
                <li>Associated pricing rules for this area will be deleted.</li>
              </ul>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setDeleteZone(null)}
                className="w-1/2 bg-slate-100 text-slate-700 font-bold text-xs py-3 rounded-xl hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleConfirmDelete}
                className="w-1/2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-3 rounded-xl shadow-md flex items-center justify-center gap-2"
              >
                {submitting ? 'Deleting...' : 'Delete Area'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Details Modal: View Area Details */}
      {detailsZone && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm"
        >
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-lg">
                  📍
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">{detailsZone.name}</h3>
                  <p className="text-xs text-slate-500">Zone ID: {detailsZone.id}</p>
                </div>
              </div>
              <button
                onClick={() => setDetailsZone(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Service Status</span>
                <span className={`text-xs font-black uppercase ${detailsZone.status === 'ACTIVE' ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {detailsZone.status}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Target SLA ETA</span>
                <span className="text-xs font-black text-slate-900">{detailsZone.etaMinutes} minutes</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Base Pickup Charge</span>
                <span className="text-xs font-black text-slate-900">₹{detailsZone.basePickupCharge}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Boundary Points</span>
                <span className="text-xs font-black text-slate-900">
                  {detailsZone.boundaryPolygon?.length || 0} polygon coordinates
                </span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-xs space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Geographic Center</span>
              <p className="font-mono text-slate-700 text-xs">
                Lat: {detailsZone.centerLat?.toFixed(6) || '—'}, Lng: {detailsZone.centerLng?.toFixed(6) || '—'}
              </p>
            </div>

            <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-100 text-xs text-emerald-900 space-y-1">
              <p className="font-bold">Bengaluru Coverage & Dispatch Rule</p>
              <p className="text-[11px] text-emerald-800">
                Orders with customer coordinates falling inside this geofenced polygon are automatically dispatched with an estimated ETA of {detailsZone.etaMinutes} mins and a baseline pickup fee of ₹{detailsZone.basePickupCharge}.
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setDetailsZone(null)}
                className="w-full bg-slate-100 text-slate-700 font-bold text-xs py-3 rounded-xl hover:bg-slate-200 transition-colors"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
