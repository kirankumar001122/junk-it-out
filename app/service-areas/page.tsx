'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { MapPin, Clock, ArrowRight } from 'lucide-react';
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
    <div className="max-w-6xl mx-auto px-4 py-12 space-y-10">
      <div className="text-center max-w-2xl mx-auto space-y-3">
        <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full uppercase">
          Bengaluru City Coverage
        </span>
        <h1 className="text-3xl font-black text-slate-900">Junk It Out Service Areas</h1>
        <p className="text-sm text-slate-600">
          We operate across approved Bengaluru service boundaries to deliver our 20–30 minute pickup commitment.
        </p>
      </div>

      <InteractiveMap
        centerLat={12.9716}
        centerLng={77.5946}
        zoom={11}
        polygons={BENGALURU_ZONES.map((z) => ({ name: z.name, coordinates: z.boundaryPolygon }))}
        className="h-96 w-full rounded-3xl border border-slate-200 shadow-lg overflow-hidden"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {areas.map((area) => (
          <div key={area.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-emerald-600" />
              <h3 className="font-extrabold text-slate-900 text-sm">{area.name}</h3>
            </div>
            <p className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              Pickup ETA: {area.etaMinutes} mins
            </p>
            <p className="text-xs text-slate-500">Base Doorstep Fee: ₹{area.basePickupCharge}</p>
          </div>
        ))}
      </div>

      <div className="text-center pt-4">
        <Link
          href="/book"
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-base px-8 py-4 rounded-2xl shadow-xl inline-flex items-center gap-2"
        >
          BOOK A PICKUP AT MY LOCATION
          <ArrowRight className="w-5 h-5" />
        </Link>
      </div>
    </div>
  );
}
