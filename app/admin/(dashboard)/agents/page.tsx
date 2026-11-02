'use client';

import { useState, useEffect, useRef } from 'react';
import { Users, Truck, Star, Phone, MapPin, RefreshCw, Plus, AlertCircle, LogOut } from 'lucide-react';

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
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // In-flight concurrency guards
  const addInFlightRef = useRef(false);
  const isTogglingRef = useRef<string | null>(null);
  const forceExitInFlightRef = useRef(false);
  const [togglingAgentId, setTogglingAgentId] = useState<string | null>(null);

  // Force Exit modal state
  const [exitModalAgent, setExitModalAgent] = useState<any | null>(null);
  const [exiting, setExiting] = useState(false);

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

  // Keyboard accessibility and body scroll lock for modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowAddModal(false);
        setExitModalAgent(null);
      }
    };
    if (showAddModal || exitModalAgent) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [showAddModal, exitModalAgent]);

  const toggleAgentStatus = async (id: string, currentStatus: string) => {
    if (isTogglingRef.current) return;
    isTogglingRef.current = id;
    setTogglingAgentId(id);

    const nextStatus = currentStatus === 'OFFLINE' ? 'AVAILABLE' : 'OFFLINE';
    try {
      const res = await fetch('/api/admin/agents', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: nextStatus }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        await loadAgents();
      } else {
        alert(data?.message || 'Failed to update agent status.');
      }
    } catch (e) {
      console.error(e);
      alert('Network error while toggling agent status.');
    } finally {
      isTogglingRef.current = null;
      setTogglingAgentId(null);
    }
  };

  const handleForceExitAgent = async () => {
    if (!exitModalAgent || forceExitInFlightRef.current || exiting) return;
    forceExitInFlightRef.current = true;
    setExiting(true);
    try {
      const res = await fetch('/api/admin/agents/force-exit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: exitModalAgent.id }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setExitModalAgent(null);
        await loadAgents();
      } else {
        alert(data?.message || 'Failed to force exit agent.');
      }
    } catch (e: any) {
      alert(e.message || 'Error executing force exit.');
    } finally {
      forceExitInFlightRef.current = false;
      setExiting(false);
    }
  };

  const handleAddAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (addInFlightRef.current || addLoading || !name.trim() || !phone.trim()) return;

    addInFlightRef.current = true;
    setAddLoading(true);
    setAddError(null);

    try {
      const res = await fetch('/api/admin/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          vehicleType,
          vehicleNumber: vehicleNumber.trim(),
          serviceAreas,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setShowAddModal(false);
        setName('');
        setPhone('');
        setVehicleNumber('');
        await loadAgents();
      } else {
        setAddError(data?.error?.message || data?.message || 'Failed to create field agent.');
      }
    } catch (e: any) {
      console.error(e);
      setAddError('Network error while creating field agent.');
    } finally {
      addInFlightRef.current = false;
      setAddLoading(false);
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
            disabled={loading}
            className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 flex items-center gap-1.5 disabled:opacity-50"
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

              <div className="flex gap-2">
                <button
                  onClick={() => toggleAgentStatus(agent.id, agent.status)}
                  disabled={togglingAgentId === agent.id}
                  className={`flex-1 text-xs font-bold py-3 rounded-xl border transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 ${
                    agent.status === 'OFFLINE'
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200'
                  }`}
                >
                  {togglingAgentId === agent.id && <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />}
                  <span>{agent.status === 'OFFLINE' ? 'Set Agent Online' : 'Set Agent Offline'}</span>
                </button>
                <button
                  onClick={() => setExitModalAgent(agent)}
                  className="px-4 text-xs font-bold py-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 flex items-center gap-1.5 transition-colors"
                  title="Force exit agent portal session"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Force Exit
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Agent Modal */}
      {showAddModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add New Field Agent"
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 overflow-y-auto"
        >
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm cursor-pointer"
            onClick={() => setShowAddModal(false)}
            aria-hidden="true"
          />
          <form onSubmit={handleAddAgent} className="relative bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl z-10 my-auto">
            <h3 className="text-base font-extrabold text-slate-900">Add New Field Agent</h3>

            {addError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{addError}</span>
              </div>
            )}

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
                disabled={addLoading}
                className="w-1/2 bg-slate-100 text-slate-700 font-bold text-xs py-3 rounded-xl disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addLoading}
                className="w-1/2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-3 rounded-xl shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {addLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Creating...</span>
                  </>
                ) : (
                  <span>Create Field Agent</span>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Force Exit Confirmation Modal */}
      {exitModalAgent && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Force Exit Agent Portal"
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 overflow-y-auto"
        >
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm cursor-pointer"
            onClick={() => setExitModalAgent(null)}
            aria-hidden="true"
          />
          <div className="relative bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl z-10 my-auto">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 flex items-center justify-center">
                <LogOut className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Force Exit Agent Portal?</h3>
                <p className="text-xs text-slate-500">Immediate session invalidation</p>
              </div>
            </div>

            <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 text-xs text-rose-900 space-y-2">
              <p className="font-bold">
                Are you sure you want to force exit <span className="underline">{exitModalAgent.name}</span> ({exitModalAgent.phone})?
              </p>
              <ul className="list-disc list-inside text-rose-800 space-y-1 text-[11px]">
                <li>Agent&apos;s active portal sessions will be <strong>revoked immediately</strong> globally.</li>
                <li>Agent status will be changed to <strong>OFFLINE</strong>.</li>
                <li>Agent will be required to re-authenticate with mobile OTP.</li>
                <li><strong>Active orders and pickup history will NOT be lost or cleared.</strong></li>
              </ul>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                disabled={exiting}
                onClick={() => setExitModalAgent(null)}
                className="w-1/2 bg-slate-100 text-slate-700 font-bold text-xs py-3 rounded-xl hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={exiting}
                onClick={handleForceExitAgent}
                className="w-1/2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-3 rounded-xl shadow-md flex items-center justify-center gap-2"
              >
                {exiting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Exiting...
                  </>
                ) : (
                  'Confirm Force Exit'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
