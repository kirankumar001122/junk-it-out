'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  Package,
  Search,
  Filter,
  RefreshCw,
  Eye,
  UserPlus,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { adminFetch } from '@/lib/api';

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);
  const limit = 25;

  const [selectedOrderForAssign, setSelectedOrderForAssign] = useState<any>(null);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadOrders = useCallback(async (targetPage = 1, search = searchTerm, status = filterStatus) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: String(limit),
      });
      if (search.trim()) params.set('search', search.trim());
      if (status !== 'ALL') params.set('status', status);

      const ordersRes = await adminFetch(`/api/orders?${params.toString()}`)
        .then((r) => r.json())
        .catch(() => ({ success: false }));

      if (ordersRes.success) {
        setOrders(ordersRes.data || []);
        if (ordersRes.meta) {
          setPage(ordersRes.meta.page || targetPage);
          setTotalPages(ordersRes.meta.totalPages || 1);
          setTotalOrders(ordersRes.meta.total !== undefined ? ordersRes.meta.total : (ordersRes.data?.length ?? 0));
        } else {
          setPage(targetPage);
          setTotalPages(1);
          setTotalOrders(ordersRes.data?.length ?? 0);
        }
      }
    } catch (e: any) {
      console.error('Error loading orders:', e);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, filterStatus]);

  const loadAgents = async () => {
    try {
      setAgentsLoading(true);
      setAgentsError(null);
      const agentsRes = await adminFetch('/api/admin/agents')
        .then((r) => r.json())
        .catch(() => ({ success: false }));

      if (agentsRes.success) {
        setAgents(agentsRes.data || []);
      } else {
        setAgentsError(agentsRes.error?.message || agentsRes.message || 'Failed to load field agents.');
      }
    } catch (e: any) {
      console.error('Error loading field agents:', e);
      setAgentsError('Error loading field agents.');
    } finally {
      setAgentsLoading(false);
    }
  };

  const loadOrdersAndAgents = () => {
    loadOrders(page, searchTerm, filterStatus);
    loadAgents();
  };

  useEffect(() => {
    loadOrders(1, '', 'ALL');
    loadAgents();
  }, []);

  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      loadOrders(1, val, filterStatus);
    }, 350);
  };

  const handleStatusChange = (val: string) => {
    setFilterStatus(val);
    loadOrders(1, searchTerm, val);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    loadOrders(newPage, searchTerm, filterStatus);
  };

  useEffect(() => {
    if (selectedOrderForAssign && !selectedAgentId && agents.length > 0) {
      if (selectedOrderForAssign.agentId && agents.some((a: any) => a.id === selectedOrderForAssign.agentId)) {
        setSelectedAgentId(selectedOrderForAssign.agentId);
      } else {
        const firstAvailable = agents.find((a: any) => a.status === 'AVAILABLE');
        setSelectedAgentId(firstAvailable ? firstAvailable.id : (agents[0]?.id || ''));
      }
    }
  }, [agents, selectedOrderForAssign, selectedAgentId]);

  const openAssignModal = (order: any) => {
    setSelectedOrderForAssign(order);
    setAssignError(null);
    if (order.agentId && agents.some((a) => a.id === order.agentId)) {
      setSelectedAgentId(order.agentId);
    } else if (agents.length > 0) {
      setSelectedAgentId(agents[0].id);
    } else {
      setSelectedAgentId('');
    }
  };

  const handleAssignAgent = async () => {
    if (!selectedOrderForAssign) return;
    if (!selectedAgentId) {
      setAssignError('Please select a valid registered field agent from the dropdown.');
      return;
    }

    setAssignLoading(true);
    setAssignError(null);

    try {
      const res = await adminFetch(`/api/orders/${selectedOrderForAssign.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selectedAgentId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSelectedOrderForAssign(null);
        setSelectedAgentId('');
        loadOrdersAndAgents();
      } else {
        setAssignError(data.error?.message || data.message || 'Failed to assign agent to this order.');
      }
    } catch (e: any) {
      console.error(e);
      setAssignError('Network error while assigning agent.');
    } finally {
      setAssignLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
        <div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase">
            Operations Roster
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">Orders Management</h1>
          <p className="text-xs text-slate-500">Live operational pickups, scheduled dispatch slots, and active agent assignments</p>
        </div>

        <button
          onClick={loadOrdersAndAgents}
          disabled={loading}
          className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 flex items-center gap-1.5 self-start sm:self-auto disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* SEARCH AND FILTERS */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Search Order # / Customer / Phone / Area"
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-2.5 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={filterStatus}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="w-full sm:w-auto bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="ALL">All Order Statuses</option>
              <option value="BOOKING_RECEIVED">Booking Received</option>
              <option value="AGENT_BEING_ASSIGNED">Agent Being Assigned</option>
              <option value="AGENT_ASSIGNED">Agent Assigned</option>
              <option value="AGENT_ON_WAY">Agent On Way</option>
              <option value="AGENT_ARRIVED">Agent Arrived</option>
              <option value="WEIGHING">Weighing</option>
              <option value="PICKUP_COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
        </div>

        {/* ORDERS TABLE */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px]">
              <tr>
                <th className="p-3">Order Number</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Area & Address</th>
                <th className="p-3">Status</th>
                <th className="p-3">Assigned Agent</th>
                <th className="p-3">Est / Final Amount</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loading && orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center p-8 text-slate-400 font-semibold">
                    Loading orders database...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center p-8 text-slate-400 font-semibold">
                    No orders found matching search criteria.
                  </td>
                </tr>
              ) : (
                orders.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3 font-mono font-bold text-slate-900">{o.orderNumber}</td>
                    <td className="p-3">
                      <span className="font-bold text-slate-900 block">{o.customer?.user?.name || 'Customer'}</span>
                      <span className="text-[11px] text-slate-500">{o.customer?.user?.phone}</span>
                    </td>
                    <td className="p-3">
                      <span className="font-bold text-slate-800 block">{o.address?.area}</span>
                      <span className="text-[10px] text-slate-400 truncate block max-w-xs">{o.address?.street}</span>
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                          o.status === 'SETTLEMENT_COMPLETED' || o.status === 'PICKUP_COMPLETED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : o.status === 'CANCELLED'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {o.status ? o.status.replace(/_/g, ' ') : 'PENDING'}
                      </span>
                    </td>
                    <td className="p-3 font-bold text-slate-800">
                      {o.agent ? (
                        <span>
                          {o.agent.user?.name} <span className="text-slate-400 font-normal">({o.agent.vehicleNumber})</span>
                        </span>
                      ) : (
                        <span className="text-amber-600 font-semibold">Unassigned</span>
                      )}
                    </td>
                    <td className="p-3 font-bold text-slate-900">
                      ₹{o.finalAmount || o.estimatedTotal || 0}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/orders/${o.id}`}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-800 px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View
                        </Link>
                        <button
                          onClick={() => openAssignModal(o)}
                          className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          Assign
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION CONTROLS */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100 text-xs text-slate-500">
          <div>
            Showing page <span className="font-bold text-slate-800">{page}</span> of{' '}
            <span className="font-bold text-slate-800">{totalPages}</span> ({totalOrders} total orders)
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page <= 1 || loading}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Previous
            </button>
            <span className="px-2 font-bold text-slate-700">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= totalPages || loading}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ASSIGNMENT MODAL */}
      {selectedOrderForAssign && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Assign Agent to Order #{selectedOrderForAssign.orderNumber}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Area: {selectedOrderForAssign.address?.area || 'South Bengaluru'}
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedOrderForAssign(null);
                  setAssignError(null);
                }}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            {assignError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-700">
                {assignError}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">Select Field Agent:</label>
              {agentsLoading ? (
                <div className="p-3 bg-slate-50 rounded-xl text-xs font-medium text-slate-500">
                  Loading field agents...
                </div>
              ) : agentsError ? (
                <div className="p-3 bg-rose-50 rounded-xl text-xs font-semibold text-rose-600">
                  {agentsError}
                </div>
              ) : agents.length === 0 ? (
                <div className="p-3 bg-amber-50 rounded-xl text-xs font-semibold text-amber-800">
                  No active field agents registered.
                </div>
              ) : (
                <select
                  value={selectedAgentId}
                  onChange={(e) => setSelectedAgentId(e.target.value)}
                  disabled={assignLoading}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none disabled:opacity-50"
                >
                  {agents.map((ag: any) => (
                    <option key={ag.id} value={ag.id}>
                      {ag.status === 'AVAILABLE' ? '🟢' : '⚪'} {ag.name || ag.user?.name} ({ag.vehicleNumber || 'Vehicle'})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedOrderForAssign(null);
                  setAssignError(null);
                }}
                disabled={assignLoading}
                className="w-1/2 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAssignAgent}
                disabled={assignLoading || agents.length === 0 || !selectedAgentId}
                className="w-1/2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {assignLoading ? 'Assigning...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
