'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Clock,
  MapPin,
  CheckCircle,
  Truck,
  PhoneCall,
  Scale,
  CreditCard,
  Download,
  AlertCircle,
  Star,
  RefreshCw,
  ShieldCheck,
  FileText,
  Camera,
} from 'lucide-react';
import InteractiveMap from '@/components/InteractiveMap';
import { getSecurePhotoUrl } from '@/lib/utils/photoUrl';

export default function OrderTrackingPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [agentLocation, setAgentLocation] = useState<any>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [rating, setRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [complaintText, setComplaintText] = useState('');
  const [showComplaintModal, setShowComplaintModal] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);

  const ACTIVE_TRACKING_STATUSES = ['AGENT_ASSIGNED', 'AGENT_ACCEPTED', 'AGENT_ON_WAY', 'AGENT_ARRIVED', 'WEIGHING'];

  const fetchOrderDetails = async () => {
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/orders/${id}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setOrder(data.data);
        if (data.data.agent && ACTIVE_TRACKING_STATUSES.includes(data.data.status)) {
          setAgentLocation({
            lat: data.data.agent.currentLat || 12.9081,
            lng: data.data.agent.currentLng || 77.5901,
          });
        } else {
          setAgentLocation(null);
        }
      } else {
        setErrorMsg(data.message || `Unable to load order details for #${id}`);
      }
    } catch (e) {
      console.error(e);
      setErrorMsg('Network connection error while fetching order details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrderDetails();

    // Subscribe to authenticated Customer SSE stream for live updates
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/customer/stream');

      eventSource.addEventListener('AGENT_ASSIGNED', (e: any) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.orderId === id || payload.orderNumber === id) {
            fetchOrderDetails();
          }
        } catch (err) {}
      });

      eventSource.addEventListener('ORDER_UPDATED', (e: any) => {
        try {
          const updated = JSON.parse(e.data);
          if (updated.id === id || updated.orderNumber === id) {
            fetchOrderDetails();
          }
        } catch (err) {}
      });

      eventSource.addEventListener('AGENT_LOCATION_UPDATED', (e: any) => {
        try {
          const loc = JSON.parse(e.data);
          setOrder((currentOrder: any) => {
            if (
              currentOrder &&
              loc.agentId === currentOrder.agentId &&
              ACTIVE_TRACKING_STATUSES.includes(currentOrder.status)
            ) {
              setAgentLocation({ lat: loc.lat, lng: loc.lng });
            }
            return currentOrder;
          });
        } catch (err) {}
      });
    } catch (err) {}

    // Gentle 10-second polling fallback in case SSE connection drops or is blocked
    const pollInterval = setInterval(() => {
      fetchOrderDetails();
    }, 10000);

    return () => {
      if (eventSource) {
        eventSource.close();
      }
      clearInterval(pollInterval);
    };
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="shimmer-box h-28 rounded-3xl w-full" />
        <div className="shimmer-box h-24 rounded-3xl w-full" />
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-5 shimmer-box h-64 rounded-3xl w-full" />
          <div className="md:col-span-7 shimmer-box h-64 rounded-3xl w-full" />
        </div>
      </div>
    );
  }

  if (errorMsg || !order) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
        <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
          <AlertCircle className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-xl font-black text-slate-900 mb-1">Order Access Restricted</h2>
          <p className="text-xs text-slate-600 leading-relaxed font-medium">
            {errorMsg || `Could not find pickup order #${id}`}
          </p>
        </div>
        <div className="pt-2 flex justify-center gap-3">
          <button
            onClick={() => router.push('/my-pickups')}
            className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-5 py-3 rounded-xl shadow-sm uppercase tracking-wider"
          >
            My Pickups
          </button>
          <button
            onClick={() => router.push('/')}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-5 py-3 rounded-xl border border-slate-200 uppercase tracking-wider"
          >
            Return Home
          </button>
        </div>
      </div>
    );
  }

  const statuses = [
    { key: 'BOOKING_RECEIVED', label: 'Booking Received' },
    { key: 'AGENT_ASSIGNED', label: 'Agent Assigned' },
    { key: 'AGENT_ACCEPTED', label: 'Agent Accepted' },
    { key: 'AGENT_ON_WAY', label: 'Agent On Way' },
    { key: 'AGENT_ARRIVED', label: 'Agent Arrived' },
    { key: 'WEIGHING', label: 'Weighing Waste' },
    { key: 'PICKUP_COMPLETED', label: 'Pickup Completed' },
    { key: 'SETTLEMENT_COMPLETED', label: 'Settlement Done' },
  ];

  const getStatusStepIndex = (status: string) => {
    switch (status) {
      case 'BOOKING_RECEIVED':
        return 0;
      case 'AGENT_BEING_ASSIGNED':
      case 'AGENT_ASSIGNED':
        return 1;
      case 'AGENT_ACCEPTED':
        return 2;
      case 'AGENT_ON_WAY':
        return 3;
      case 'AGENT_ARRIVED':
      case 'WASTE_VERIFICATION':
        return 4;
      case 'WEIGHING':
        return 5;
      case 'PICKUP_COMPLETED':
        return 6;
      case 'SETTLEMENT_COMPLETED':
        return 7;
      case 'CANCELLED':
        return -1;
      default:
        return 0;
    }
  };

  const currentStatusIdx = getStatusStepIndex(order.status);

  const loadRazorpayScript = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (typeof window !== 'undefined' && (window as any).Razorpay) {
        resolve(true);
        return;
      }
      const scriptId = 'razorpay-checkout-script';
      const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
      if (existing) {
        if ((window as any).Razorpay) {
          resolve(true);
          return;
        }
        existing.addEventListener('load', () => resolve(true), { once: true });
        existing.addEventListener('error', () => resolve(false), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  useEffect(() => {
    if (order && order.financialDirection === 'CUSTOMER_PAYS' && order.paymentStatus !== 'CAPTURED') {
      loadRazorpayScript().catch(() => {});
    }
  }, [order]);

  const handlePayNow = async () => {
    try {
      setPaymentLoading(true);
      setPaymentMessage(null);
      const scriptPromise = loadRazorpayScript();

      const createResponse = await fetch('/api/payments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id }),
      });
      const createData = await createResponse.json();
      if (!createResponse.ok || !createData.success) throw new Error(createData.message || 'Unable to start payment.');

      const scriptLoaded = await scriptPromise;
      if (!scriptLoaded) throw new Error('Unable to load Razorpay Checkout script.');

      const checkoutOptions: any = {
        key: createData.data.key,
        amount: Math.round(createData.data.amount * 100),
        currency: createData.data.currency,
        name: createData.data.name,
        description: createData.data.description,
        image: typeof window !== 'undefined' ? `${window.location.origin}/logo.png` : '/logo.png',
        order_id: createData.data.gatewayOrderId,
        handler: async (response: any) => {
          const verifyResponse = await fetch('/api/payments/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: order.id, ...response }),
          });
          const verifyData = await verifyResponse.json();
          if (!verifyResponse.ok || !verifyData.success) throw new Error(verifyData.message || 'Payment verification failed.');
          setPaymentMessage('Payment verified successfully.');
          fetchOrderDetails();
        },
        modal: { ondismiss: () => setPaymentLoading(false) },
        theme: { color: '#059669' },
      };
      const appUrl = process.env.NEXT_PUBLIC_APP_URL;
      if (appUrl?.startsWith('https://')) {
        checkoutOptions.callback_url = `${appUrl}/api/payments/callback`;
        checkoutOptions.redirect = true;
      }
      const checkout = new (window as any).Razorpay(checkoutOptions);
      checkout.on('payment.failed', () => {
        setPaymentMessage('Payment failed. You can retry when ready.');
        setPaymentLoading(false);
      });
      checkout.open();
    } catch (e) {
      setPaymentMessage(e instanceof Error ? e.message : 'Payment could not be started.');
      setPaymentLoading(false);
    }
  };
  const handleSubmitReview = async () => {
    try {
      await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          customerId: order.customerId,
          agentId: order.agentId,
          rating,
          comment: reviewComment,
        }),
      });
      setShowRatingModal(false);
      alert('Thank you for rating your pickup experience!');
    } catch (e) {
      console.error(e);
    }
  };

  const handleSubmitComplaint = async () => {
    if (!complaintText.trim()) return;
    try {
      const res = await fetch('/api/complaints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          category: 'WEIGHT_DISPUTE',
          description: complaintText.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setShowComplaintModal(false);
        setComplaintText('');
        alert('Issue reported to Junk It Out support desk. We will investigate immediately.');
      } else {
        alert(data.message || 'Failed to report issue. Please try again.');
      }
    } catch (e: any) {
      console.error(e);
      alert('Failed to report issue. Please try again.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* ORDER HEADER */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-extrabold bg-emerald-500 text-slate-950 px-2.5 py-0.5 rounded-full uppercase">
              Pickup Order
            </span>
            <span className="text-xs text-slate-400 font-mono">{order.orderNumber}</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight">{order.address?.area || 'South Bengaluru'} Pickup</h1>
          <p className="text-xs text-slate-400 mt-1">Booked on {new Date(order.createdAt).toLocaleString()}</p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold bg-slate-800 border border-slate-700 text-emerald-400 px-3 py-1.5 rounded-xl">
            ETA: {order.status === 'SETTLEMENT_COMPLETED' ? 'Completed' : '20-30 Mins'}
          </span>
          <button onClick={fetchOrderDetails} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* CANCELLED ALERT BANNER */}
      {order.status === 'CANCELLED' && (
        <div className="bg-rose-50 border border-rose-200 rounded-3xl p-5 text-rose-900 space-y-1">
          <div className="flex items-center gap-2 font-bold text-sm">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>Pickup Order Cancelled</span>
          </div>
          <p className="text-xs text-rose-700">
            {order.cancellationReason || 'This pickup request was cancelled.'}
          </p>
        </div>
      )}

      {/* STATUS PROGRESS TIMELINE */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
        <h3 className="text-sm font-bold text-slate-900">Pickup Lifecycle Progress</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2 text-center">
          {statuses.map((st, idx) => {
            const isDone = currentStatusIdx >= idx && currentStatusIdx !== -1;
            const isCurrent = currentStatusIdx === idx;

            return (
              <div
                key={st.key}
                className={`p-2 rounded-xl border text-[11px] font-bold transition-all duration-500 ${
                  isCurrent
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-md scale-105 pulse-emerald-glow'
                    : isDone
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-slate-50 text-slate-400 border-slate-200'
                }`}
              >
                <span className="block text-[10px] opacity-75">Step {idx + 1}</span>
                <span className="leading-tight block mt-0.5">{st.label}</span>
              </div>
            );
          })}
        </div>

        {/* TIMESTAMPED STATUS HISTORY TIMELINE LOGS */}
        {order.statusHistory && order.statusHistory.length > 0 && (
          <div className="pt-3 border-t border-slate-100 space-y-2">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Timeline Activity Log</h4>
            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {order.statusHistory.map((h: any) => (
                <div key={h.id} className="flex items-center justify-between text-[11px] bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100">
                  <span className="font-bold text-slate-800">
                    ● {h.newStatus.replace(/_/g, ' ')}
                    {h.notes ? <span className="font-normal text-slate-500 ml-1.5">({h.notes})</span> : null}
                  </span>
                  <span className="text-[10px] text-slate-400 shrink-0 ml-2">
                    {new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ASSIGNED AGENT & LIVE MAP */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Agent Info Card */}
        <div className="md:col-span-5 bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Assigned Pickup Agent</h3>

          {order.agent ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center text-xl font-bold border border-emerald-200">
                  🚚
                </div>
                <div>
                  <h4 className="font-extrabold text-slate-900 text-base">{order.agent.user.name}</h4>
                  <p className="text-xs text-slate-600 font-semibold">{order.agent.vehicleType}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[11px] bg-slate-100 font-mono px-2 py-0.5 rounded text-slate-700 font-bold">
                      {order.agent.vehicleNumber}
                    </span>
                    <span className="text-xs font-bold text-amber-600 flex items-center gap-0.5">
                      <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                      {order.agent.rating}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <a
                  href={`tel:${order.agent.user.phone}`}
                  className="w-full bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs py-2.5 rounded-xl border border-emerald-200 flex items-center justify-center gap-2 transition-colors"
                >
                  <PhoneCall className="w-4 h-4" />
                  Call Agent ({order.agent.user.phone})
                </a>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-amber-900 text-xs font-semibold">
              Finding nearest available agent in South Bengaluru...
            </div>
          )}

          {/* Pickup Address */}
          <div className="pt-2">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Pickup Address</h4>
            <div className="flex items-start gap-2 text-xs text-slate-700">
              <MapPin className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-slate-900">{order.address?.houseNo}</p>
                <p>{order.address?.street}, {order.address?.area}, Bengaluru - {order.address?.pincode}</p>
                {order.scheduledSlot && (
                  <p className="text-emerald-700 font-bold mt-1 text-[11px] bg-emerald-50 px-2.5 py-0.5 rounded-md inline-block">
                    📅 Schedule: {order.scheduledSlot}
                  </p>
                )}
                {order.notes && (
                  <p className="text-slate-700 font-medium italic mt-1.5 bg-slate-50 p-2 rounded-xl border border-slate-200 text-[11px]">
                    "{order.notes}"
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Live Interactive Tracking Map */}
        <div className="md:col-span-7">
          <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-200 h-full flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3 px-2">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Live Agent GPS Location</h3>
              <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full animate-pulse">
                ● Live Streaming
              </span>
            </div>

            <InteractiveMap
              centerLat={agentLocation?.lat || order.address?.lat || 12.9077}
              centerLng={agentLocation?.lng || order.address?.lng || 77.5854}
              zoom={14}
              markers={[
                { id: 'pickup', lat: order.address?.lat || 12.9077, lng: order.address?.lng || 77.5854, title: 'Your Address', type: 'PICKUP' },
                ...(agentLocation
                  ? [
                      {
                        id: 'agent',
                        lat: agentLocation.lat,
                        lng: agentLocation.lng,
                        title: order.agent ? order.agent.user.name : 'Pickup Agent',
                        vehicleNumber: order.agent?.vehicleNumber,
                        type: 'AGENT' as const,
                        status: order.agent?.status,
                      },
                    ]
                  : []),
              ]}
              routePoints={
                agentLocation
                  ? [
                      { lat: agentLocation.lat, lng: agentLocation.lng },
                      { lat: order.address?.lat || 12.9077, lng: order.address?.lng || 77.5854 },
                    ]
                  : []
              }
              className="h-72 w-full rounded-2xl border border-slate-200 overflow-hidden shadow-inner"
            />
          </div>
        </div>
      </div>

      {/* WEIGHT VERIFICATION & ITEM SUMMARY */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">Waste Items & Weight Breakdown</h3>
            <p className="text-xs text-slate-500">Includes estimated weight and agent-measured actual weight</p>
          </div>
          <button
            onClick={() => setShowComplaintModal(true)}
            className="text-xs text-rose-600 font-bold hover:underline"
          >
            Dispute Weight / Report Issue
          </button>
        </div>

        {/* Itemized Table */}
        <div className="divide-y divide-slate-100 text-xs">
          {order.items?.map((item: any) => (
            <div key={item.id} className="py-3 flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-900 block">{item.category?.name}</span>
                <span className="text-[11px] text-slate-500">Rate: ₹{item.ratePerKg}/kg</span>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-3">
                  <span className="text-slate-500">Est: {item.estimatedWeight} kg</span>
                  <span className="font-bold text-slate-900 bg-slate-100 px-2 py-1 rounded-lg">
                    Actual: {item.actualWeight !== null ? `${item.actualWeight} kg` : 'Pending Weighing'}
                  </span>
                  <span className="font-extrabold text-emerald-700">₹{item.subtotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Customer Waste Photos Proof */}
        {(() => {
          let parsedPhotos: string[] = [];
          try {
            parsedPhotos = typeof order.wastePhotos === 'string' ? JSON.parse(order.wastePhotos) : (order.wastePhotos || []);
          } catch (e) {
            parsedPhotos = [];
          }
          if (!parsedPhotos || parsedPhotos.length === 0) return null;
          return (
            <div className="pt-4 border-t border-slate-100">
              <h4 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-emerald-600" />
                Customer Waste Condition Photos ({parsedPhotos.length})
              </h4>
              <div className="flex flex-wrap items-center gap-3">
                {parsedPhotos.map((url: string, idx: number) => {
                  const displayUrl = getSecurePhotoUrl(url);
                  return (
                    <a key={idx} href={displayUrl} target="_blank" rel="noopener noreferrer" className="block group">
                      <img
                        src={displayUrl}
                        alt={`Waste Photo ${idx + 1}`}
                        className="w-20 h-20 object-cover rounded-xl border border-slate-200 shadow-sm group-hover:scale-105 transition-transform"
                      />
                    </a>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Scale Proof Photo if available */}
        {order.weightRecords && order.weightRecords.length > 0 && (
          <div className="pt-4 border-t border-slate-100 bg-slate-50 p-4 rounded-2xl">
            <h4 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
              <Scale className="w-4 h-4 text-emerald-600" />
              Verified Weighing Scale Photo Proof
            </h4>
            <div className="flex items-center gap-4">
              <img
                src={getSecurePhotoUrl(order.weightRecords[0].scalePhotoUrl)}
                alt="Weighing Scale Proof"
                className="w-24 h-24 rounded-xl object-cover border border-slate-300 shadow-sm"
              />
              <div className="text-xs text-slate-600 space-y-1">
                <p className="font-bold text-slate-900">Recorded on Digital Scale</p>
                <p>Recorded at: {new Date(order.weightRecords[0].createdAt).toLocaleString()}</p>
                <p className="text-emerald-700 font-semibold">Verified by agent on site.</p>
              </div>
            </div>
          </div>
        )}

        {order.financialDirection === 'JUNKITOUT_PAYS' && order.settlement && (
          <div className="pt-4 border-t border-slate-100 bg-emerald-50 p-4 rounded-2xl space-y-2 text-xs">
            <h4 className="font-black text-emerald-900">Scrap Settlement</h4>
            <div className="flex items-center justify-between"><span>Actual Weight</span><strong>{order.settlement.totalWeightKg} kg</strong></div>
            <div className="flex items-center justify-between"><span>Approved Rate</span><strong>{order.items?.map((item: any) => `₹${item.ratePerKg}/kg`).join(', ')}</strong></div>
            <div className="flex items-center justify-between"><span>Final Scrap Value</span><strong className="text-emerald-800">₹{order.settlement.amount.toFixed(2)}</strong></div>
            <div className="flex items-center justify-between"><span>Settlement Status</span><strong>{order.settlement.status}</strong></div>
          </div>
        )}

        {/* Totals & Financial Direction */}
        <div className="bg-slate-900 text-white p-5 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <span className="text-xs text-slate-400 uppercase font-semibold">Payment Status & Total Amount</span>
            <h4 className="text-xl font-black text-emerald-400 mt-0.5">
              Total Payable ₹{(order.finalAmount || 0).toFixed(2)}
            </h4>
            <p className="text-xs text-slate-300 mt-1">
              {order.paymentStatus === 'CAPTURED'
                ? 'Payment Paid'
                : order.paymentStatus === 'FAILED'
                ? 'Payment Failed'
                : 'Payment Required'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {order.financialDirection === 'CUSTOMER_PAYS' &&
              order.paymentStatus !== 'CAPTURED' &&
              order.status !== 'CANCELLED' && (
              <button
                onClick={handlePayNow}
                disabled={paymentLoading}
                className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 font-bold text-xs px-5 py-3 rounded-xl shadow-md transition-all flex items-center gap-2"
              >
                <CreditCard className="w-4 h-4" />
                {paymentLoading ? 'OPENING SECURE PAYMENT...' : 'PAY NOW (RAZORPAY)'}
              </button>
            )}

            {order.invoices && order.invoices.length > 0 && (
              <a
                href={`/api/orders/${order.id}`}
                target="_blank"
                className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold px-4 py-3 rounded-xl border border-slate-700 flex items-center gap-2"
              >
                <FileText className="w-4 h-4 text-emerald-400" />
                RECEIPT ({order.invoices[0].invoiceNumber})
              </a>
            )}
          </div>
          {paymentMessage && <p className="text-xs text-amber-200 sm:text-right">{paymentMessage}</p>}
        </div>
      </div>

      {/* COMPLAINT MODAL */}
      {showComplaintModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900">Report an Issue / Dispute Weight</h3>
            <textarea
              value={complaintText}
              onChange={(e) => setComplaintText(e.target.value)}
              placeholder="Describe your issue (e.g. wrong weight entered, agent behavior, delay)"
              rows={4}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs"
            ></textarea>
            <div className="flex gap-2">
              <button
                onClick={() => setShowComplaintModal(false)}
                className="w-1/2 bg-slate-100 text-slate-700 font-bold text-xs py-3 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitComplaint}
                className="w-1/2 bg-rose-600 text-white font-bold text-xs py-3 rounded-xl"
              >
                Submit Dispute
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
