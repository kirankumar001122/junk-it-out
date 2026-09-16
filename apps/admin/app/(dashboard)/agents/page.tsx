'use client';

import { useState, useEffect } from 'react';
import { Users, Truck, Star, Phone, MapPin, RefreshCw, Plus, AlertCircle } from 'lucide-react';
import { adminFetch } from '@/lib/api';

export default function AdminAgentsPage() {
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add agent modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [vehicleType, setVehicleType] = useState('Three-Wheeler Auto Loading');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [serviceAreas, setServiceAreas] = useState('JP Nagar, Jayanagar, BTM Layout');

  const loadAgents = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch('/api/admin/agents');
      const data = await res.json();
      if (data.success) {
        setAgents(data.data || []);
      } else {
        setError(data.message || 'Failed to fetch field agents.');
      }
    } catch (e: any) {
      setError(e.message || 'Error connecting to backend API.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAgents();
  }, []);

  const toggleAgentStatus = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'OFFLINE' ? 'AVAILABLE' : 'OFFLINE';
    try {
      const res = await adminFetch('/api/admin/agents', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: nextStatus }),
      });
      const data = await res.json();
      if (data.success) {
        loadAgents();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) return;
    try {
      const res = await adminFetch('/api/admin/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, vehicleType, vehicleNumber, serviceAreas }),
      });
      const data = await res.json();
      if (data.success) {
        setShowAddModal(false);
        setName('');
        setPhone('');
        setVehicleNumber('');
        loadAgents();
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase">
            Fleet Operations
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">Field Agents Roster</h1>
          <p className="text-xs text-slate-500">Manage, register, and toggle availability of field drivers and agents.</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-md flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            REGISTER NEW AGENT
          </button>
          <button
            onClick={loadAgents}
            className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px]">
              <tr>
                <th className="p-3">Agent Name</th>
                <th className="p-3">Phone</th>
                <th className="p-3">Vehicle Details</th>
                <th className="p-3">Service Areas</th>
                <th className="p-3">Rating</th>
                <th className="p-3">Status</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center p-8 text-slate-400 font-semibold">
                    Loading agent roster...
                  </td>
                </tr>
              ) : agents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center p-8 text-slate-400 font-semibold">
                    No field agents registered yet.
                  </td>
                </tr>
              ) : (
                agents.map((ag) => (
                  <tr key={ag.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3 font-bold text-slate-900">{ag.name}</td>
                    <td className="p-3 font-mono text-slate-600">{ag.phone}</td>
                    <td className="p-3 text-slate-800">
                      <span className="font-bold">{ag.vehicleType}</span>
                      <span className="block text-[11px] text-slate-400">{ag.vehicleNumber}</span>
                    </td>
                    <td className="p-3 text-slate-600">{ag.serviceAreas || 'South Bengaluru'}</td>
                    <td className="p-3 font-bold text-amber-600">★ {ag.rating || '5.0'}</td>
                    <td className="p-3">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                          ag.status === 'AVAILABLE'
                            ? 'bg-emerald-100 text-emerald-800'
                            : ag.status === 'ASSIGNED' || ag.status === 'EN_ROUTE'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {ag.status}
                      </span>
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => toggleAgentStatus(ag.id, ag.status)}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-800 px-3 py-1.5 rounded-lg text-[11px] font-bold"
                      >
                        Toggle {ag.status === 'OFFLINE' ? 'Online' : 'Offline'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleAddAgent} className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-900">Register New Field Agent</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Ramesh Kumar"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Phone Number</label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91XXXXXXXXXX"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Vehicle Type</label>
                <input
                  type="text"
                  required
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Vehicle Registration Number</label>
                <input
                  type="text"
                  required
                  value={vehicleNumber}
                  onChange={(e) => setVehicleNumber(e.target.value)}
                  placeholder="KA-05-EX-1234"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-medium"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="w-1/2 bg-slate-100 text-slate-700 font-bold text-xs py-2.5 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="w-1/2 bg-emerald-600 text-white font-bold text-xs py-2.5 rounded-xl shadow-md"
              >
                Save Agent
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
