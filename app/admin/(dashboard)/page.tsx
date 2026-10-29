'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Package,
  Map,
  Users,
  CreditCard,
  Clock,
  TrendingUp,
  Scale,
  ShieldCheck,
  AlertCircle,
  Plus,
  RefreshCw,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  FileBarChart,
  UserPlus,
} from 'lucide-react';
import InteractiveMap from '@/components/InteractiveMap';
import { SOUTH_BENGALURU_ZONES } from '@/lib/geofence';

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [showManualModal, setShowManualModal] = useState(false);
  const [selectedOrderForAssign, setSelectedOrderForAssign] = useState<any>(null);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  // In-flight concurrency and debouncing guards
  const assignInFlightRef = useRef(false);
  const manualInFlightRef = useRef(false);
  const isFetchingRef = useRef(false);
  const pendingRefreshRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Manual order state
  const [manualPhone, setManualPhone] = useState('+919888777666');
  const [manualName, setManualName] = useState('Ravi Shankar');
  const [manualArea, setManualArea] = useState('JP Nagar');
  const [manualHouse, setManualHouse] = useState('Plot 42, 10th Cross');
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  const loadAdminData = async (isBackground = false) => {
    if (isFetchingRef.current) {
      pendingRefreshRef.current = true;
      return;
    }
    isFetchingRef.current = true;

    try {
      if (!isBackground) {
        setAgentsLoading(true);
      }
      setAgentsError(null);

      const [statsRes, ordersRes, agentsRes] = await Promise.all([
        fetch('/api/admin/stats').then((r) => r.json()).catch(() => ({ success: false })),
        fetch('/api/orders?limit=100').then((r) => r.json()).catch(() => ({ success: false })),
        fetch('/api/admin/agents').then((r) => r.json()).catch(() => ({ success: false })),
      ]);

      if (statsRes.success) setStats(statsRes.data);
      if (ordersRes.success) setOrders(ordersRes.data || []);
      if (agentsRes.success) {
        setAgents(agentsRes.data || []);
      } else if (!isBackground) {
        setAgentsError(agentsRes.error?.message || agentsRes.message || 'Failed to load field agents.');
      }
    } catch (e: any) {
      console.error(e);
      if (!isBackground) {
        setAgentsError('Error loading operations data.');
      }
    } finally {
      setLoading(false);
      setAgentsLoading(false);
      isFetchingRef.current = false;

      if (pendingRefreshRef.current) {
        pendingRefreshRef.current = false;
        loadAdminData(true);
      }
    }
  };

  const triggerDebouncedRefresh = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      loadAdminData(true);
    }, 400);
  };

  useEffect(() => {
    loadAdminData(false);

    const eventSource = new EventSource('/api/realtime/stream');
    eventSource.addEventListener('ORDER_CREATED', triggerDebouncedRefresh);
    eventSource.addEventListener('ORDER_UPDATED', triggerDebouncedRefresh);
    eventSource.addEventListener('AGENT_LOCATION_UPDATED', triggerDebouncedRefresh);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      eventSource.close();
    };
  }, []);

  // Keyboard accessibility and body scroll lock for modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowManualModal(false);
        setSelectedOrderForAssign(null);
        setAssignError(null);
      }
    };
    if (showManualModal || selectedOrderForAssign) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [showManualModal, selectedOrderForAssign]);

  const sortedAgents = [...agents].sort((a, b) => {
    if (a.status === 'AVAILABLE' && b.status !== 'AVAILABLE') return -1;
    if (a.status !== 'AVAILABLE' && b.status === 'AVAILABLE') return 1;
    return a.name.localeCompare(b.name);
  });

  const openAssignModal = (order: any) => {
    setSelectedOrderForAssign(order);
    setAssignError(null);
    if (order.agentId && agents.some((a) => a.id === order.agentId)) {
      setSelectedAgentId(order.agentId);
    } else {
      const firstAvailable = agents.find((a) => a.status === 'AVAILABLE');
      setSelectedAgentId(firstAvailable ? firstAvailable.id : (agents[0]?.id || ''));
    }
  };

  const handleAssignAgent = async () => {
    if (assignInFlightRef.current || assignLoading) return;
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

    assignInFlightRef.current = true;
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
        await loadAdminData(true);
      } else {
        setAssignError(data.error?.message || data.message || 'Failed to assign agent to this order.');
      }
    } catch (e: any) {
      console.error(e);
      setAssignError('Network error while assigning agent.');
    } finally {
      assignInFlightRef.current = false;
      setAssignLoading(false);
    }
  };

  const handleCreateManualOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (manualInFlightRef.current || manualLoading) return;

    manualInFlightRef.current = true;
    setManualLoading(true);
    setManualError(null);

    try {
      const selectedZone = SOUTH_BENGALURU_ZONES.find((z) => z.name === manualArea) || SOUTH_BENGALURU_ZONES[0];
      const categoriesRes = await fetch('/api/waste-categories').then((r) => r.json()).catch(() => null);
      const activeCats = categoriesRes?.data || [];
      const firstCat = activeCats[0] || { id: 'default-cat', name: 'Plastic Waste', pricePerKg: 18, type: 'RECYCLABLE_BUY' };

      const payload = {
        name: manualName.trim(),
        phone: manualPhone.trim(),
        pickupType: 'ASAP',
        financialDirection: 'CUSTOMER_PAYS',
        items: [
          {
            categoryId: firstCat.id,
            categoryName: firstCat.name,
            type: firstCat.type,
            pricePerKg: firstCat.pricePerKg,
            estimatedWeight: 5.0,
          },
        ],
        address: {
          label: 'Home',
          houseNo: manualHouse.trim(),
          street: 'Main Road',
          area: selectedZone.name,
          city: 'Bengaluru',
          pincode: '560078',
          lat: selectedZone.centerLat,
          lng: selectedZone.centerLng,
        },
        notes: 'Manual order created by Operations Dispatcher',
      };

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setShowManualModal(false);
        await loadAdminData(true);
      } else {
        setManualError(data?.error?.message || data?.message || 'Failed to create manual order.');
      }
    } catch {
      setManualError('Network error while placing manual order.');
    } finally {
      manualInFlightRef.current = false;
      setManualLoading(false);
    }
  };

  const filteredOrders = orders.filter((o) => {
    const matchesStatus = filterStatus === 'ALL' || o.status === filterStatus;
    const matchesSearch =
      o.orderNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.customer?.user?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.address?.area?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* TOP HEADER BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
        <div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase">
            Control Center
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">
            Junk It Out Operations Dashboard
          </h1>
          <p className="text-xs text-slate-500">South Bengaluru Service Area Control & Live Monitoring</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setManualError(null);
              setShowManualModal(true);
            }}
            className="btn-glossy-primary rounded-full text-white font-extrabold text-xs px-5 py-3 shadow-md flex items-center gap-2"
          >
            <Plus className="w-4 h-4 shrink-0" />
            CREATE MANUAL ORDER
          </button>
          <a
            href="/api/admin/reports"
            className="btn-glossy-dark rounded-full text-white font-bold text-xs px-5 py-3 flex items-center gap-2 shadow-sm"
          >
            <FileBarChart className="w-4 h-4 text-emerald-400 shrink-0" />
            EXPORT CSV REPORT
          </a>
        </div>
      </div>

      {/* METRICS WIDGET CARDS & SLA MONITORING */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase">Today&apos;s Bookings</span>
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <span className="text-3xl font-black text-slate-900">{stats?.totalOrders ?? 0}</span>
          <div className="flex items-center gap-2 mt-2 text-xs">
            <span className="text-amber-600 font-bold">{stats?.activeOrders ?? 0} Active</span>
            <span className="text-slate-400">|</span>
            <span className="text-emerald-600 font-bold">{stats?.completedOrders ?? stats?.completedPickups ?? 0} Completed</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase">Total Waste Collected</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Scale className="w-4 h-4" />
            </div>
          </div>
          <span className="text-3xl font-black text-slate-900">
            {stats?.totalWeightKg ?? 0} <span className="text-lg text-slate-500">kg</span>
          </span>
          <p className="text-xs text-slate-500 mt-2">South Bengaluru Total Weight</p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase">Revenue & Payouts</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <span className="text-3xl font-black text-slate-900">₹{stats?.totalRevenue ?? 0}</span>
          <div className="flex items-center gap-2 mt-2 text-xs">
            <span className="text-emerald-600 font-bold">₹{stats?.totalCustomerPayouts ?? 0} Paid Out</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase">Active Fleet</span>
            <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <span className="text-3xl font-black text-slate-900">{stats?.activeAgents ?? 0}</span>
          <p className="text-xs text-slate-500 mt-2">
            {stats?.availableAgents ?? 0} Available for Dispatch
          </p>
        </div>
      </div>

      {/* REAL-TIME MAP SECTION */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">South Bengaluru Live GPS & Zones</h2>
            <p className="text-xs text-slate-500">Live coordinates of agents and scheduled pickup addresses</p>
          </div>
          <div className="flex items-center gap-4 text-xs font-bold text-slate-600">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Available</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Assigned</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> En Route</span>
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
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">All Pickup Orders</h2>
            <p className="text-xs text-slate-500">Filter, re-assign, update status, and manage pickups</p>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
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
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700"
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

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
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
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 space-y-2">
                    <Package className="w-8 h-8 mx-auto text-slate-300" />
                    <p className="font-bold text-slate-700 text-xs">No orders match filter criteria</p>
                    <p className="text-[11px] text-slate-400">Try adjusting your search term or status filter</p>
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
                      {o.agent ? `${o.agent.user.name} (${o.agent.vehicleNumber})` : <span className="text-amber-600 font-extrabold">Unassigned</span>}
                    </td>
                    <td className="p-3 font-bold text-slate-900">
                      ₹{o.finalAmount || o.estimatedTotal}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/admin/orders/${o.id}`}
                          className="btn-glossy-secondary rounded-full text-slate-800 px-3.5 py-1.5 text-[11px] font-bold shadow-2xs border border-slate-200"
                        >
                          View
                        </Link>
                        <button
                          onClick={() => openAssignModal(o)}
                          className="btn-glossy-primary rounded-full text-white px-3.5 py-1.5 text-[11px] font-bold shadow-2xs flex items-center gap-1"
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

      {/* CREATE MANUAL ORDER MODAL */}
      {showManualModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Create Manual Pickup Order"
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 overflow-y-auto"
        >
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm cursor-pointer"
            onClick={() => setShowManualModal(false)}
            aria-hidden="true"
          />
          <form onSubmit={handleCreateManualOrder} className="relative bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl z-10 my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Create Manual Pickup Order</h3>
                <p className="text-xs text-slate-500">Dispatch waste collection for phone/offline requests</p>
              </div>
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            {manualError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{manualError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">Customer Full Name</label>
              <input
                type="text"
                required
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-900"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">Customer Phone Number</label>
              <input
                type="text"
                required
                value={manualPhone}
                onChange={(e) => setManualPhone(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-900"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">South Bengaluru Service Area</label>
              <select
                value={manualArea}
                onChange={(e) => setManualArea(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-900"
              >
                {SOUTH_BENGALURU_ZONES.map((zone) => (
                  <option key={zone.id} value={zone.name}>
                    {zone.name} (ETA: {zone.etaMinutes} mins)
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">Door / House & Street Address</label>
              <input
                type="text"
                required
                value={manualHouse}
                onChange={(e) => setManualHouse(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-900"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                disabled={manualLoading}
                className="w-1/2 btn-glossy-secondary rounded-full text-slate-700 font-bold text-xs py-3 shadow-2xs disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={manualLoading}
                className="w-1/2 btn-glossy-primary rounded-full text-white font-bold text-xs py-3 shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {manualLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Booking...</span>
                  </>
                ) : (
                  <span>Place Order</span>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* AGENT ASSIGNMENT MODAL */}
      {selectedOrderForAssign && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Assign Agent to Order"
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 overflow-y-auto"
        >
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm cursor-pointer"
            onClick={() => {
              setSelectedOrderForAssign(null);
              setAssignError(null);
            }}
            aria-hidden="true"
          />
          <div className="relative bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl z-10 my-auto">
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
                  {sortedAgents.map((ag) => (
                    <option key={ag.id} value={ag.id}>
                      {ag.status === 'AVAILABLE' ? '🟢 [AVAILABLE]' : `⚪ [${ag.status}]`} {ag.name} ({ag.vehicleType} • {ag.vehicleNumber}) [★{ag.rating} | {ag.phone}]
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
                className="w-1/2 btn-glossy-secondary rounded-full text-slate-700 font-bold text-xs py-3 shadow-2xs disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAssignAgent}
                disabled={assignLoading || agents.length === 0 || !selectedAgentId}
                className="w-1/2 btn-glossy-primary rounded-full text-white font-bold text-xs py-3 shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {assignLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Assigning...</span>
                  </>
                ) : (
                  <span>Confirm Assignment</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
