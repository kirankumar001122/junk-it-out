'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { MapPin, Clock, ArrowRight, ShieldCheck } from 'lucide-react';
import InteractiveMap from '@/components/InteractiveMap';
import { BENGALURU_ZONES } from '@/lib/geofence';

export default function PublicServiceAreasPage() {
  const [areas, setAreas] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/service-areas')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setAreas(data.data);
      });
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-8 min-h-[85vh]">
      <div className="text-center max-w-2xl mx-auto space-y-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-3 py-1 rounded-full uppercase tracking-wider">
          <ShieldCheck className="w-3.5 h-3.5" />
          Bengaluru City Coverage
        </span>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Service Areas & Zones</h1>
        <p className="text-xs sm:text-sm text-slate-600">
          We operate across approved Bengaluru service boundaries to deliver fast, reliable doorstep waste pickups.
        </p>
      </div>

      <InteractiveMap
        centerLat={12.9716}
        centerLng={77.5946}
        zoom={11}
        polygons={BENGALURU_ZONES.map((z) => ({ name: z.name, coordinates: z.boundaryPolygon }))}
        className="h-80 sm:h-96 w-full rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {areas.map((area) => (
          <div key={area.id} className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-sm space-y-1.5 hover:border-slate-300 transition-all">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
              <h3 className="font-bold text-slate-900 text-xs sm:text-sm">{area.name}</h3>
            </div>
            <p className="text-xs text-emerald-700 font-medium flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              Pickup ETA: {area.etaMinutes} mins
            </p>
            <p className="text-[11px] text-slate-500 font-normal">Base Doorstep Fee: ₹{area.basePickupCharge}</p>
          </div>
        ))}
      </div>

      <div className="text-center pt-2">
        <Link
          href="/book"
          className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-6 py-3 rounded-xl shadow-sm inline-flex items-center gap-2 transition-all active:scale-95"
        >
          <span>Book a Pickup at My Location</span>
          <ArrowRight className="w-4 h-4 text-emerald-400" />
        </Link>
      </div>
    </div>
  );
}
