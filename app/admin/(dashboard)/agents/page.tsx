'use client';

import { useState, useEffect } from 'react';
import { Users, Truck, Star, Phone, MapPin, RefreshCw, Plus, AlertCircle } from 'lucide-react';

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
  const [serviceAreas, setServiceAreas] = useState('JP Nagar, Jayanagar, Koramangala');

  const loadAgents = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/agents');
      const data = await res.json();
      if (data.success) {
        setAgents(data.data);
      } else {
        setError(data.message || 'Failed to fetch field agents.');
      }
    } catch (e: any) {
      setError(e.message || 'Error connecting to database.');
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
      const res = await fetch('/api/admin/agents', {
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
      const res = await fetch('/api/admin/agents', {
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
        <div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase">
            Field Operations
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">Field Agents Roster</h1>
          <p className="text-xs text-slate-500">Manage real agent fleet, vehicle assignments, availability, & ratings from DB</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadAgents}
            className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-md flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            ADD FIELD AGENT
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 h-48 shimmer-box" />
          <div className="bg-white p-6 rounded-3xl border border-slate-200 h-48 shimmer-box" />
        </div>
      ) : error ? (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-6 rounded-3xl text-center space-y-3">
          <AlertCircle className="w-8 h-8 mx-auto text-rose-600" />
          <p className="text-sm font-bold">{error}</p>
          <button onClick={loadAgents} className="bg-rose-600 text-white text-xs font-bold px-4 py-2 rounded-xl">
            Retry Connection
          </button>
        </div>
      ) : agents.length === 0 ? (
        <div className="bg-white p-12 rounded-3xl border border-slate-200 text-center space-y-3">
          <Truck className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-base font-bold text-slate-800">No Active Agents Found</h3>
          <p className="text-xs text-slate-500">There are currently no field agents registered in the database.</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-emerald-600 text-white text-xs font-bold px-4 py-2 rounded-xl"
          >
            Add First Field Agent
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {agents.map((agent) => (
            <div key={agent.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-extrabold text-base">
                    <Truck className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-base">{agent.name}</h3>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Phone className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{agent.phone}</span>
                    </div>
                  </div>
                </div>

                <span
                  className={`text-[10px] font-extrabold px-3 py-1 rounded-full uppercase ${
                    agent.status === 'AVAILABLE'
                      ? 'bg-emerald-100 text-emerald-800'
                      : agent.status === 'ASSIGNED' || agent.status === 'EN_ROUTE'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {agent.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-100 font-semibold">
                <div>
                  <span className="block text-slate-400 font-medium">Vehicle Type & No</span>
                  <span className="font-bold text-slate-900">{agent.vehicleType}</span>
                  <span className="block font-mono text-emerald-700 font-bold">{agent.vehicleNumber}</span>
                </div>
                <div>
                  <span className="block text-slate-400 font-medium">Performance Rating</span>
                  <div className="flex items-center gap-1 font-bold text-slate-900">
                    <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                    <span>{agent.rating} / 5.0</span>
                  </div>
                  <span className="text-[11px] text-slate-500">{agent.activeOrdersCount || 0} Active Order(s)</span>
                </div>
              </div>

              <div className="text-xs text-slate-600 space-y-1">
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="font-bold text-slate-800">Service Hubs:</span>
                  <span className="truncate">{agent.serviceAreas}</span>
                </div>
              </div>

              <button
                onClick={() => toggleAgentStatus(agent.id, agent.status)}
                className={`w-full text-xs font-bold py-3 rounded-xl border transition-colors ${
                  agent.status === 'OFFLINE'
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200'
                }`}
              >
                {agent.status === 'OFFLINE' ? 'Set Agent Online' : 'Set Agent Offline'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add Agent Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleAddAgent} className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-base font-extrabold text-slate-900">Add New Field Agent</h3>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Agent Full Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ramesh Kumar"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Phone Number</label>
              <input
                type="text"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98887 77666"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Vehicle Type</label>
              <select
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold"
              >
                <option value="Three-Wheeler Auto Loading">Three-Wheeler Auto Loading</option>
                <option value="Tata Ace Mini Van">Tata Ace Mini Van</option>
                <option value="Mahindra Bolero Pickup">Mahindra Bolero Pickup</option>
                <option value="Electric Cargo E-Rickshaw">Electric Cargo E-Rickshaw</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Vehicle Registration Number</label>
              <input
                type="text"
                required
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value)}
                placeholder="KA-05-JK-1024"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold font-mono"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="w-1/2 bg-slate-100 text-slate-700 font-bold text-xs py-3 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="w-1/2 bg-emerald-600 text-white font-bold text-xs py-3 rounded-xl shadow-md"
              >
                Create Field Agent
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
