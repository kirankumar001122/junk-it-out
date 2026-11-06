'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { SOUTH_BENGALURU_ZONES } from '@/lib/geofence';
import {
  RefreshCw,
  MapPin,
  Search,
  Filter,
  Users,
  Package,
  Layers,
  ChevronRight,
  X,
  Phone,
  Truck,
  Info,
} from 'lucide-react';
import { adminFetch } from '@/lib/api';
import { cachedAdminFetch } from '@/lib/clientCache';

const InteractiveMap = dynamic(() => import('@/components/InteractiveMap'), {
  ssr: false,
  loading: () => (
    <div className="h-[520px] w-full rounded-2xl border border-slate-200 bg-slate-100 flex items-center justify-center text-xs text-slate-400 font-bold">
      Loading operations map...
    </div>
  ),
});

export default function AdminLiveMapPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [selectedEntity, setSelectedEntity] = useState<any | null>(null);
  const [showLegend, setShowLegend] = useState(true);

  const loadMapData = async (forceRefresh = false) => {
    setLoading(true);
    try {
      const [ordersRes, agentsRes] = await Promise.all([
        adminFetch('/api/orders').then((r) => r.json()).catch(() => ({ success: false })),
        cachedAdminFetch('/api/admin/agents', { forceRefresh }).catch(() => ({ success: false })),
      ]);

      if (ordersRes.success) setOrders(ordersRes.data || []);
      if (agentsRes.success) setAgents(agentsRes.data || []);
    } catch (e) {
      console.error('Failed to load map data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMapData();
  }, []);

  const agentMarkers = useMemo(() => {
    return agents.map((a) => {
      const isMissingCoords = !a.currentLat || !a.currentLng;
      return {
        id: `agent-${a.id}`,
        rawId: a.id,
        lat: a.currentLat || 12.9077,
        lng: a.currentLng || 77.5854,
        title: `${a.name} (${a.vehicleNumber || 'No vehicle'})`,
        subtitle: `Status: ${a.status} | Vehicle: ${a.vehicleType || 'Standard'}`,
        type: 'AGENT' as const,
        status: a.status,
        name: a.name,
        phone: a.phone,
        vehicleNumber: a.vehicleNumber,
        vehicleType: a.vehicleType,
        serviceAreas: a.serviceAreas,
        isMissingCoords,
      };
    });
  }, [agents]);

  const orderMarkers = useMemo(() => {
    return orders.map((o) => {
      const isMissingCoords = !o.address?.lat || !o.address?.lng;
      return {
        id: `order-${o.id}`,
        rawId: o.id,
        lat: o.address?.lat || 12.9077,
        lng: o.address?.lng || 77.5854,
        title: `Order ${o.orderNumber}`,
        subtitle: `Status: ${o.status} | Customer: ${o.customer?.user?.name || 'Customer'}`,
        type: 'PICKUP' as const,
        status: o.status,
        orderNumber: o.orderNumber,
        customerName: o.customer?.user?.name || 'Customer',
        customerPhone: o.customer?.user?.phone || '—',
        area: o.address?.area || 'South Bengaluru',
        addressText: `${o.address?.houseNo || ''} ${o.address?.street || ''}`.trim(),
        finalAmount: o.finalAmount || o.estimatedTotal,
        isMissingCoords,
      };
    });
  }, [orders]);

  // Filtered markers based on search and status
  const filteredMarkers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    const filteredAgents = agentMarkers.filter((a) => {
      if (filterType === 'ORDERS_ALL' || filterType === 'ORDERS_PENDING') return false;
      if (filterType === 'AGENTS_AVAILABLE' && a.status !== 'AVAILABLE') return false;
      if (filterType === 'AGENTS_BUSY' && a.status !== 'ASSIGNED' && a.status !== 'EN_ROUTE') return false;
      if (!q) return true;
      return (
        a.name?.toLowerCase().includes(q) ||
        a.vehicleNumber?.toLowerCase().includes(q) ||
        a.phone?.includes(q)
      );
    });

    const filteredOrders = orderMarkers.filter((o) => {
      if (filterType.startsWith('AGENTS_')) return false;
      if (filterType === 'ORDERS_PENDING' && o.status === 'PICKUP_COMPLETED') return false;
      if (filterType === 'ORDERS_COMPLETED' && o.status !== 'PICKUP_COMPLETED') return false;
      if (!q) return true;
      return (
        o.orderNumber?.toLowerCase().includes(q) ||
        o.customerName?.toLowerCase().includes(q) ||
        o.customerPhone?.includes(q) ||
        o.area?.toLowerCase().includes(q)
      );
    });

    return [...filteredAgents, ...filteredOrders];
  }, [agentMarkers, orderMarkers, searchQuery, filterType]);

  const activeAgentsCount = agents.filter(
    (a) => a.status === 'AVAILABLE' || a.status === 'ASSIGNED' || a.status === 'EN_ROUTE'
  ).length;

  const pendingOrdersCount = orders.filter((o) => o.status !== 'PICKUP_COMPLETED' && o.status !== 'CANCELLED').length;

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase">
            Real-Time GPS Operations
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">Live Agent & Pickup Map</h1>
          <p className="text-xs text-slate-500">Real-time GPS tracking across South Bengaluru service zones</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowLegend(!showLegend)}
            className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 flex items-center gap-1.5 cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5" />
            {showLegend ? 'Hide Legend' : 'Show Legend'}
          </button>
          <button
            onClick={() => loadMapData(true)}
            className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-4 py-2.5 rounded-xl border border-slate-200 flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Map
          </button>
        </div>
      </div>

      {/* METRIC PILLS & SEARCH / FILTERS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase text-slate-400">Total Tracked</p>
            <p className="text-xl font-black text-slate-900">{agents.length + orders.length}</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold">
            <Layers className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase text-slate-400">Active Field Agents</p>
            <p className="text-xl font-black text-emerald-700">{activeAgentsCount}</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
            <Users className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase text-slate-400">Active Pickups</p>
            <p className="text-xl font-black text-amber-700">{pendingOrdersCount}</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
            <Package className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase text-slate-400">Service Geofences</p>
            <p className="text-xl font-black text-blue-700">{SOUTH_BENGALURU_ZONES.length} Zones</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
            <MapPin className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search live map by Agent name, Vehicle, Order #, Customer or Area..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="w-full sm:w-56 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
          >
            <option value="ALL">Show All Markers</option>
            <option value="AGENTS_ALL">All Field Agents</option>
            <option value="AGENTS_AVAILABLE">Available Agents Only</option>
            <option value="AGENTS_BUSY">Agents In Transit / Busy</option>
            <option value="ORDERS_ALL">All Pickup Orders</option>
            <option value="ORDERS_PENDING">Pending Pickups Only</option>
            <option value="ORDERS_COMPLETED">Completed Pickups</option>
          </select>
        </div>
      </div>

      {/* MAP CANVAS & OVERLAYS */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm h-[calc(100vh-320px)] min-h-[500px] relative overflow-hidden">
        {/* Floating No Active Agents Alert */}
        {activeAgentsCount === 0 && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 bg-slate-900/90 text-white px-5 py-2.5 rounded-full backdrop-blur-md shadow-lg border border-slate-700 text-xs font-bold flex items-center gap-2">
            <MapPin className="w-4 h-4 text-emerald-400" />
            <span>No active agents currently sharing location.</span>
          </div>
        )}

        {/* MAP STATUS LEGEND OVERLAY */}
        {showLegend && (
          <div className="absolute top-6 right-6 z-20 bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl p-3.5 shadow-xl text-xs space-y-2 max-w-xs">
            <div className="flex items-center justify-between pb-1 border-b border-slate-100">
              <span className="font-extrabold text-[11px] uppercase tracking-wider text-slate-700">Map Legend</span>
              <button
                onClick={() => setShowLegend(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>
            <div className="space-y-1.5 text-[11px] font-semibold text-slate-600">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block shadow-sm"></span>
                <span>Available Agent (🟢)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-blue-500 inline-block shadow-sm"></span>
                <span>En Route / Assigned Agent (🔵)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-amber-500 inline-block shadow-sm"></span>
                <span>Pending Pickup (🟡)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-slate-400 inline-block shadow-sm"></span>
                <span>Completed Pickup (⚪)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm border-2 border-emerald-600 inline-block"></span>
                <span>South Bengaluru Geofence</span>
              </div>
            </div>
          </div>
        )}

        {/* INTERACTIVE MAP COMPONENT */}
        <InteractiveMap
          centerLat={12.9077}
          centerLng={77.5854}
          zoom={13}
          polygons={SOUTH_BENGALURU_ZONES.map((z) => ({ name: z.name, coordinates: z.boundaryPolygon }))}
          markers={filteredMarkers}
          className="h-full w-full rounded-2xl border border-slate-200 overflow-hidden"
        />

        {/* BOTTOM ACTIVE ROSTER DRAWER */}
        <div className="absolute bottom-6 left-6 right-6 z-20 bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl p-3 shadow-xl flex items-center justify-between overflow-x-auto gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">Visible Markers:</span>
            <span className="bg-slate-900 text-white font-extrabold text-[11px] px-2.5 py-0.5 rounded-full">
              {filteredMarkers.length}
            </span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto">
            {filteredMarkers.slice(0, 5).map((m: any) => (
              <button
                key={m.id}
                onClick={() => setSelectedEntity(m)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer border ${
                  m.type === 'AGENT'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                    : 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
                }`}
              >
                <span>{m.type === 'AGENT' ? '🚗' : '📦'}</span>
                <span>{m.title}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* SELECTED ENTITY DETAIL MODAL */}
      {selectedEntity && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">{selectedEntity.type === 'AGENT' ? '🚗' : '📦'}</span>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    {selectedEntity.type === 'AGENT' ? 'Field Agent Details' : 'Pickup Order Details'}
                  </h3>
                  <p className="text-[11px] text-slate-400 font-semibold">{selectedEntity.title}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEntity(null)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold">Status</span>
                  <span className="font-extrabold text-slate-900 uppercase">{selectedEntity.status}</span>
                </div>
                {selectedEntity.type === 'AGENT' ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-bold">Vehicle</span>
                      <span className="font-extrabold text-slate-900">{selectedEntity.vehicleNumber || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-bold">Type</span>
                      <span className="font-semibold text-slate-700">{selectedEntity.vehicleType || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-bold">Service Area</span>
                      <span className="font-semibold text-slate-700">{selectedEntity.serviceAreas || 'South Bengaluru'}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-bold">Customer</span>
                      <span className="font-extrabold text-slate-900">{selectedEntity.customerName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-bold">Area</span>
                      <span className="font-semibold text-slate-700">{selectedEntity.area}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-bold">Amount</span>
                      <span className="font-extrabold text-slate-900">₹{selectedEntity.finalAmount || 0}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between border-t border-slate-200/60 pt-2 text-[11px]">
                  <span className="text-slate-400 font-bold">GPS Coordinates</span>
                  <span className="font-mono text-slate-600">
                    {selectedEntity.lat.toFixed(4)}, {selectedEntity.lng.toFixed(4)}
                  </span>
                </div>
                {selectedEntity.isMissingCoords && (
                  <div className="flex items-center gap-1.5 text-amber-700 text-[11px] font-bold bg-amber-50 p-2 rounded-xl border border-amber-200">
                    <Info className="w-3.5 h-3.5 shrink-0" />
                    <span>Using South Bengaluru Central Hub coordinates (GPS not broadcasted).</span>
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSelectedEntity(null)}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-2.5 rounded-xl cursor-pointer"
            >
              Close Details
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
