'use client';

import { useState, useEffect, useRef } from 'react';
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
  XCircle,
  X,
  CreditCard,
  UserRound,
  History,
} from 'lucide-react';
import CustomerOtpLogin from '@/components/CustomerOtpLogin';
import { readCustomerPickupsResponse } from '@/lib/customerPickupsResponse';
import { getApiErrorMessage } from '@/lib/utils/apiErrorMessage';

const isCustomerCancellable = (status?: string): boolean => {
  return [
    'BOOKING_RECEIVED',
    'AGENT_BEING_ASSIGNED',
    'AGENT_ASSIGNED',
    'AGENT_ACCEPTED',
    'AGENT_ON_WAY',
  ].includes(status || '');
};

export default function MyPickupsPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'ALL' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'>('ALL');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [unauthenticated, setUnauthenticated] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [agentNotice, setAgentNotice] = useState<any | null>(null);
  const [pendingNotice, setPendingNotice] = useState<any | null>(null);

  // Cancellation State
  const [cancellingOrder, setCancellingOrder] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState('Need to reschedule for another time');
  const [customCancelReason, setCustomCancelReason] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const cancelInFlightRef = useRef(false);

  // Lock body scroll and handle Escape key while cancellation modal is open
  useEffect(() => {
    if (!cancellingOrder) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !cancelLoading) {
        setCancellingOrder(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [cancellingOrder, cancelLoading]);

  const requestInFlight = useRef(false);
  const mounted = useRef(false);

  const fetchOrders = async () => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    if (!mounted.current) setLoading(true);
    try {
      const res = await fetch('/api/orders', { credentials: 'same-origin' });
      const result = await readCustomerPickupsResponse(res);
      if (!mounted.current) return;

      if (result.kind === 'unauthenticated') {
        setSessionReady(true);
        setUnauthenticated(true);
        setOrders([]);
        setErrorMsg(null);
      } else if (result.kind === 'orders') {
        setSessionReady(true);
        setUnauthenticated(false);
        setOrders(result.orders);
        setErrorMsg(null);
        try {
          if (typeof window !== 'undefined') {
            const raw = sessionStorage.getItem('jio_pending_order');
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed?.id && result.orders.some((o: any) => o.id === parsed.id)) {
                sessionStorage.removeItem('jio_pending_order');
                setPendingNotice(null);
              }
            }
          }
        } catch {}
      } else {
        setErrorMsg(result.message);
      }
    } catch (e: any) {
      console.error('Fetch orders error:', e);
      if (mounted.current) {
        setErrorMsg('Network error loading pickup history. Please check your connection.');
      }
    } finally {
      requestInFlight.current = false;
      if (mounted.current) setLoading(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!cancellingOrder?.id || cancelInFlightRef.current || cancelLoading) return;
    cancelInFlightRef.current = true;
    setCancelLoading(true);
    setCancelError(null);

    const finalReason =
      cancelReason === 'Other'
        ? (customCancelReason.trim() || 'Order cancelled by customer')
        : customCancelReason.trim()
          ? `${cancelReason}: ${customCancelReason.trim()}`
          : cancelReason;

    try {
      const res = await fetch(`/api/orders/${cancellingOrder.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ cancellationReason: finalReason }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        setCancellingOrder(null);
        setCustomCancelReason('');
        try {
          if (typeof window !== 'undefined') {
            const raw = sessionStorage.getItem('jio_pending_order');
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed?.id === cancellingOrder.id) {
                sessionStorage.removeItem('jio_pending_order');
                setPendingNotice(null);
              }
            }
          }
        } catch {}
        await fetchOrders();
      } else {
        setCancelError(
          getApiErrorMessage(
            data,
            'Failed to cancel order. Please verify order status and try again.'
          )
        );
      }
    } catch {
      setCancelError('Network error while submitting cancellation request.');
    } finally {
      cancelInFlightRef.current = false;
      setCancelLoading(false);
    }
  };

  useEffect(() => {
    mounted.current = true;
    try {
      if (typeof window !== 'undefined') {
        const raw = sessionStorage.getItem('jio_pending_order');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.id && parsed?.orderNumber) {
            setPendingNotice(parsed);
          }
        }
      }
    } catch {}
    void fetchOrders();

    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!sessionReady || unauthenticated) return;

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

    // Polling fallback to keep pickups fresh if stream drops
    const pollInterval = window.setInterval(() => {
      fetchOrders();
    }, 15000);

    return () => {
      if (eventSource) {
        eventSource.close();
      }
      window.clearInterval(pollInterval);
    };
  }, [sessionReady, unauthenticated]);

  if (unauthenticated && !loading) {
    return (
      <div className="customer-page-cream min-h-[70vh]">
        <div className="customer-page max-w-xl">
        <div className="customer-hero rounded-[1.75rem] p-8 text-center text-white shadow-xl animate-scale-in sm:p-10">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl border border-emerald-300/20 bg-emerald-400/15 text-emerald-300">
            <Smartphone className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <p className="customer-eyebrow text-emerald-300">Customer dashboard</p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-white">Your pickups, all in one place</h1>
            <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-emerald-50/70">
              Log in with your mobile OTP to view your active doorstep pickups, order status, and digital scrap receipts.
            </p>
          </div>
          <button
            onClick={() => setLoginOpen(true)}
            className="customer-action mt-5 w-full rounded-2xl bg-emerald-400 py-3.5 text-xs font-black uppercase tracking-wider text-slate-950 shadow-lg shadow-emerald-950/30 hover:bg-emerald-300"
          >
            LOGIN WITH MOBILE OTP
          </button>
        </div>

        <CustomerOtpLogin
          open={loginOpen}
          onClose={() => setLoginOpen(false)}
          onAuthenticated={() => {
            setSessionReady(true);
            setUnauthenticated(false);
            void fetchOrders();
          }}
        />
        </div>
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
    <div className="customer-page space-y-6">
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
      <div className="customer-page-header">
        <div>
          <p className="customer-eyebrow">Customer dashboard</p>
          <h1 className="customer-title mt-2">My pickups</h1>
          <p className="customer-subtitle mt-2">Track current doorstep pickups and revisit past waste receipts.</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchOrders}
            className="customer-action grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-700 transition-colors hover:bg-slate-200"
            title="Refresh Orders"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <Link
            href="/book"
            className="customer-action flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-xs font-extrabold uppercase tracking-wider text-white shadow-md hover:bg-emerald-700"
          >
            + BOOK NEW PICKUP
          </Link>
        </div>
      </div>

      <section className="customer-dashboard-overview overflow-hidden rounded-[1.75rem] border border-emerald-900/20 bg-[#071b16] p-5 text-white shadow-xl sm:p-7">
        <div className="relative z-10 grid gap-6 lg:grid-cols-[1.1fr_.9fr] lg:items-end">
          <div className="max-w-xl">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">
              Your pickup activity
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] sm:text-3xl">
              Keep your doorstep clear.
            </h2>
            <p className="mt-2 max-w-lg text-xs leading-relaxed text-emerald-50/70 sm:text-sm">
              Follow every request from booking to collection, or start a new pickup whenever you are ready.
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              <Link
                href="/book"
                className="customer-action inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-xs font-black text-slate-950 shadow-lg shadow-emerald-950/30 hover:bg-emerald-300"
              >
                <Package className="h-4 w-4" />
                Book a Pickup
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <Link
                href="/customer/profile"
                className="customer-action inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-xs font-bold text-white hover:bg-white/15"
              >
                <UserRound className="h-4 w-4 text-emerald-300" />
                Manage profile
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
            {[
              { label: 'Total', value: orders.length, icon: Layers },
              { label: 'Active', value: activeOrders.length, icon: Truck },
              { label: 'Completed', value: completedOrders.length, icon: CheckCircle },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.07] p-3 backdrop-blur-sm sm:p-4">
                <Icon className="h-4 w-4 text-emerald-300" />
                <strong className="mt-3 block text-2xl font-black tracking-tight">{value}</strong>
                <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-wider text-emerald-50/55">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { href: '/book', label: 'Book a pickup', detail: 'Schedule doorstep collection', icon: Package },
          { href: '/customer/orders', label: 'Pickup history', detail: 'Review your requests', icon: History },
          { href: '/customer/profile', label: 'Manage profile', detail: 'Update account details', icon: UserRound },
        ].map(({ href, label, detail, icon: Icon }) => (
          <Link key={href + label} href={href} className="customer-surface group flex items-center gap-3 p-4 hover:border-emerald-300 hover:shadow-md">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700 transition-transform group-hover:scale-105">
              <Icon className="h-4.5 w-4.5" />
            </span>
            <span className="min-w-0">
              <strong className="block text-xs font-black text-slate-900">{label}</strong>
              <span className="mt-0.5 block truncate text-[11px] font-medium text-slate-500">{detail}</span>
            </span>
            <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-emerald-600" />
          </Link>
        ))}
      </div>

      {/* FILTER TABS WITH DYNAMIC REAL COUNTS */}
      <div className="customer-surface flex items-center gap-1 overflow-x-auto p-1.5">
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

      {/* PENDING PAYMENT NOTICE FOR RECENT BOOKING */}
      {pendingNotice && (
        <div className="p-4 bg-amber-50 border-2 border-amber-300 text-amber-950 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm animate-scale-in">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl shrink-0 mt-0.5 border border-amber-200">
              <Clock className="w-5 h-5 text-amber-700" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-[10px] uppercase tracking-wider text-amber-900 bg-amber-200/80 px-2 py-0.5 rounded font-mono">
                  Payment Pending
                </span>
                <span className="font-mono text-xs font-bold text-slate-900">
                  Order #{pendingNotice.orderNumber}
                </span>
              </div>
              <p className="text-xs text-amber-900 font-medium">
                Your pickup request for {pendingNotice.area || 'Bengaluru'} is awaiting payment of ₹{Number(pendingNotice.finalAmount || 0).toFixed(2)}. Complete payment to assign your pickup agent.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            <Link
              href={`/orders/${pendingNotice.id}`}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow-sm flex items-center gap-1.5"
            >
              <CreditCard className="w-3.5 h-3.5" />
              Complete Payment
            </Link>
            <button
              onClick={() => {
                if (typeof window !== 'undefined') {
                  sessionStorage.removeItem('jio_pending_order');
                }
                setPendingNotice(null);
              }}
              className="text-slate-400 hover:text-slate-600 text-xs p-2 rounded-lg cursor-pointer"
              title="Dismiss notice"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

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

                {o.status === 'CANCELLED' && (
                  <div className="p-3 bg-rose-50/80 rounded-2xl border border-rose-200/80 space-y-1 text-xs">
                    <div className="flex items-center gap-1.5 font-bold text-rose-800">
                      <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                      <span>Pickup Order Cancelled</span>
                    </div>
                    {o.cancellationReason && (
                      <p className="text-[11px] text-rose-700">
                        Reason: {o.cancellationReason}
                      </p>
                    )}
                    {o.paymentStatus === 'REFUND_PENDING' && (
                      <p className="text-[11px] font-semibold text-amber-800">
                        Refund Status: 100% refund is queued for admin review to your original payment method.
                      </p>
                    )}
                    {o.paymentStatus === 'REFUNDED' && (
                      <p className="text-[11px] font-semibold text-emerald-800">
                        Refund Status: 100% refunded to your original payment method.
                      </p>
                    )}
                  </div>
                )}

                {/* CARD FOOTER */}
                <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-[11px] text-slate-400 block font-medium">Total Booking Amount</span>
                    <span className="text-base font-black text-emerald-600">
                      ₹{(o.finalAmount || o.estimatedTotal || 0).toFixed(2)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {isCustomerCancellable(o.status) && (
                      <button
                        type="button"
                        onClick={() => {
                          setCancelError(null);
                          setCancellingOrder(o);
                        }}
                        className="btn-glossy-danger rounded-full text-xs font-bold px-4 py-2 shadow-xs flex items-center gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Cancel
                      </button>
                    )}

                    <Link
                      href={`/orders/${o.id}`}
                      className="btn-glossy-dark rounded-full text-white text-xs font-extrabold px-5 py-2.5 flex items-center gap-1.5 shadow-sm uppercase tracking-wider"
                    >
                      TRACK PICKUP
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CANCELLATION MODAL */}
      {cancellingOrder && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-pickup-dialog-title"
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 overflow-y-auto pb-[calc(1rem+env(safe-area-inset-bottom,0px))]"
        >
          {/* Backdrop overlay: blurs background page content only, dismissible on click */}
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
            style={{ WebkitBackdropFilter: 'blur(4px)' }}
            onClick={() => !cancelLoading && setCancellingOrder(null)}
            aria-hidden="true"
          />

          {/* Modal content: completely sharp, isolated from backdrop filter, scrollable on short mobile viewports */}
          <div
            className="relative z-10 bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl border border-slate-100 my-auto max-h-[calc(100dvh-2rem)] overflow-y-auto"
            style={{ transform: 'translateZ(0)' }}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2 text-rose-600 font-extrabold text-base">
                <AlertTriangle className="w-5 h-5" />
                <h3 id="cancel-pickup-dialog-title" className="text-slate-900 font-black">
                  Cancel Pickup Order
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !cancelLoading && setCancellingOrder(null)}
                disabled={cancelLoading}
                className="p-1 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to cancel pickup order{" "}
              <strong className="text-slate-900 font-mono">#{cancellingOrder.orderNumber}</strong>?
            </p>

            {cancellingOrder.paymentStatus === 'CAPTURED' && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-xs text-amber-900">
                <span className="font-bold block">Prepaid Order Refund</span>
                Your paid amount of ₹{(cancellingOrder.finalAmount || cancellingOrder.estimatedTotal || 0).toFixed(2)} will be automatically queued for a 100% refund to your original payment method.
              </div>
            )}

            {cancelError && (
              <div role="alert" className="bg-rose-50 border border-rose-200 rounded-2xl p-3 text-xs text-rose-800 font-semibold flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{cancelError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="modal-cancel-reason-select" className="text-xs font-bold text-slate-700 block">
                Reason for cancellation:
              </label>
              <select
                id="modal-cancel-reason-select"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                disabled={cancelLoading}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-rose-500"
              >
                <option value="Need to reschedule for another time">Need to reschedule for another time</option>
                <option value="Scrap/junk items are no longer available">Scrap/junk items are no longer available</option>
                <option value="Placed order by mistake / testing">Placed order by mistake / testing</option>
                <option value="Assigned agent is delayed or taking too long">Assigned agent is delayed or taking too long</option>
                <option value="Found alternative disposal method">Found alternative disposal method</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {cancelReason === 'Other' && (
              <div className="space-y-1.5">
                <label htmlFor="modal-custom-cancel-reason" className="text-xs font-bold text-slate-700 block">
                  Please specify:
                </label>
                <textarea
                  id="modal-custom-cancel-reason"
                  value={customCancelReason}
                  onChange={(e) => setCustomCancelReason(e.target.value)}
                  placeholder="Tell us why you are cancelling this pickup..."
                  rows={3}
                  disabled={cancelLoading}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:ring-2 focus:ring-rose-500"
                />
              </div>
            )}

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setCancellingOrder(null)}
                disabled={cancelLoading}
                className="w-1/2 btn-glossy-secondary rounded-full font-bold text-xs py-3 shadow-xs"
              >
                Keep Pickup
              </button>

              <button
                type="button"
                onClick={handleCancelOrder}
                disabled={cancelLoading}
                className="w-1/2 btn-glossy-danger rounded-full font-bold text-xs py-3 shadow-md flex items-center justify-center gap-1.5"
              >
                {cancelLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                    Cancelling...
                  </>
                ) : (
                  'Confirm Cancellation'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <CustomerOtpLogin
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onAuthenticated={() => {
          setSessionReady(true);
          setUnauthenticated(false);
          void fetchOrders();
        }}
      />
    </div>
  );
}
