'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Users,
  Truck,
  Star,
  Phone,
  MapPin,
  RefreshCw,
  Plus,
  AlertCircle,
  UserX,
  Loader2,
  Search,
  Filter,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { adminFetch } from '@/lib/api';

export default function AdminAgentsPage() {
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search, filter, sort & pagination state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'name' | 'rating' | 'vehicle'>('name');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Agent profile details modal state
  const [selectedAgentDetails, setSelectedAgentDetails] = useState<any | null>(null);

  // Remove agent state
  const [removeTarget, setRemoveTarget] = useState<any | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeMessage, setRemoveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Add agent modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [vehicleType, setVehicleType] = useState('Three-Wheeler Auto Loading');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [serviceAreas, setServiceAreas] = useState('JP Nagar, Jayanagar, BTM Layout');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const isFetchingRef = useRef(false);

  const loadAgents = async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch('/api/admin/agents');
      const data = await res.json();
      if (data.success) {
        setAgents(data.data || []);
      } else {
        setError(data.message || 'Failed to fetch field agents.');
      }
    } catch (e: any) {
      setError(e.message || 'Error connecting to backend API.');
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAgents();
  }, []);

  const toggleAgentStatus = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'OFFLINE' ? 'AVAILABLE' : 'OFFLINE';
    try {
      const res = await adminFetch('/api/admin/agents', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: nextStatus }),
      });
      const data = await res.json();
      if (data.success) {
        loadAgents();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleConfirmRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    setRemoveMessage(null);
    try {
      const res = await adminFetch('/api/admin/agents', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: removeTarget.id, status: 'OFFLINE' }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setRemoveMessage({ type: 'success', text: 'Agent removed from active fleet.' });
        setTimeout(() => {
          setRemoveTarget(null);
          loadAgents();
        }, 1200);
      } else {
        setRemoveMessage({ type: 'error', text: data.message || 'Failed to remove agent.' });
      }
    } catch (e: any) {
      setRemoveMessage({ type: 'error', text: e.message || 'Error connecting to server.' });
    } finally {
      setRemoving(false);
    }
  };

  const handleAddAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone || !vehicleNumber) return;
    setAddLoading(true);
    setAddError(null);
    try {
      const res = await adminFetch('/api/admin/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, vehicleType, vehicleNumber, serviceAreas }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setShowAddModal(false);
        setName('');
        setPhone('');
        setVehicleNumber('');
        loadAgents();
      } else {
        setAddError(data.message || 'Failed to register field agent.');
      }
    } catch (e: any) {
      setAddError(e.message || 'Error connecting to backend API.');
    } finally {
      setAddLoading(false);
    }
  };

  // Filtered and sorted agents
  const filteredAgents = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return agents
      .filter((ag) => {
        if (statusFilter !== 'ALL' && ag.status !== statusFilter) return false;
        if (!q) return true;
        return (
          ag.name?.toLowerCase().includes(q) ||
          ag.phone?.includes(q) ||
          ag.vehicleNumber?.toLowerCase().includes(q) ||
          ag.serviceAreas?.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
        if (sortBy === 'rating') return (Number(b.rating) || 5) - (Number(a.rating) || 5);
        if (sortBy === 'vehicle') return (a.vehicleNumber || '').localeCompare(b.vehicleNumber || '');
        return 0;
      });
  }, [agents, searchQuery, statusFilter, sortBy]);

  const totalPages = Math.ceil(filteredAgents.length / pageSize) || 1;
  const paginatedAgents = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAgents.slice(start, start + pageSize);
  }, [filteredAgents, currentPage, pageSize]);

  // Metric counts
  const availableCount = agents.filter((a) => a.status === 'AVAILABLE').length;
  const inTransitCount = agents.filter((a) => a.status === 'ASSIGNED' || a.status === 'EN_ROUTE').length;
  const offlineCount = agents.filter((a) => a.status === 'OFFLINE').length;

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase">
            Fleet Operations
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">Field Agents Roster</h1>
          <p className="text-xs text-slate-500">Manage, register, and toggle availability of field drivers and agents.</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setAddError(null);
              setShowAddModal(true);
            }}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-md flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            REGISTER NEW AGENT
          </button>
          <button
            onClick={loadAgents}
            className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase text-slate-400">Total Fleet</p>
            <p className="text-xl font-black text-slate-900">{agents.length} Drivers</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold">
            <Users className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase text-slate-400">Available For Dispatch</p>
            <p className="text-xl font-black text-emerald-700">{availableCount} Ready</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
            <CheckCircle className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase text-slate-400">In-Transit / Assigned</p>
            <p className="text-xl font-black text-blue-700">{inTransitCount} Active</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
            <Truck className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase text-slate-400">Offline</p>
            <p className="text-xl font-black text-slate-500">{offlineCount} Inactive</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center font-bold">
            <XCircle className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search agent by name, phone, vehicle or area..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                setCurrentPage(1);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full sm:w-44 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
          >
            <option value="ALL">All Statuses</option>
            <option value="AVAILABLE">Available</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="EN_ROUTE">En Route</option>
            <option value="OFFLINE">Offline</option>
          </select>

          <ArrowUpDown className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="w-full sm:w-36 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
          >
            <option value="name">Sort: Name</option>
            <option value="rating">Sort: Rating</option>
            <option value="vehicle">Sort: Vehicle</option>
          </select>
        </div>
      </div>

      {/* AGENTS TABLE */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden p-6 space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px]">
              <tr>
                <th className="p-3">Agent Name</th>
                <th className="p-3">Phone</th>
                <th className="p-3">Vehicle Details</th>
                <th className="p-3">Service Areas</th>
                <th className="p-3">Rating</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center p-8 text-slate-400 font-semibold">
                    Loading agent roster...
                  </td>
                </tr>
              ) : paginatedAgents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center p-8 text-slate-400 font-semibold">
                    No field agents found matching filter criteria.
                  </td>
                </tr>
              ) : (
                paginatedAgents.map((ag) => (
                  <tr key={ag.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3">
                      <button
                        onClick={() => setSelectedAgentDetails(ag)}
                        className="font-bold text-slate-900 hover:text-emerald-700 transition-colors cursor-pointer text-left"
                      >
                        {ag.name}
                      </button>
                    </td>
                    <td className="p-3 font-mono text-slate-600">{ag.phone}</td>
                    <td className="p-3 text-slate-800">
                      <span className="font-bold">{ag.vehicleType}</span>
                      <span className="block text-[11px] text-slate-400">{ag.vehicleNumber}</span>
                    </td>
                    <td className="p-3 text-slate-600">{ag.serviceAreas || 'South Bengaluru'}</td>
                    <td className="p-3 font-bold text-amber-600">★ {ag.rating || '5.0'}</td>
                    <td className="p-3">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                          ag.status === 'AVAILABLE'
                            ? 'bg-emerald-100 text-emerald-800'
                            : ag.status === 'ASSIGNED' || ag.status === 'EN_ROUTE'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {ag.status}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setSelectedAgentDetails(ag)}
                          className="bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Profile
                        </button>
                        <button
                          onClick={() => toggleAgentStatus(ag.id, ag.status)}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-800 px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer"
                        >
                          Toggle {ag.status === 'OFFLINE' ? 'Online' : 'Offline'}
                        </button>
                        {ag.status !== 'OFFLINE' && (
                          <button
                            onClick={() => {
                              setRemoveTarget(ag);
                              setRemoveMessage(null);
                            }}
                            className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-colors"
                          >
                            Remove Agent
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION BAR */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100 text-xs text-slate-500 font-bold">
          <div>
            Showing page {currentPage} of {totalPages} ({filteredAgents.length} total field agents)
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Previous
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1 cursor-pointer"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* AGENT PROFILE DETAILS MODAL */}
      {selectedAgentDetails && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">{selectedAgentDetails.name}</h3>
                  <p className="text-[11px] text-slate-400 font-semibold">Field Agent Profile</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAgentDetails(null)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Contact Phone</span>
                <span className="font-mono font-extrabold text-slate-900">{selectedAgentDetails.phone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Fleet Status</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                    selectedAgentDetails.status === 'AVAILABLE'
                      ? 'bg-emerald-100 text-emerald-800'
                      : selectedAgentDetails.status === 'OFFLINE'
                      ? 'bg-slate-200 text-slate-700'
                      : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  {selectedAgentDetails.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Vehicle Registration</span>
                <span className="font-mono font-bold text-slate-900">{selectedAgentDetails.vehicleNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Vehicle Class</span>
                <span className="font-semibold text-slate-700">{selectedAgentDetails.vehicleType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Authorized Zones</span>
                <span className="font-semibold text-slate-700">{selectedAgentDetails.serviceAreas || 'South Bengaluru'}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200/60 pt-2">
                <span className="text-slate-400 font-bold">Service Rating</span>
                <span className="font-bold text-amber-600">★ {selectedAgentDetails.rating || '5.0'} / 5.0</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSelectedAgentDetails(null)}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-2.5 rounded-xl cursor-pointer"
            >
              Close Profile
            </button>
          </div>
        </div>
      )}

      {/* REMOVE AGENT CONFIRMATION MODAL */}
      {removeTarget && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-900">Remove Agent?</h3>
              <button
                type="button"
                onClick={() => setRemoveTarget(null)}
                disabled={removing}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              This will remove <strong className="text-slate-900 font-bold">{removeTarget.name}</strong> from active fleet operations. Existing order history will be preserved.
            </p>

            {removeMessage && (
              <div
                className={`p-3 rounded-xl text-xs font-bold ${
                  removeMessage.type === 'success'
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border border-rose-200 text-rose-800'
                }`}
              >
                {removeMessage.text}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRemoveTarget(null)}
                disabled={removing}
                className="w-1/2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2.5 rounded-xl disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRemove}
                disabled={removing}
                className="w-1/2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-2.5 rounded-xl shadow-md disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {removing ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserX className="w-4 h-4" />}
                {removing ? 'Removing...' : 'Remove Agent'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REGISTER NEW AGENT MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleAddAgent} className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-900">Register New Field Agent</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            {addError && (
              <div className="p-3 rounded-xl text-xs font-bold bg-rose-50 border border-rose-200 text-rose-800">
                {addError}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Ramesh Kumar"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Phone Number</label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91XXXXXXXXXX"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Vehicle Type</label>
                <input
                  type="text"
                  required
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Vehicle Registration Number</label>
                <input
                  type="text"
                  required
                  value={vehicleNumber}
                  onChange={(e) => setVehicleNumber(e.target.value)}
                  placeholder="KA-05-EX-1234"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="w-1/2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2.5 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addLoading}
                className="w-1/2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2.5 rounded-xl shadow-md disabled:opacity-50 cursor-pointer"
              >
                {addLoading ? 'Saving...' : 'Save Agent'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
