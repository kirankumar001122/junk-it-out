'use client';

import { SOUTH_BENGALURU_ZONES } from '@/lib/geofence';
import InteractiveMap from '@/components/InteractiveMap';
import { Globe, MapPin } from 'lucide-react';

export default function AdminServiceAreasPage() {
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
      </div>

      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm overflow-hidden h-96">
        <InteractiveMap
          centerLat={12.9077}
          centerLng={77.5854}
          zoom={12}
          polygons={SOUTH_BENGALURU_ZONES.map((z) => ({ name: z.name, coordinates: z.boundaryPolygon }))}
          className="h-full w-full rounded-2xl border border-slate-200"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {SOUTH_BENGALURU_ZONES.map((z) => (
          <div key={z.id} className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-slate-900 text-sm">{z.name}</span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800">
                {z.status}
              </span>
            </div>
            <div className="text-xs text-slate-500 space-y-1">
              <p>Target ETA: <span className="font-bold text-slate-800">{z.etaMinutes} mins</span></p>
              <p>Base Service Fee: <span className="font-bold text-slate-800">₹{z.basePickupCharge}</span></p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
