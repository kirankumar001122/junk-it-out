'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Package,
  Map,
  Users,
  CreditCard,
  Clock,
  Scale,
  ShieldCheck,
  Plus,
  Search,
  FileBarChart,
} from 'lucide-react';
import InteractiveMap from '@/components/InteractiveMap';
import { SOUTH_BENGALURU_ZONES } from '@/lib/geofence';
import { adminFetch, getApiUrl } from '@/lib/api';

type AdminDataResult = { status: number | null; body: any };

async function fetchAdminData(path: string): Promise<AdminDataResult> {
  try {
    const response = await adminFetch(path);
    let body: any = null;
    try {
      body = await response.json();
    } catch {
      // Keep the HTTP status so the dashboard can show a useful API diagnostic.
    }
    return { status: response.status, body };
  } catch {
    return { status: null, body: null };
  }
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [requestErrors, setRequestErrors] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [showManualModal, setShowManualModal] = useState(false);
  const [selectedOrderForAssign, setSelectedOrderForAssign] = useState<any>(null);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const loadAdminData = async () => {
    try {
      setAgentsLoading(true);
      setAgentsError(null);

      const [statsResult, ordersResult, agentsResult] = await Promise.all([
        fetchAdminData('/api/admin/stats'),
        fetchAdminData('/api/orders'),
        fetchAdminData('/api/admin/agents'),
      ]);

      const results = [
        { path: '/api/admin/stats', ...statsResult },
        { path: '/api/orders', ...ordersResult },
        { path: '/api/admin/agents', ...agentsResult },
      ];
      const errors = results
        .filter(({ status, body }) => status === null || status < 200 || status >= 300 || body === null)
        .map(({ path, status }) => `${path}: ${status === null ? 'request failed' : `HTTP ${status}`}`);

      const statsRes = statsResult.body;
      const ordersRes = ordersResult.body;
      const agentsRes = agentsResult.body;
      const fetchedStats = statsRes?.data || (statsRes?.success ? statsRes.data : (statsRes?.todaysBookings !== undefined || statsRes?.totalBookings !== undefined ? statsRes : null));
      if (fetchedStats) {
        setStats(fetchedStats);
      } else {
        setStats(null);
        if (statsResult.status !== null && statsResult.status >= 200 && statsResult.status < 300) {
          errors.push('/api/admin/stats: unexpected response structure');
        }
      }
      const fetchedOrders = Array.isArray(ordersRes?.data)
        ? ordersRes.data
        : Array.isArray(ordersRes)
          ? ordersRes
          : null;
      if (fetchedOrders) {
        setOrders(fetchedOrders);
      } else {
        setOrders([]);
        if (ordersResult.status !== null && ordersResult.status >= 200 && ordersResult.status < 300) {
          errors.push('/api/orders: unexpected response structure');
        }
      }
      const fetchedAgents = Array.isArray(agentsRes?.data)
        ? agentsRes.data
        : Array.isArray(agentsRes)
          ? agentsRes
          : null;
      if (fetchedAgents) {
        setAgents(fetchedAgents);
      } else {
        setAgents([]);
        setAgentsError(agentsRes?.error?.message || agentsRes?.message || 'Failed to load field agents.');
        if (agentsResult.status !== null && agentsResult.status >= 200 && agentsResult.status < 300) {
          errors.push('/api/admin/agents: unexpected response structure');
        }
      }
      setRequestErrors(errors);
    } catch (e: any) {
      console.error(e);
      setAgentsError('Error loading operations data.');
    } finally {
      setLoading(false);
      setAgentsLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();

    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource(getApiUrl('/api/realtime/stream'), { withCredentials: true });
      eventSource.addEventListener('ORDER_CREATED', () => loadAdminData());
      eventSource.addEventListener('ORDER_UPDATED', () => loadAdminData());
      eventSource.addEventListener('AGENT_LOCATION_UPDATED', () => loadAdminData());
    } catch (e) {
      console.error('SSE connection failed.');
    }

    return () => {
      if (eventSource) eventSource.close();
    };
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
      const res = await adminFetch(`/api/orders/${selectedOrderForAssign.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selectedAgentId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSelectedOrderForAssign(null);
        setSelectedAgentId('');
        await loadAdminData();
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
      (o.orderNumber && o.orderNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (o.customer?.user?.name && o.customer.user.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (o.address?.area && o.address.area.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="min-w-0 space-y-4 sm:space-y-6">
      {requestErrors.length > 0 && (
        <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-900">
          <p>Some dashboard data could not be loaded:</p>
          <ul className="mt-1 list-inside list-disc">
            {requestErrors.map((error) => <li key={error}>{error}</li>)}
          </ul>
        </div>
      )}
      {/* TOP HEADER BAR */}
      <div className="flex min-w-0 flex-col justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:p-6">
        <div className="min-w-0">
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase">
            Control Center
          </span>
          <h1 className="mt-1 break-words text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
            Junk It Out Operations Dashboard
          </h1>
          <p className="text-xs text-slate-500">South Bengaluru Service Area Control & Live Monitoring</p>
        </div>

        <div className="flex w-full items-center gap-3 sm:w-auto">
          <a
            href={getApiUrl('/api/admin/reports')}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 px-4 py-3 text-center text-xs font-bold text-white hover:bg-slate-700 sm:w-auto sm:py-2.5"
          >
            <FileBarChart className="w-4 h-4 text-emerald-400" />
            EXPORT CSV REPORT
          </a>
        </div>
      </div>

      {/* METRICS WIDGET CARDS & SLA MONITORING */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase">Today's Bookings</span>
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <span className="text-3xl font-black text-slate-900">{stats?.todaysBookings ?? stats?.totalBookings ?? '—'}</span>
          <div className="flex items-center gap-2 mt-2 text-xs">
            <span className="text-amber-600 font-bold">{stats?.activePickups ?? stats?.pendingBookings ?? '—'} Active</span>
            <span className="text-slate-400">|</span>
            <span className="text-emerald-600 font-bold">{stats?.completedPickups ?? '—'} Completed</span>
          </div>
        </div>

        <div className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase">Total Waste Collected</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Scale className="w-4 h-4" />
            </div>
          </div>
          <span className="text-3xl font-black text-slate-900">
            {stats?.totalWeightKg ?? '—'} <span className="text-lg text-slate-500">kg</span>
          </span>
          <p className="text-xs text-slate-500 mt-2">South Bengaluru Total Weight</p>
        </div>

        <div className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase">Revenue & Payouts</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <span className="text-3xl font-black text-slate-900">₹{stats?.totalRevenue || 0}</span>
          <div className="flex items-center gap-2 mt-2 text-xs">
            <span className="text-emerald-700 font-bold">₹{stats?.paidCustomerPayouts ?? stats?.totalCustomerPayouts ?? 0} Paid</span>
            <span className="text-slate-300">|</span>
            <span className="text-amber-700 font-bold">₹{stats?.approvedCustomerPayouts || 0} Approved</span>
          </div>
        </div>

        <div className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase">20-30 Min SLA Meter</span>
            <div className="w-8 h-8 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <span className="text-3xl font-black text-emerald-600">
            {stats?.slaOnTimeRate ?? '—'}{stats?.slaOnTimeRate == null ? '' : '%'}
          </span>
          <div className="flex items-center gap-1 mt-2 text-xs font-bold text-emerald-700">
            <ShieldCheck className="w-4 h-4" />
            <span>Target 30 Mins Compliant</span>
          </div>
        </div>
      </div>

      {/* LIVE AGENTS OPERATIONS MAP */}
      <div className="min-w-0 space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Live Agent Operations Map</h2>
            <p className="text-xs text-slate-500">Real-time status of all active field agents in South Bengaluru</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold sm:gap-3 sm:text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Available
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Assigned
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> En Route
            </span>
          </div>
        </div>

        <InteractiveMap
          centerLat={12.9077}
          centerLng={77.5854}
          zoom={12}
          polygons={SOUTH_BENGALURU_ZONES.map((z) => ({ name: z.name, coordinates: z.boundaryPolygon }))}
          markers={orders
            .filter((o) => o.agent)
            .map((o) => ({
              id: o.id,
              lat: o.agent.currentLat || 12.9077,
              lng: o.agent.currentLng || 77.5854,
              title: `${o.agent.user.name} (${o.agent.vehicleNumber})`,
              subtitle: `Order: ${o.orderNumber} - ${o.status}`,
              type: 'AGENT' as const,
              status: o.agent.status,
            }))}
          className="h-80 w-full rounded-2xl border border-slate-200 overflow-hidden shadow-inner"
        />
      </div>

      {/* ORDERS MANAGEMENT TABLE */}
      <div className="min-w-0 space-y-4 overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">All Pickup Orders</h2>
            <p className="text-xs text-slate-500">Filter, re-assign, update status, and manage pickups</p>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
            <div className="relative w-full sm:w-64 sm:flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search Order ID / Customer / Area"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs font-medium focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 sm:w-auto"
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

        <div className="w-full max-w-full overflow-x-auto overscroll-x-contain">
          <table className="min-w-[880px] text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px]">
              <tr>
                <th className="p-3">Order ID</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Area</th>
                <th className="p-3">Status</th>
                <th className="p-3">Assigned Agent</th>
                <th className="p-3">Estimate / Final</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredOrders.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-3 font-mono font-bold text-slate-900">{o.orderNumber}</td>
                  <td className="p-3">
                    <span className="font-bold text-slate-900 block">{o.customer?.user?.name}</span>
                    <span className="text-[11px] text-slate-500">{o.customer?.user?.phone}</span>
                  </td>
                  <td className="p-3 font-bold text-slate-700">{o.address?.area}</td>
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
                    {o.agent ? `${o.agent.user.name} (${o.agent.vehicleNumber})` : 'Unassigned'}
                  </td>
                  <td className="p-3 font-bold text-slate-900">
                    ₹{o.finalAmount || o.estimatedTotal}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/orders/${o.id}`}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-800 px-3 py-1.5 rounded-lg text-[11px] font-bold"
                      >
                        View
                      </Link>
                      <button
                        onClick={() => openAssignModal(o)}
                        className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-lg text-[11px] font-bold"
                      >
                        Assign
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* AGENT ASSIGNMENT MODAL */}
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
                  <Link href="/agents" className="underline font-bold text-amber-900">
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
