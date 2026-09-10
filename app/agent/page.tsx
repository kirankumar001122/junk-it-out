'use client';

import { useState, useEffect } from 'react';
import {
  Truck,
  MapPin,
  Phone,
  CheckCircle,
  Clock,
  Scale,
  Camera,
  Play,
  Navigation,
  RefreshCw,
  Power,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';

export default function AgentDashboardPage() {
  const [agent, setAgent] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [activeOrder, setActiveOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Weighing Modal State
  const [showWeighModal, setShowWeighModal] = useState(false);
  const [actualWeightsInput, setActualWeightsInput] = useState<{ categoryId: string; categoryName: string; actualWeight: number }[]>([]);
  const [scalePhotoUrl, setScalePhotoUrl] = useState('https://images.unsplash.com/photo-1589939705384-5185137a7f0f?q=80&w=600');
  const [weighNotes, setWeighNotes] = useState('');

  const fetchAgentData = async () => {
    try {
      setLoading(true);
      setAuthError(null);

      const profileRes = await fetch('/api/auth/me');
      const profileData = await profileRes.json();

      if (!profileData.success || !profileData.data?.user || profileData.data.user.role !== 'AGENT') {
        setAuthError('Agent authentication is required to view assigned pickups.');
        setAgent(null);
        setOrders([]);
        setActiveOrder(null);
        return;
      }

      const agentUser = profileData.data.user;
      const agentProfile = agentUser.agent || null;
      setAgent({
        ...agentProfile,
        name: agentUser.name,
        phone: agentUser.phone,
        email: agentUser.email,
      });
      setIsOnline((agentProfile?.status || 'AVAILABLE') !== 'OFFLINE');

      const res = await fetch('/api/orders');
      const data = await res.json();
      if (data.success) {
        const agentOrders = (data.data || []).filter((o: any) => o.agentId === agentProfile?.id);
        setOrders(agentOrders);

        const assigned = agentOrders.find(
          (o: any) => !['PICKUP_COMPLETED', 'SETTLEMENT_COMPLETED', 'CANCELLED'].includes(o.status)
        ) || null;

        setActiveOrder(assigned);
        if (assigned) {
          setActualWeightsInput(
            (assigned.items || []).map((i: any) => ({
              categoryId: i.categoryId,
              categoryName: i.category?.name || 'Waste item',
              actualWeight: Number(i.actualWeight ?? i.estimatedWeight ?? 0),
            }))
          );
        } else {
          setActualWeightsInput([]);
        }
      }
    } catch (e) {
      console.error(e);
      setAuthError('Network error while loading your pickup dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgentData();

    const locationInterval = setInterval(() => {
      if (activeOrder && isOnline && agent?.id) {
        const simulatedLat = (activeOrder.address?.lat || 12.9077) + (Math.random() - 0.5) * 0.005;
        const simulatedLng = (activeOrder.address?.lng || 77.5854) + (Math.random() - 0.5) * 0.005;

        fetch('/api/agent/location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: agent.id,
            orderId: activeOrder.id,
            lat: simulatedLat,
            lng: simulatedLng,
            speed: 22.4,
          }),
        }).catch(() => {});
      }
    }, 8000);

    return () => clearInterval(locationInterval);
  }, [activeOrder, isOnline, agent?.id]);

  const handleCallEndpoint = async (action: 'accept' | 'start' | 'arrive') => {
    if (!activeOrder) return;
    try {
      const res = await fetch(`/api/orders/${activeOrder.id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        fetchAgentData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSubmitWeighingAndComplete = async () => {
    if (!activeOrder) return;
    try {
      // 1. Submit Weighing Data
      const weighRes = await fetch(`/api/orders/${activeOrder.id}/weigh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actualWeights: actualWeightsInput,
          scalePhotoUrl,
          notes: weighNotes,
        }),
      });
      const weighData = await weighRes.json();
      if (!weighData.success) {
        alert(weighData.error?.message || 'Failed to record weighing.');
        return;
      }

      // 2. Submit Complete Order
      const completeRes = await fetch(`/api/orders/${activeOrder.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const completeData = await completeRes.json();
      if (completeData.success) {
        setShowWeighModal(false);
        fetchAgentData();
      } else {
        alert(completeData.error?.message || 'Failed to complete pickup.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <div className="max-w-md mx-auto p-6 text-center pt-20">
        <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-3" />
        <p className="text-sm font-semibold text-slate-600">Loading Agent Portal...</p>
      </div>
    );
  }

  const todayPickups = orders.length;
  const completedCount = orders.filter((o) => ['SETTLEMENT_COMPLETED', 'PICKUP_COMPLETED'].includes(o.status)).length;
  const pendingCount = todayPickups - completedCount;

  return (
    <div className="max-w-md mx-auto min-h-screen bg-slate-900 text-white pb-24">
      {authError && (
        <div className="p-4 text-xs text-amber-200 bg-amber-500/10 border-b border-amber-500/30">{authError}</div>
      )}

      {/* AGENT TOP APP BAR */}
      <div className="p-4 bg-slate-900 border-b border-slate-800 sticky top-0 z-30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500 text-slate-950 font-black flex items-center justify-center text-lg">
            {agent?.name ? agent.name.split(' ').map((part: string) => part[0]).slice(0,2).join('').toUpperCase() : 'AG'}
          </div>
          <div>
            <h2 className="font-extrabold text-sm text-white">{agent?.name || 'Agent'}</h2>
            <p className="text-[11px] text-slate-400 font-mono">{agent?.vehicleNumber || 'No vehicle assigned'}{agent?.vehicleType ? ` (${agent.vehicleType})` : ''}</p>
          </div>
        </div>

        <button
          onClick={() => setIsOnline(!isOnline)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-extrabold border transition-all ${
            isOnline
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
              : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
          }`}
        >
          <Power className="w-3.5 h-3.5" />
          {isOnline ? 'ONLINE' : 'OFFLINE'}
        </button>
      </div>

      {/* TODAY'S METRICS SUMMARY */}
      <div className="p-4 grid grid-cols-3 gap-2">
        <div className="bg-slate-800/80 p-3 rounded-2xl border border-slate-700/50 text-center">
          <span className="text-xl font-black text-white block">{todayPickups}</span>
          <span className="text-[10px] text-slate-400 uppercase font-semibold">Today Total</span>
        </div>
        <div className="bg-slate-800/80 p-3 rounded-2xl border border-slate-700/50 text-center">
          <span className="text-xl font-black text-amber-400 block">{pendingCount}</span>
          <span className="text-[10px] text-slate-400 uppercase font-semibold">Pending</span>
        </div>
        <div className="bg-slate-800/80 p-3 rounded-2xl border border-slate-700/50 text-center">
          <span className="text-xl font-black text-emerald-400 block">{completedCount}</span>
          <span className="text-[10px] text-slate-400 uppercase font-semibold">Completed</span>
        </div>
      </div>

      {/* ACTIVE ASSIGNED ORDER */}
      {activeOrder ? (
        <div className="px-4 space-y-4">
          <div className="bg-slate-800 rounded-3xl p-5 border border-slate-700 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <span className="text-xs font-extrabold bg-emerald-500 text-slate-950 px-2.5 py-0.5 rounded-full uppercase">
                Active Order
              </span>
              <span className="text-xs text-slate-300 font-mono">{activeOrder.orderNumber}</span>
            </div>

            {/* Customer Details & Contact */}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-extrabold text-base text-white">{activeOrder.address?.name}</h3>
                <p className="text-xs text-slate-300 font-mono mt-0.5">{activeOrder.customer?.user?.phone}</p>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  📍 {activeOrder.address?.houseNo}, {activeOrder.address?.street}, {activeOrder.address?.area}
                </p>
                {activeOrder.address?.pickupInstructions && (
                  <p className="text-[11px] text-amber-300 bg-amber-950/40 p-2 rounded-xl border border-amber-800/40 mt-2">
                    Note: "{activeOrder.address.pickupInstructions}"
                  </p>
                )}
              </div>

              <a
                href={`tel:${activeOrder.customer?.user?.phone}`}
                className="p-3 bg-emerald-600 text-white rounded-2xl shadow-lg shrink-0"
              >
                <Phone className="w-5 h-5" />
              </a>
            </div>

            {/* Waste Items Summary */}
            <div className="pt-2 border-t border-slate-700">
              <span className="text-[11px] font-bold text-slate-400 uppercase">Declared Waste:</span>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {activeOrder.items?.map((item: any) => (
                  <span key={item.id} className="text-xs font-semibold bg-slate-700 text-slate-200 px-2.5 py-1 rounded-lg">
                    {item.category?.name} ({item.estimatedWeight}kg)
                  </span>
                ))}
              </div>
            </div>

            {/* Navigation Button */}
            <a
              href={`https://maps.google.com/?q=${activeOrder.address?.lat},${activeOrder.address?.lng}`}
              target="_blank"
              rel="noreferrer"
              className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs py-3 rounded-2xl flex items-center justify-center gap-2 border border-slate-600"
            >
              <Navigation className="w-4 h-4 text-emerald-400" />
              OPEN GOOGLE MAPS NAVIGATION
            </a>
          </div>

          {/* SEQUENTIAL AGENT ACTION BUTTONS */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-400 uppercase px-1">Pickup Workflow Actions:</span>

            {activeOrder.status === 'AGENT_ASSIGNED' && (
              <button
                onClick={() => handleCallEndpoint('accept')}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm py-4 rounded-2xl shadow-lg flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-5 h-5" />
                ACCEPT PICKUP ASSIGNMENT
              </button>
            )}

            {activeOrder.status === 'AGENT_ACCEPTED' && (
              <button
                onClick={() => handleCallEndpoint('start')}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm py-4 rounded-2xl shadow-lg flex items-center justify-center gap-2"
              >
                <Play className="w-5 h-5" />
                START JOURNEY TO CUSTOMER
              </button>
            )}

            {activeOrder.status === 'AGENT_ON_WAY' && (
              <button
                onClick={() => handleCallEndpoint('arrive')}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black text-sm py-4 rounded-2xl shadow-lg flex items-center justify-center gap-2"
              >
                <MapPin className="w-5 h-5" />
                MARK ARRIVED AT DOORSTEP
              </button>
            )}

            {(activeOrder.status === 'AGENT_ARRIVED' || activeOrder.status === 'WEIGHING') && (
              <button
                onClick={() => {
                  setShowWeighModal(true);
                }}
                className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm py-4 rounded-2xl shadow-lg flex items-center justify-center gap-2"
              >
                <Scale className="w-5 h-5" />
                START WEIGHING & RECORD KG
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="p-8 text-center text-slate-400 space-y-3">
          <Truck className="w-12 h-12 text-slate-600 mx-auto" />
          <h3 className="font-bold text-white text-base">No Active Pickup Assigned</h3>
          <p className="text-xs text-slate-400">You are on duty in South Bengaluru. New orders will appear here automatically.</p>
        </div>
      )}

      {/* WEIGHING MODAL */}
      {showWeighModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                <Scale className="w-5 h-5 text-emerald-400" />
                Record Digital Scale Weights
              </h3>
              <button onClick={() => setShowWeighModal(false)} className="text-slate-400 text-xs font-bold">
                ✕ Close
              </button>
            </div>

            <div className="space-y-3">
              {actualWeightsInput.map((item, idx) => (
                <div key={item.categoryId} className="bg-slate-800 p-3 rounded-2xl border border-slate-700 flex items-center justify-between">
                  <span className="text-xs font-bold text-white">{item.categoryName}</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      value={item.actualWeight}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        const copy = [...actualWeightsInput];
                        copy[idx].actualWeight = val;
                        setActualWeightsInput(copy);
                      }}
                      className="w-20 bg-slate-900 border border-slate-600 rounded-xl p-2 text-sm font-bold text-emerald-400 text-right focus:outline-none focus:border-emerald-500"
                    />
                    <span className="text-xs text-slate-400 font-bold">kg</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Photo Scale Proof */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-400">Scale Photo Proof URL:</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={scalePhotoUrl}
                  onChange={(e) => setScalePhotoUrl(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-300"
                />
                <button
                  onClick={() =>
                    setScalePhotoUrl('https://images.unsplash.com/photo-1589939705384-5185137a7f0f?q=80&w=600')
                  }
                  className="bg-slate-800 border border-slate-700 text-emerald-400 p-2.5 rounded-xl shrink-0"
                >
                  <Camera className="w-4 h-4" />
                </button>
              </div>
            </div>

            <button
              onClick={handleSubmitWeighingAndComplete}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm py-4 rounded-2xl shadow-xl flex items-center justify-center gap-2"
            >
              <CheckCircle className="w-5 h-5" />
              CONFIRM WEIGHTS & COMPLETE PICKUP
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
