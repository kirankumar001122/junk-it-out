'use client';

import { useState, useEffect } from 'react';
import { MapPin, Plus, CheckCircle, XCircle } from 'lucide-react';
import { SOUTH_BENGALURU_ZONES } from '@/lib/geofence';

export default function AdminServiceAreasPage() {
  const [areas, setAreas] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/service-areas')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setAreas(data.data);
      })
      .catch(() => {});
  }, []);

  const toggleStatus = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      const res = await fetch('/api/service-areas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: nextStatus }),
      });
      const data = await res.json();
      if (data.success) {
        setAreas(areas.map((a) => (a.id === id ? { ...a, status: nextStatus } : a)));
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
        <div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase">
            Geofenced Boundaries
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">Service Area & Boundary Manager</h1>
          <p className="text-xs text-slate-500">Configure active South Bengaluru localities, SLAs, and base fees</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {areas.map((area) => (
          <div key={area.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  📍
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">{area.name}</h3>
                  <span className="text-[10px] text-slate-400 font-bold uppercase">South Bengaluru Zone</span>
                </div>
              </div>
              <span
                className={`text-[10px] font-extrabold px-3 py-1 rounded-full uppercase ${
                  area.status === 'ACTIVE'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-rose-100 text-rose-800'
                }`}
              >
                {area.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs text-slate-600 bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div>
                <span className="block font-semibold text-slate-400">Target ETA:</span>
                <span className="font-black text-slate-900 text-sm">{area.etaMinutes} Mins</span>
              </div>
              <div>
                <span className="block font-semibold text-slate-400">Base Charge:</span>
                <span className="font-black text-slate-900 text-sm">₹{area.basePickupCharge}</span>
              </div>
            </div>

            <button
              onClick={() => toggleStatus(area.id, area.status)}
              className={`w-full text-xs font-bold py-3 rounded-xl border transition-colors ${
                area.status === 'ACTIVE'
                  ? 'border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100'
                  : 'border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
              }`}
            >
              {area.status === 'ACTIVE' ? 'Disable Service Area' : 'Enable Service Area'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
