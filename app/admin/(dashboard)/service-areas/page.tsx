'use client';

import { useState, useEffect } from 'react';
import { MapPin, RefreshCw, AlertTriangle } from 'lucide-react';

export default function AdminServiceAreasPage() {
  const [areas, setAreas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingArea, setPendingArea] = useState<any | null>(null);
  const [updating, setUpdating] = useState(false);

  const loadAreas = () => {
    setLoading(true);
    fetch('/api/service-areas')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setAreas(data.data);
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadAreas();
  }, []);

  const handleOpenToggleModal = (area: any) => {
    const nextStatus = area.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    setPendingArea({
      id: area.id,
      name: area.name,
      currentStatus: area.status,
      nextStatus,
    });
  };

  const confirmToggleStatus = async () => {
    if (!pendingArea || updating) return;
    setUpdating(true);
    try {
      const res = await fetch('/api/service-areas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pendingArea.id, status: pendingArea.nextStatus }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAreas(areas.map((a) => (a.id === pendingArea.id ? { ...a, status: pendingArea.nextStatus } : a)));
        setPendingArea(null);
      } else {
        alert(data.message || 'Failed to update service area status.');
      }
    } catch (e: any) {
      alert(e.message || 'Error updating service area status.');
    } finally {
      setUpdating(false);
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

        <button
          onClick={loadAreas}
          className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 flex items-center gap-1.5 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
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
              onClick={() => handleOpenToggleModal(area)}
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

      {/* Confirmation Modal */}
      {pendingArea && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                  pendingArea.nextStatus === 'INACTIVE' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'
                }`}
              >
                {pendingArea.nextStatus === 'INACTIVE' ? (
                  <AlertTriangle className="w-5 h-5" />
                ) : (
                  <MapPin className="w-5 h-5" />
                )}
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  {pendingArea.nextStatus === 'INACTIVE' ? 'Deactivate Service Area?' : 'Activate Service Area?'}
                </h3>
                <p className="text-xs text-slate-500">{pendingArea.name}</p>
              </div>
            </div>

            <div
              className={`border rounded-2xl p-4 text-xs space-y-2 ${
                pendingArea.nextStatus === 'INACTIVE'
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-900'
              }`}
            >
              {pendingArea.nextStatus === 'INACTIVE' ? (
                <>
                  <p className="font-bold">Deactivating will temporarily disable new customer bookings in this zone.</p>
                  <ul className="list-disc list-inside space-y-1 text-[11px]">
                    <li>
                      Customers selecting pickup addresses in <strong>{pendingArea.name}</strong> will receive an out-of-service notification.
                    </li>
                    <li>
                      <strong>Existing & historical orders in this area are NOT affected or deleted.</strong>
                    </li>
                    <li>The service area record will NOT be deleted from the database.</li>
                  </ul>
                </>
              ) : (
                <>
                  <p className="font-bold">Activating will enable customer bookings in this zone immediately.</p>
                  <ul className="list-disc list-inside space-y-1 text-[11px]">
                    <li>
                      Customers can select addresses and request scrap pickup in <strong>{pendingArea.name}</strong>.
                    </li>
                  </ul>
                </>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                disabled={updating}
                onClick={() => setPendingArea(null)}
                className="w-1/2 bg-slate-100 text-slate-700 font-bold text-xs py-3 rounded-xl hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={updating}
                onClick={confirmToggleStatus}
                className={`w-1/2 font-bold text-xs py-3 rounded-xl shadow-md text-white flex items-center justify-center gap-2 ${
                  pendingArea.nextStatus === 'INACTIVE' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {updating ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Updating...
                  </>
                ) : pendingArea.nextStatus === 'INACTIVE' ? (
                  'Deactivate Area'
                ) : (
                  'Activate Area'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

