'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Package,
  Search,
  Filter,
  Plus,
  Clock,
  User,
  MapPin,
  Scale,
  CheckCircle,
  XCircle,
  RefreshCw,
  Eye,
  UserPlus,
} from 'lucide-react';

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [selectedOrderForAssign, setSelectedOrderForAssign] = useState<any>(null);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const loadOrdersAndAgents = async () => {
    try {
      setAgentsLoading(true);
      setAgentsError(null);
      const [ordersRes, agentsRes] = await Promise.all([
        fetch('/api/orders').then((r) => r.json()).catch(() => ({ success: false })),
        fetch('/api/admin/agents').then((r) => r.json()).catch(() => ({ success: false })),
      ]);

      if (ordersRes.success) setOrders(ordersRes.data || []);
      if (agentsRes.success) {
        const fetchedAgents = agentsRes.data || [];
        setAgents(fetchedAgents);
      } else {
        setAgentsError(agentsRes.error?.message || agentsRes.message || 'Failed to load field agents.');
      }
    } catch (e: any) {
      console.error(e);
      setAgentsError('Error loading orders and agents.');
    } finally {
      setLoading(false);
      setAgentsLoading(false);
    }
  };

  useEffect(() => {
    loadOrdersAndAgents();
  }, []);

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
    const targetAgent = agents.find((a) => a.id === selectedAgentId);
    if (!targetAgent) {
      setAssignError('Selected agent is invalid or no longer registered.');
      return;
    }

    setAssignLoading(true);
    setAssignError(null);

    try {
      const res = await fetch(`/api/orders/${selectedOrderForAssign.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selectedAgentId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSelectedOrderForAssign(null);
        setSelectedAgentId('');
        await loadOrdersAndAgents();
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

  const filteredOrders = orders.filter((o) => {
    const matchesStatus = filterStatus === 'ALL' || o.status === filterStatus;
    const matchesSearch =
      o.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.customer?.user?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.customer?.user?.phone?.includes(searchTerm) ||
      o.address?.area?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
        <div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase">
            Orders Roster
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">Orders Management</h1>
          <p className="text-xs text-slate-500">Monitor doorstep pickups, re-assign agents, track status & payouts</p>
        </div>

        <button
          onClick={loadOrdersAndAgents}
          className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-4 py-2.5 rounded-xl border border-slate-200 flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4 text-slate-600" />
          Refresh List
        </button>
      </div>

      {/* Filter Bar & Search */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Search Order # / Customer / Phone / Area"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-2.5 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full sm:w-48 bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2.5 text-xs font-bold text-slate-900"
            >
              <option value="ALL">All Statuses</option>
              <option value="BOOKING_RECEIVED">Booking Received</option>
              <option value="AGENT_ASSIGNED">Agent Assigned</option>
              <option value="AGENT_ON_WAY">Agent On Way</option>
              <option value="WEIGHING">Weighing</option>
              <option value="PICKUP_COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
        </div>

        {/* Orders Table */}
        <div className="overflow-x-auto pt-2">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px]">
              <tr>
                <th className="p-3">Order Number</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Pickup Area</th>
                <th className="p-3">Status</th>
                <th className="p-3">Assigned Agent</th>
                <th className="p-3">Estimated / Final</th>
                <th className="p-3">Date</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-slate-400 font-medium">
                    No orders match your filter criteria.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3 font-mono font-bold text-slate-900">{o.orderNumber}</td>
                    <td className="p-3">
                      <span className="font-bold text-slate-900 block">{o.customer?.user?.name || 'Customer'}</span>
                      <span className="text-[11px] text-slate-500">{o.customer?.user?.phone}</span>
                    </td>
                    <td className="p-3 font-bold text-slate-700">{o.address?.area || 'South Bengaluru'}</td>
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
                        {o.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="p-3 font-bold text-slate-800">
                      {o.agent ? (
                        <div>
                          <span className="block">{o.agent.user?.name}</span>
                          <span className="text-[10px] text-emerald-700 font-mono">{o.agent.vehicleNumber}</span>
                        </div>
                      ) : (
                        <span className="text-amber-600 font-extrabold">Unassigned</span>
                      )}
                    </td>
                    <td className="p-3 font-black text-slate-900 text-sm">
                      ₹{o.finalAmount || o.estimatedTotal}
                    </td>
                    <td className="p-3 text-slate-500 font-mono text-[11px]">
                      {new Date(o.createdAt).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/admin/orders/${o.id}`}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-800 px-3 py-1.5 rounded-xl text-[11px] font-bold inline-flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View
                        </Link>
                        <button
                          onClick={() => openAssignModal(o)}
                          className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-xl text-[11px] font-bold inline-flex items-center gap-1"
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
      </div>

      {/* Agent Assign Modal */}
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
                  Loading registered field agents...
                </div>
              ) : agentsError ? (
                <div className="p-3 bg-rose-50 rounded-xl text-xs font-semibold text-rose-600">
                  {agentsError}
                </div>
              ) : agents.length === 0 ? (
                <div className="p-3 bg-amber-50 rounded-xl text-xs font-semibold text-amber-800">
                  No active field agents registered in system.{' '}
                  <Link href="/admin/agents" className="underline font-bold text-amber-900">
                    Add Field Agent
                  </Link>
                </div>
              ) : (
                <select
                  value={selectedAgentId}
                  onChange={(e) => setSelectedAgentId(e.target.value)}
                  disabled={assignLoading}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none disabled:opacity-50"
                >
                  {agents.map((ag) => (
                    <option key={ag.id} value={ag.id}>
                      {ag.name} ({ag.vehicleType} • {ag.vehicleNumber}) - {ag.status} [★{ag.rating} | {ag.phone}]
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
                className="w-1/2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-3 rounded-xl disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAssignAgent}
                disabled={assignLoading || agents.length === 0 || !selectedAgentId}
                className="w-1/2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-3 rounded-xl shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {assignLoading ? 'Assigning...' : 'Confirm Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
