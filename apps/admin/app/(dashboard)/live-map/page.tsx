'use client';

import { useState, useEffect } from 'react';
import InteractiveMap from '@/components/InteractiveMap';
import { SOUTH_BENGALURU_ZONES } from '@/lib/geofence';
import { RefreshCw, MapPin } from 'lucide-react';
import { adminFetch } from '@/lib/api';

export default function AdminLiveMapPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMapData = async () => {
    setLoading(true);
    try {
      const [ordersRes, agentsRes] = await Promise.all([
        adminFetch('/api/orders').then((r) => r.json()).catch(() => ({ success: false })),
        adminFetch('/api/admin/agents').then((r) => r.json()).catch(() => ({ success: false })),
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

  const agentMarkers = agents.map((a) => ({
    id: `agent-${a.id}`,
    lat: a.currentLat || 12.9077,
    lng: a.currentLng || 77.5854,
    title: `${a.name} (${a.vehicleNumber})`,
    subtitle: `Status: ${a.status} | Vehicle: ${a.vehicleType}`,
    type: 'AGENT' as const,
    status: a.status,
  }));

  const orderMarkers = orders.map((o) => ({
    id: `order-${o.id}`,
    lat: o.address?.lat || 12.9077,
    lng: o.address?.lng || 77.5854,
    title: `Order ${o.orderNumber}`,
    subtitle: `Status: ${o.status} | Customer: ${o.customer?.user?.name || 'Customer'}`,
    type: 'PICKUP' as const,
  }));

  const allMarkers = [...agentMarkers, ...orderMarkers];
  const activeAgentsCount = agents.filter((a) => a.status === 'AVAILABLE' || a.status === 'ASSIGNED' || a.status === 'EN_ROUTE').length;

  return (
    <div className="space-y-4">
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase">
            Real-Time GPS Operations
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">Live Agent & Pickup Map</h1>
          <p className="text-xs text-slate-500">Real-time GPS tracking across South Bengaluru service zones</p>
        </div>

        <button
          onClick={loadMapData}
          className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-4 py-2.5 rounded-xl border border-slate-200 flex items-center gap-2 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Map
        </button>
      </div>

      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm h-[calc(100vh-220px)] relative overflow-hidden">
        {activeAgentsCount === 0 && (
          <div className="absolute top-8 left-1/2 -translate-x-1/2 z-20 bg-slate-900/90 text-white px-5 py-2.5 rounded-full backdrop-blur-md shadow-lg border border-slate-700 text-xs font-bold flex items-center gap-2">
            <MapPin className="w-4 h-4 text-emerald-400" />
            <span>No active agents currently sharing location.</span>
          </div>
        )}

        <InteractiveMap
          centerLat={12.9077}
          centerLng={77.5854}
          zoom={13}
          polygons={SOUTH_BENGALURU_ZONES.map((z) => ({ name: z.name, coordinates: z.boundaryPolygon }))}
          markers={allMarkers}
          className="h-full w-full rounded-2xl border border-slate-200 overflow-hidden"
        />
      </div>
    </div>
  );
}
