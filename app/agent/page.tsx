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
  Smartphone,
  Lock,
  ArrowRight,
  LogOut,
  Bell,
  Eye,
  X,
} from 'lucide-react';

export default function AgentDashboardPage() {
  const [agent, setAgent] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [activeOrder, setActiveOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Realtime Pickup Notification & Read-Only View Modal State
  const [newPickupNotice, setNewPickupNotice] = useState<any | null>(null);
  const [viewPickupModal, setViewPickupModal] = useState<any | null>(null);
  const [loadingPickupDetails, setLoadingPickupDetails] = useState(false);
  const [acceptingPickup, setAcceptingPickup] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Agent OTP Login State
  const [loginPhone, setLoginPhone] = useState('');
  const [loginOtp, setLoginOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

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
      const profileData = await profileRes.json().catch(() => ({ success: false }));

      if (!profileData.success || !profileData.data?.user || profileData.data.user.role !== 'AGENT') {
        setAgent(null);
        setOrders([]);
        setActiveOrder(null);
        setLoading(false);
        return;
      }

      const agentUser = profileData.data.user;
      const agentProfile = agentUser.agent || null;

      if (!agentProfile || !agentProfile.id) {
        setAgent(null);
        setOrders([]);
        setActiveOrder(null);
        setLoading(false);
        return;
      }

      setAgent({
        ...agentProfile,
        name: agentUser.name,
        phone: agentUser.phone,
        email: agentUser.email,
      });
      setIsOnline((agentProfile?.status || 'AVAILABLE') !== 'OFFLINE');

      const res = await fetch('/api/orders');
      const data = await res.json().catch(() => ({ success: false }));
      if (data.success) {
        const agentOrders = (data.data || []).filter((o: any) => o.agentId === agentProfile.id);
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
  }, []);

  useEffect(() => {
    if (!activeOrder?.id || !isOnline || !agent?.id) return;

    const locationInterval = setInterval(() => {
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
    }, 8000);

    return () => clearInterval(locationInterval);
  }, [activeOrder?.id, isOnline, agent?.id]);

  // Authenticated Agent SSE Stream Connection for NEW_PICKUP_AVAILABLE Notifications
  useEffect(() => {
    if (!agent?.id || !isOnline) return;

    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/agent/stream');

      eventSource.addEventListener('NEW_PICKUP_AVAILABLE', (e: MessageEvent) => {
        try {
          const payload = JSON.parse(e.data);
          console.log('[AGENT SSE] NEW_PICKUP_AVAILABLE notification received:', payload);
          setNewPickupNotice(payload);
        } catch (err) {
          console.error('[AGENT SSE] Error parsing notification payload:', err);
        }
      });

      eventSource.onerror = () => {
        // EventSource will automatically handle reconnection safely
      };
    } catch (err) {
      console.error('[AGENT SSE] EventSource initialization notice:', err);
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [agent?.id, isOnline]);

  const handleViewPickupDetails = async (orderId: string) => {
    setLoadingPickupDetails(true);
    try {
      const res = await fetch(`/api/orders/${orderId}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setViewPickupModal(data.data);
      } else {
        alert(data.error?.message || data.message || 'Unable to view pickup details.');
      }
    } catch (err) {
      alert('Network error fetching pickup details.');
    } finally {
      setLoadingPickupDetails(false);
    }
  };

  const handleAcceptPickup = async (orderId: string) => {
    setAcceptingPickup(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();

      if (res.status === 409) {
        setStatusNotice('This pickup has already been accepted by another agent.');
        setTimeout(() => setStatusNotice(null), 5000);
        setViewPickupModal(null);
        setNewPickupNotice(null);
        fetchAgentData();
        return;
      }

      if (res.ok && data.success) {
        setStatusNotice(`Pickup Accepted! Order #${data.data?.orderNumber || ''} assigned to you.`);
        setTimeout(() => setStatusNotice(null), 5000);
        setViewPickupModal(null);
        setNewPickupNotice(null);
        fetchAgentData();
      } else {
        alert(data.error?.message || data.message || 'Failed to accept pickup.');
      }
    } catch (err) {
      alert('Network error while accepting pickup.');
    } finally {
      setAcceptingPickup(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginPhone || loginPhone.trim().length < 10) {
      setLoginError('Please enter a valid 10-digit agent mobile number.');
      return;
    }
    setLoginLoading(true);
    setLoginError(null);
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: loginPhone }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setOtpSent(true);
      } else {
        setLoginError(data.message || 'Failed to send OTP to agent phone.');
      }
    } catch {
      setLoginError('Network error sending OTP.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginOtp || loginOtp.trim().length < 4) {
      setLoginError('Please enter the OTP code received.');
      return;
    }
    setLoginLoading(true);
    setLoginError(null);
    try {
      const res = await fetch('/api/auth/agent-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: loginPhone, code: loginOtp }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        fetchAgentData();
      } else {
        setLoginError(data.error?.message || data.message || 'Agent authentication failed.');
      }
    } catch {
      setLoginError('Network error verifying agent OTP.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setAgent(null);
      setOrders([]);
      setActiveOrder(null);
      setOtpSent(false);
      setLoginOtp('');
    } catch (e) {
      console.error('Agent logout error:', e);
    }
  };

  const toggleAgentStatus = async () => {
    const targetStatus = isOnline ? 'OFFLINE' : 'AVAILABLE';
    setStatusUpdating(true);
    setStatusNotice(null);
    try {
      const res = await fetch('/api/agent/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: targetStatus }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const newStatus = data.data.status;
        setIsOnline(newStatus === 'AVAILABLE');
        setAgent((prev: any) => (prev ? { ...prev, status: newStatus } : prev));
        setStatusNotice(`Status updated to ${newStatus}`);
        setTimeout(() => setStatusNotice(null), 3000);
      } else {
        setStatusNotice(data.error?.message || data.message || 'Failed to update status.');
      }
    } catch {
      setStatusNotice('Network error updating status.');
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleCallEndpoint = async (action: 'accept' | 'start' | 'arrive') => {
    if (!activeOrder) return;

    if (!isOnline && action === 'accept') {
      setStatusNotice('You are currently OFFLINE. Please switch status to ONLINE to accept pickups.');
      setTimeout(() => setStatusNotice(null), 5000);
      return;
    }

    setActionLoading(true);
    setStatusNotice(null);
    try {
      const res = await fetch(`/api/orders/${activeOrder.id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatusNotice(
          action === 'accept'
            ? 'Pickup assignment accepted!'
            : action === 'start'
            ? 'Journey started!'
            : 'Arrived at customer doorstep!'
        );
        setTimeout(() => setStatusNotice(null), 4000);
        await fetchAgentData();
      } else {
        const errorText = data.error?.message || data.message || `Failed to perform ${action} action.`;
        setStatusNotice(errorText);
        setTimeout(() => setStatusNotice(null), 5000);
      }
    } catch (e) {
      console.error(e);
      setStatusNotice('Network error while processing action. Please try again.');
      setTimeout(() => setStatusNotice(null), 4000);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitWeighingAndComplete = async () => {
    if (!activeOrder) return;
    try {
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
      if (!weighRes.ok || !weighData.success) {
        alert(weighData.error?.message || weighData.message || 'Failed to record weighing.');
        return;
      }

      const completeRes = await fetch(`/api/orders/${activeOrder.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const completeData = await completeRes.json();
      if (completeRes.ok || completeData.success) {
        setShowWeighModal(false);
        fetchAgentData();
      } else {
        alert(completeData.error?.message || completeData.message || 'Failed to complete pickup.');
      }
    } catch (e) {
      console.error(e);
      alert('Network error while completing pickup.');
    }
  };

  if (loading) {
    return (
      <div className="max-w-md mx-auto p-6 text-center pt-24 space-y-3">
        <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin mx-auto" />
        <p className="text-sm font-semibold text-slate-400">Loading Agent Portal...</p>
      </div>
    );
  }

  // AGENT LOGIN FLOW (If unauthenticated or not an AGENT)
  if (!agent) {
    return (
      <div className="max-w-md mx-auto min-h-screen bg-slate-950 text-white p-4 flex flex-col justify-center">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl animate-scale-in">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-2xl grid place-items-center mx-auto">
              <Truck className="w-7 h-7" />
            </div>
            <h1 className="text-xl font-black text-white">Agent Partner Portal</h1>
            <p className="text-xs text-slate-400">
              Sign in with your registered agent mobile number to manage doorstep pickup dispatch.
            </p>
          </div>

          {loginError && (
            <div className="p-3 bg-rose-950/60 border border-rose-800/80 text-rose-300 rounded-2xl text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          {!otpSent ? (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-400 uppercase">Agent Mobile Number</label>
                <div className="relative">
                  <Smartphone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="tel"
                    required
                    value={loginPhone}
                    onChange={(e) => setLoginPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-3.5 pl-10 pr-4 text-sm font-bold text-white outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs py-4 rounded-2xl uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 transition-transform hover:scale-[1.01]"
              >
                {loginLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'SEND AGENT LOGIN OTP'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-400 uppercase">Enter Verification OTP</label>
                  <button
                    type="button"
                    onClick={() => setOtpSent(false)}
                    className="text-[11px] text-emerald-400 font-bold hover:underline"
                  >
                    Change Phone
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    required
                    autoFocus
                    value={loginOtp}
                    onChange={(e) => setLoginOtp(e.target.value)}
                    placeholder="Enter 6-digit OTP"
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-3.5 pl-10 pr-4 text-sm font-bold text-emerald-400 outline-none focus:border-emerald-500 tracking-widest"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs py-4 rounded-2xl uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 transition-transform hover:scale-[1.01]"
              >
                {loginLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'VERIFY & ACCESS PORTAL'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          <div className="pt-2 text-center border-t border-slate-800/80">
            <p className="text-[11px] text-slate-500">
              Only authorized Junk It Out logistics personnel are permitted to sign in here.
            </p>
          </div>
        </div>
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
      {statusNotice && (
        <div className="p-3 text-xs font-bold text-center text-emerald-300 bg-emerald-950/60 border-b border-emerald-800 animate-scale-in">
          {statusNotice}
        </div>
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

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleAgentStatus}
            disabled={statusUpdating}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-extrabold border transition-all cursor-pointer disabled:opacity-50 ${
              isOnline
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
            }`}
          >
            {statusUpdating ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Power className="w-3.5 h-3.5" />
            )}
            {isOnline ? 'ONLINE' : 'OFFLINE'}
          </button>

          <button
            onClick={handleLogout}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-colors"
            title="Log Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* REALTIME NEW PICKUP NOTIFICATION BANNER */}
      {newPickupNotice && (
        <div className="mx-4 mt-4 bg-gradient-to-r from-emerald-950 via-slate-900 to-emerald-950 border-2 border-emerald-500 rounded-3xl p-5 shadow-2xl shadow-emerald-500/10">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500 text-slate-950 flex items-center justify-center font-black animate-pulse shrink-0">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-black tracking-widest text-emerald-400 uppercase bg-emerald-500/20 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                  🔔 NEW PICKUP AVAILABLE
                </span>
                <h3 className="font-extrabold text-white text-sm mt-1">
                  Order #{newPickupNotice.orderNumber}
                </h3>
              </div>
            </div>
            <button
              onClick={() => setNewPickupNotice(null)}
              className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
              title="Dismiss notification"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-800 grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Service Area</span>
              <span className="text-slate-200 font-semibold">{newPickupNotice.serviceArea || 'Bengaluru'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Est. Quantity</span>
              <span className="text-emerald-400 font-semibold">{newPickupNotice.estimatedQuantity || 'N/A'}</span>
            </div>
          </div>

          <div className="mt-4">
            <button
              onClick={() => handleViewPickupDetails(newPickupNotice.orderId)}
              disabled={loadingPickupDetails}
              className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black text-xs py-3.5 rounded-2xl uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 transition-all hover:scale-[1.01]"
            >
              {loadingPickupDetails ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
              VIEW PICKUP DETAILS
            </button>
          </div>
        </div>
      )}

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

            {!isOnline && activeOrder.status === 'AGENT_ASSIGNED' && (
              <div className="bg-rose-950/60 border border-rose-800 p-3.5 rounded-2xl space-y-2 text-center">
                <p className="text-xs text-rose-300 font-bold">
                  ⚠️ You are currently OFFLINE. Switch to ONLINE to accept pickups.
                </p>
                <button
                  onClick={toggleAgentStatus}
                  disabled={statusUpdating}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs py-3 rounded-xl uppercase tracking-wider shadow-md flex items-center justify-center gap-2"
                >
                  {statusUpdating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
                  SWITCH STATUS TO ONLINE
                </button>
              </div>
            )}

            {isOnline && activeOrder.status === 'AGENT_ASSIGNED' && (
              <button
                onClick={() => handleCallEndpoint('accept')}
                disabled={actionLoading}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-sm py-4 rounded-2xl shadow-lg flex items-center justify-center gap-2 transition-transform hover:scale-[1.01]"
              >
                {actionLoading ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : (
                  <CheckCircle className="w-5 h-5" />
                )}
                {actionLoading ? 'ACCEPTING ASSIGNMENT...' : 'ACCEPT PICKUP ASSIGNMENT'}
              </button>
            )}

            {activeOrder.status === 'AGENT_ACCEPTED' && (
              <button
                onClick={() => handleCallEndpoint('start')}
                disabled={actionLoading}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-sm py-4 rounded-2xl shadow-lg flex items-center justify-center gap-2 transition-transform hover:scale-[1.01]"
              >
                {actionLoading ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : (
                  <Play className="w-5 h-5" />
                )}
                {actionLoading ? 'STARTING JOURNEY...' : 'START JOURNEY TO CUSTOMER'}
              </button>
            )}

            {activeOrder.status === 'AGENT_ON_WAY' && (
              <button
                onClick={() => handleCallEndpoint('arrive')}
                disabled={actionLoading}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black text-sm py-4 rounded-2xl shadow-lg flex items-center justify-center gap-2 transition-transform hover:scale-[1.01]"
              >
                {actionLoading ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : (
                  <MapPin className="w-5 h-5" />
                )}
                {actionLoading ? 'MARKING ARRIVED...' : 'MARK ARRIVED AT DOORSTEP'}
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
          <p className="text-xs text-slate-400">You are on duty in Bengaluru. New orders will appear here automatically.</p>
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

      {/* READ-ONLY VIEW PICKUP MODAL */}
      {viewPickupModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-[10px] font-black text-amber-400 bg-amber-500/20 px-2.5 py-0.5 rounded-full border border-amber-500/30 uppercase">
                  UNASSIGNED PICKUP
                </span>
                <h3 className="text-base font-extrabold text-white mt-1 flex items-center gap-2">
                  <Truck className="w-5 h-5 text-emerald-400" />
                  Pickup Details
                </h3>
              </div>
              <button
                onClick={() => setViewPickupModal(null)}
                className="text-slate-400 hover:text-white p-1 rounded-xl bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between bg-slate-800/80 p-3 rounded-2xl border border-slate-700/50">
                <span className="text-slate-400 font-medium">Order Number:</span>
                <span className="font-mono font-bold text-white">{viewPickupModal.orderNumber}</span>
              </div>

              <div className="flex items-center justify-between bg-slate-800/80 p-3 rounded-2xl border border-slate-700/50">
                <span className="text-slate-400 font-medium">Status:</span>
                <span className="font-bold text-amber-400 bg-amber-950/60 border border-amber-800/60 px-2 py-0.5 rounded-full text-[11px]">
                  {viewPickupModal.status} (Unassigned)
                </span>
              </div>

              <div className="bg-slate-800/80 p-3 rounded-2xl border border-slate-700/50 space-y-1">
                <span className="text-slate-400 font-medium block">Pickup Location / Service Area:</span>
                <p className="font-bold text-white">
                  📍 {viewPickupModal.address?.area || viewPickupModal.serviceArea?.name || 'Bengaluru Zone'}
                </p>
                {viewPickupModal.address && (
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    {viewPickupModal.address.houseNo}, {viewPickupModal.address.street}, {viewPickupModal.address.area}
                  </p>
                )}
              </div>

              {viewPickupModal.items && viewPickupModal.items.length > 0 && (
                <div className="bg-slate-800/80 p-3 rounded-2xl border border-slate-700/50 space-y-2">
                  <span className="text-slate-400 font-medium block">Scrap Categories & Estimated Weights:</span>
                  <div className="space-y-1.5">
                    {viewPickupModal.items.map((item: any) => (
                      <div key={item.id} className="flex items-center justify-between bg-slate-900/60 p-2 rounded-xl border border-slate-800">
                        <span className="text-slate-200 font-semibold">{item.category?.name || 'Item'}</span>
                        <span className="text-emerald-400 font-bold">{item.estimatedWeight} kg</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-slate-950/60 border border-slate-800 p-3 rounded-2xl text-[11px] text-slate-400 leading-relaxed">
                ℹ️ <strong className="text-slate-300">Read-Only View:</strong> This pickup is unassigned and broadcast to eligible available agents in this service zone. Order status remains <code className="text-amber-400 font-mono">BOOKING_RECEIVED</code>.
              </div>
            </div>

            <button
              onClick={() => handleAcceptPickup(viewPickupModal.id)}
              disabled={acceptingPickup}
              className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black text-xs py-4 rounded-2xl uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 transition-all hover:scale-[1.01]"
            >
              {acceptingPickup ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4" />
              )}
              ACCEPT PICKUP
            </button>

            <button
              onClick={() => setViewPickupModal(null)}
              className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs py-3.5 rounded-2xl uppercase tracking-wider transition-colors"
            >
              CLOSE DETAILS
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
