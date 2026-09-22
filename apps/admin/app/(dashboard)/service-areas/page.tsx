'use client';

import { useState, useEffect } from 'react';
import { SOUTH_BENGALURU_ZONES, ServiceZone } from '@/lib/geofence';
import InteractiveMap from '@/components/InteractiveMap';
import { adminFetch } from '@/lib/api';
import { RefreshCw, Power } from 'lucide-react';

export default function AdminServiceAreasPage() {
  const [zones, setZones] = useState<ServiceZone[]>(SOUTH_BENGALURU_ZONES);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchServiceAreas = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await adminFetch('/api/service-areas');
      if (res.ok) {
        const json = await res.json();
        const data = json.data || json;
        if (Array.isArray(data) && data.length > 0) {
          const parsed = data.map((z: any) => ({
            ...z,
            boundaryPolygon: typeof z.boundaryPolygon === 'string' ? JSON.parse(z.boundaryPolygon) : z.boundaryPolygon || [],
          }));
          setZones(parsed);
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch service areas:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServiceAreas();
  }, []);

  const handleToggleStatus = async (zone: ServiceZone) => {
    const nextStatus = zone.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    setUpdatingId(zone.id);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await adminFetch('/api/service-areas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: zone.id, status: nextStatus }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message || `Failed to update status (${res.status})`);
      }

      setSuccessMsg(`Zone "${zone.name}" updated to ${nextStatus}.`);
      await fetchServiceAreas();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update zone status.');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase">
            Geofence Zones
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">Service Areas & Geofence Boundaries</h1>
          <p className="text-xs text-slate-500">Configured South Bengaluru service zone polygons and ETA targets.</p>
        </div>
        <button
          onClick={fetchServiceAreas}
          disabled={loading}
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-4 py-2.5 rounded-xl transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh List
        </button>
      </div>

      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 font-semibold">
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-700 font-semibold">
          {successMsg}
        </div>
      )}

      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm overflow-hidden h-96">
        <InteractiveMap
          centerLat={12.9077}
          centerLng={77.5854}
          zoom={12}
          polygons={zones.map((z) => ({ name: z.name, coordinates: z.boundaryPolygon }))}
          className="h-full w-full rounded-2xl border border-slate-200"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {zones.map((z) => {
          const isActive = z.status === 'ACTIVE';
          const isUpdating = updatingId === z.id;
          return (
            <div key={z.id} className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-3 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-extrabold text-slate-900 text-sm truncate">{z.name}</span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase shrink-0 ${
                      isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {z.status}
                  </span>
                </div>
                <div className="text-xs text-slate-500 space-y-1">
                  <p>Target ETA: <span className="font-bold text-slate-800">{z.etaMinutes} mins</span></p>
                  <p>Base Service Fee: <span className="font-bold text-slate-800">₹{z.basePickupCharge}</span></p>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <button
                  onClick={() => handleToggleStatus(z)}
                  disabled={isUpdating}
                  className={`w-full text-xs font-bold px-3 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 ${
                    isActive
                      ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                      : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  {isUpdating ? 'Updating...' : isActive ? 'Deactivate Zone' : 'Activate Zone'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
