'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { MapPin, Clock, ArrowRight, ShieldCheck } from 'lucide-react';
import InteractiveMap from '@/components/InteractiveMap';
import { BENGALURU_ZONES } from '@/lib/geofence';
import ScrollReveal from '@/components/ScrollReveal';

export default function PublicServiceAreasPage() {
  const [areas, setAreas] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/service-areas')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data)) {
          setAreas(data.data.filter((a: any) => a.status === 'ACTIVE'));
        }
      });
  }, []);

  const activeZones = BENGALURU_ZONES.filter((z) => z.status === 'ACTIVE');

  return (
    <div className="customer-page-cream min-h-[85vh]">
      <div className="customer-page max-w-6xl space-y-8">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-3 py-1 rounded-full uppercase tracking-wider">
            <ShieldCheck className="w-3.5 h-3.5" />
            Active Service Coverage
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Service Areas & Zones</h1>
          <p className="text-xs sm:text-sm text-slate-600">
            Our doorstep pickup service is currently available in <strong>BTM Layout</strong> and <strong>JP Nagar</strong>, Bengaluru.
          </p>
        </div>

        <ScrollReveal>
          <InteractiveMap
            centerLat={12.9122}
            centerLng={77.5977}
            zoom={13}
            polygons={activeZones.map((z) => ({ name: z.name, coordinates: z.boundaryPolygon }))}
            className="h-80 sm:h-96 w-full rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
          />
        </ScrollReveal>

        <ScrollReveal className="grid grid-cols-1 gap-4 sm:grid-cols-2 max-w-2xl mx-auto">
          {areas.map((area) => (
            <div key={area.id} className="customer-feature-card space-y-1.5 bg-white p-4">
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
        </ScrollReveal>

        <div className="pt-2 text-center">
          <Link
            href="/book"
            className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-6 py-3 rounded-xl shadow-sm inline-flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
          >
            <span>Book a Pickup in BTM Layout or JP Nagar</span>
            <ArrowRight className="w-4 h-4 text-emerald-400" />
          </Link>
        </div>
      </div>
    </div>
  );
}
