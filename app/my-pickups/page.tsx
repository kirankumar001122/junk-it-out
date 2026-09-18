'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Package,
  MapPin,
  Clock,
  Calendar,
  ArrowRight,
  RefreshCw,
  Truck,
  PhoneCall,
  CheckCircle,
  AlertTriangle,
  Filter,
  Camera,
  Layers,
  Smartphone,
  ShieldCheck,
} from 'lucide-react';
import CustomerOtpLogin from '@/components/CustomerOtpLogin';

export default function MyPickupsPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'ALL' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'>('ALL');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [unauthenticated, setUnauthenticated] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [agentNotice, setAgentNotice] = useState<any | null>(null);

  const fetchOrders = async () => {
    setLoading(true);
    setErrorMsg(null);
    setUnauthenticated(false);
    try {
      const res = await fetch('/api/orders');
      const data = await res.json();
      if (res.status === 401 || (!data.success && data.message?.includes('Authentication required'))) {
        setUnauthenticated(true);
        setOrders([]);
      } else if (data.success) {
        setOrders(data.data || []);
      } else {
        setErrorMsg(data.message || 'Failed to load your pickup history.');
      }
    } catch (e: any) {
      console.error('Fetch orders error:', e);
      setErrorMsg('Network error loading pickup history. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();

    if (unauthenticated) return;

    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/customer/stream');

      eventSource.addEventListener('AGENT_ASSIGNED', (e: MessageEvent) => {
        try {
          const payload = JSON.parse(e.data);
          console.log('[CUSTOMER SSE] AGENT_ASSIGNED received:', payload);
          setAgentNotice(payload);
          fetchOrders();
        } catch (err) {
          console.error('[CUSTOMER SSE] Parse error:', err);
        }
      });

      eventSource.addEventListener('ORDER_UPDATED', () => {
        fetchOrders();
      });

      eventSource.onerror = () => {
        // EventSource will automatically handle reconnection safely
      };
    } catch (err) {
      console.error('[CUSTOMER SSE] Init notice:', err);
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [unauthenticated]);

  if (unauthenticated && !loading) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 space-y-6">
        <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm text-center space-y-5 animate-scale-in">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-700 rounded-3xl grid place-items-center mx-auto">
            <Smartphone className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-black text-slate-900">Sign in to View Your Pickups</h1>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              Log in with your mobile OTP to view your active doorstep pickups, order status, and digital scrap receipts.
            </p>
          </div>
          <button
            onClick={() => setLoginOpen(true)}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs py-3.5 rounded-2xl shadow-md uppercase tracking-wider transition-transform hover:scale-[1.01]"
          >
            LOGIN WITH MOBILE OTP
          </button>
        </div>

        <CustomerOtpLogin
          open={loginOpen}
          onClose={() => setLoginOpen(false)}
          onAuthenticated={() => fetchOrders()}
        />
      </div>
    );
  }

  // Filter Counts
  const activeOrders = orders.filter(
    (o) => !['SETTLEMENT_COMPLETED', 'PICKUP_COMPLETED', 'CANCELLED'].includes(o.status)
  );
  const completedOrders = orders.filter((o) =>
    ['SETTLEMENT_COMPLETED', 'PICKUP_COMPLETED'].includes(o.status)
  );
  const cancelledOrders = orders.filter((o) => o.status === 'CANCELLED');

  const filteredOrders =
    activeTab === 'ACTIVE'
      ? activeOrders
      : activeTab === 'COMPLETED'
      ? completedOrders
      : activeTab === 'CANCELLED'
      ? cancelledOrders
      : orders;

  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case 'SETTLEMENT_COMPLETED':
      case 'PICKUP_COMPLETED':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'CANCELLED':
        return 'bg-rose-100 text-rose-800 border-rose-200';
      case 'AGENT_ON_WAY':
      case 'AGENT_ARRIVED':
      case 'WEIGHING':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200 animate-pulse';
      case 'AGENT_ASSIGNED':
      case 'AGENT_ACCEPTED':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-amber-100 text-amber-900 border-amber-200';
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* REALTIME AGENT ASSIGNED NOTIFICATION BANNER */}
      {agentNotice && (
        <div className="bg-slate-900 border-2 border-emerald-500 rounded-3xl p-5 text-white shadow-xl flex items-start justify-between animate-scale-in">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500 text-slate-950 flex items-center justify-center font-black shrink-0 animate-bounce">
              <Truck className="w-5 h-5" />
            </div>
            <div className="space-y-0.5">
              <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                🔔 AGENT ASSIGNED
              </span>
              <h3 className="font-extrabold text-sm text-white mt-1">
                Your Pickup #{agentNotice.orderNumber} has been accepted!
              </h3>
              <p className="text-xs text-slate-300">
                Agent <strong className="text-emerald-400">{agentNotice.agentName || 'Partner'}</strong> ({agentNotice.vehicleNumber || 'Auto Loading'}) has been assigned to your pickup request.
              </p>
            </div>
          </div>
          <button
            onClick={() => setAgentNotice(null)}
            className="text-slate-400 hover:text-white p-1 rounded-lg"
            title="Dismiss notification"
          >
            ✕
          </button>
        </div>
      )}

      {/* HEADER WITH BOOK NEW PICKUP BUTTON */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase">
            Customer Dashboard
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">My Waste Pickups</h1>
          <p className="text-xs text-slate-500">Track current doorstep pickups and view past waste receipts</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchOrders}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors"
            title="Refresh Orders"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <Link
            href="/book"
            className="hover-lift bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-5 py-3 rounded-xl shadow-md flex items-center gap-2 uppercase tracking-wider"
          >
            + BOOK NEW PICKUP
          </Link>
        </div>
      </div>

      {/* FILTER TABS WITH DYNAMIC REAL COUNTS */}
      <div className="bg-white rounded-2xl p-1.5 border border-slate-200 shadow-sm flex items-center gap-1 overflow-x-auto">
        {[
          { id: 'ALL', label: 'All Pickups', count: orders.length },
          { id: 'ACTIVE', label: 'Active / Upcoming', count: activeOrders.length },
          { id: 'COMPLETED', label: 'Completed', count: completedOrders.length },
          { id: 'CANCELLED', label: 'Cancelled', count: cancelledOrders.length },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2 ${
              activeTab === tab.id
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>{tab.label}</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                activeTab === tab.id
                  ? 'bg-emerald-700 text-white'
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-900 rounded-2xl text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={fetchOrders} className="text-rose-600 hover:underline font-bold">
            Retry
          </button>
        </div>
      )}

      {/* ORDERS LIST */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="shimmer-box h-40 rounded-3xl w-full" />
          ))}
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 space-y-4 shadow-sm animate-scale-in">
          <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
            <Package className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-900">
              {activeTab === 'ALL' ? 'No Pickups Yet' : `No ${activeTab.toLowerCase()} pickups found`}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {activeTab === 'ALL'
                ? 'Book your first doorstep waste pickup in Bengaluru and turn your recyclable junk into cash!'
                : 'You currently do not have any orders under this filter.'}
            </p>
          </div>
          <Link
            href="/book"
            className="hover-lift bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold px-6 py-3.5 rounded-xl inline-block shadow-md uppercase tracking-wider"
          >
            BOOK A PICKUP NOW
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((o) => {
            let photoCount = 0;
            try {
              const parsed = typeof o.wastePhotos === 'string' ? JSON.parse(o.wastePhotos) : o.wastePhotos;
              if (Array.isArray(parsed)) photoCount = parsed.length;
            } catch (e) {}

            return (
              <div
                key={o.id}
                className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4 hover:border-emerald-300 transition-colors animate-scale-in"
              >
                {/* CARD HEADER */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-black text-slate-900">#{o.orderNumber}</span>
                    <span className="text-xs text-slate-400 font-medium">
                      • {new Date(o.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>

                  <span
                    className={`text-[10px] font-extrabold px-3 py-1 rounded-full uppercase border self-start sm:self-auto ${getStatusBadgeStyle(
                      o.status
                    )}`}
                  >
                    ● {o.status.replace(/_/g, ' ')}
                  </span>
                </div>

                {/* CARD BODY */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1.5">
                    <div className="flex items-start gap-2 text-slate-700">
                      <MapPin className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold text-slate-900">{o.address?.houseNo}</p>
                        <p className="text-slate-600">{o.address?.street}, {o.address?.area}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-slate-600 pt-1">
                      <Clock className="w-4 h-4 text-indigo-600 shrink-0" />
                      <span className="font-semibold text-indigo-900 bg-indigo-50 px-2.5 py-0.5 rounded-full">
                        {o.pickupType === 'ASAP' ? '⚡ 20–30 Mins ASAP' : o.scheduledSlot || 'Scheduled'}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 space-y-1">
                      <span className="text-[11px] text-slate-500 font-semibold block">Waste Items:</span>
                      <p className="font-bold text-slate-900 line-clamp-2">
                        {o.items?.map((i: any) => `${i.category?.name || 'Waste'} (${i.estimatedWeight}kg)`).join(', ') || 'Recyclables'}
                      </p>
                      {photoCount > 0 && (
                        <span className="text-[10px] text-slate-500 font-semibold inline-flex items-center gap-1 mt-1 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                          <Camera className="w-3 h-3 text-emerald-600" />
                          {photoCount} Photo(s)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* ASSIGNED AGENT FOOTER CARD */}
                {o.agent && (
                  <div className="p-3 bg-emerald-50/60 rounded-2xl border border-emerald-200/60 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-sm">
                        🚚
                      </div>
                      <div>
                        <span className="font-extrabold text-slate-900 block">{o.agent.user?.name}</span>
                        <span className="text-[10px] text-emerald-800 font-semibold">
                          {o.agent.vehicleType} • {o.agent.vehicleNumber}
                        </span>
                      </div>
                    </div>

                    <a
                      href={`tel:${o.agent.user?.phone}`}
                      className="bg-white hover:bg-slate-50 text-emerald-700 border border-emerald-300 px-3 py-1.5 rounded-xl font-bold text-[11px] flex items-center gap-1 shrink-0"
                    >
                      <PhoneCall className="w-3.5 h-3.5" />
                      Call Agent
                    </a>
                  </div>
                )}

                {/* CARD FOOTER */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] text-slate-400 block font-medium">Total Booking Amount</span>
                    <span className="text-base font-black text-emerald-600">
                      ₹{(o.finalAmount || o.estimatedTotal || 0).toFixed(2)}
                    </span>
                  </div>

                  <Link
                    href={`/orders/${o.id}`}
                    className="hover-lift bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold px-4 py-2.5 rounded-xl flex items-center gap-1.5 shadow-sm uppercase tracking-wider"
                  >
                    TRACK PICKUP
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CustomerOtpLogin
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onAuthenticated={() => fetchOrders()}
      />
    </div>
  );
}
