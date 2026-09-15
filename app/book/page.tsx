'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  MapPin,
  Trash2,
  Clock,
  Calendar,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Ticket,
  CheckCircle2,
  Truck,
  Search,
  Check,
  Sparkles,
  ShieldCheck,
  CreditCard,
} from 'lucide-react';
import CustomerOtpLogin from '@/components/CustomerOtpLogin';
import LocationSearchModal from '@/components/LocationSearchModal';
import InteractiveMap, { loadGoogleMaps } from '@/components/InteractiveMap';
import { readPickupCart } from '@/lib/pickupCart';
import { getSelectedLocation, setSelectedLocation, LOCATION_CHANGE_EVENT } from '@/lib/selectedLocation';

// Standard 1-hour pickup time slots
const TIME_SLOTS = [
  { id: '09-10', label: '09:00 AM - 10:00 AM', startHour: 9 },
  { id: '10-11', label: '10:00 AM - 11:00 AM', startHour: 10 },
  { id: '11-12', label: '11:00 AM - 12:00 PM', startHour: 11 },
  { id: '12-13', label: '12:00 PM - 01:00 PM', startHour: 12 },
  { id: '14-15', label: '02:00 PM - 03:00 PM', startHour: 14 },
  { id: '16-17', label: '04:00 PM - 05:00 PM', startHour: 16 },
  { id: '18-19', label: '06:00 PM - 07:00 PM', startHour: 18 },
];

export default function BookingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);

  // Form & User State
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isCustomer, setIsCustomer] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  // Location & Address State (Initialized dynamically from selectedLocation helper)
  const [area, setArea] = useState<string>('');
  const [fullAddress, setFullAddress] = useState<string>('');
  const [lat, setLat] = useState<number>(12.9716);
  const [lng, setLng] = useState<number>(77.5946);
  const [locating, setLocating] = useState(false);
  const [geofenceResult, setGeofenceResult] = useState<any>(null);
  const [locationStatusMsg, setLocationStatusMsg] = useState<string | null>(null);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [locationSearchModalOpen, setLocationSearchModalOpen] = useState(false);

  // Map Card Search Input & Predictions
  const [mapSearchQuery, setMapSearchQuery] = useState('');
  const [mapSearchPredictions, setMapSearchPredictions] = useState<any[]>([]);
  const [searchingMapLocation, setSearchingMapLocation] = useState(false);

  const autocompleteServiceRef = useRef<any>(null);
  const geocoderRef = useRef<any>(null);

  // Address Details & Labels
  const [addressLabel, setAddressLabel] = useState<'Home' | 'Work' | 'Other'>('Home');
  const [houseNo, setHouseNo] = useState('');
  const [building, setBuilding] = useState('');
  const [street, setStreet] = useState('');
  const [landmark, setLandmark] = useState('');
  const [pincode, setPincode] = useState('');

  // Step 1: Waste Categories Selection
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedItems, setSelectedItems] = useState<{ categoryId: string; estimatedWeight: number }[]>([]);

  // Step 2: Pickup Time & Instructions
  const [pickupType, setPickupType] = useState<'ASAP' | 'SCHEDULED'>('ASAP');
  const [instructions, setInstructions] = useState('Please call when outside the main gate.');

  // Date and Time Slot selection for Scheduled Pickup
  const [selectedDateIdx, setSelectedDateIdx] = useState(0); // 0 = Today, 1 = Tomorrow, etc.
  const [selectedSlotId, setSelectedSlotId] = useState('16-17');

  // Step 3: Summary, Pricing & Confirmation
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>('WELCOME50');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successOrder, setSuccessOrder] = useState<any>(null);

  // Idempotency Protection Ref
  const idempotencyKeyRef = useRef<string>('');

  // Generate 4 available dates dynamically starting today
  const availableDates = [0, 1, 2, 3].map((offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const dayLabel =
      offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short' });
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const fullDateIso = d.toISOString().split('T')[0];
    return { offset, dayLabel, dateStr, fullDateIso, isToday: offset === 0 };
  });

  // Current Hour for past-slot calculation
  const currentHour = new Date().getHours();

  const getDisplayName = (userObj: any) => {
    if (!userObj) return 'Customer';
    if (userObj.name && typeof userObj.name === 'string') {
      const trimmed = userObj.name.trim();
      return trimmed || 'Customer';
    }
    return 'Customer';
  };

  // Load location from centralized helper & check saved addresses
  const loadLocationFromStore = async () => {
    const stored = getSelectedLocation();
    if (stored && stored.area) {
      setArea(stored.area);
      setFullAddress(stored.address);
      setLat(stored.lat);
      setLng(stored.lng);
      if (stored.placeId) setPlaceId(stored.placeId);
      if (stored.street) setStreet(stored.street);
      if (stored.pincode) setPincode(stored.pincode);
      setGeofenceResult({
        serviceable: stored.serviceable,
        zone: stored.zoneName ? { name: stored.zoneName } : undefined,
      });
      return;
    }

    // Try fetching saved customer default address if logged in
    try {
      const res = await fetch('/api/customer/addresses');
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.data) && data.data.length > 0) {
        const addr = data.data[0];
        const formatted = `${addr.houseNo ? `${addr.houseNo}, ` : ''}${addr.street ? `${addr.street}, ` : ''}${addr.area}, Bengaluru`;
        setArea(addr.area);
        setFullAddress(formatted);
        setLat(addr.lat);
        setLng(addr.lng);
        if (addr.street) setStreet(addr.street);
        if (addr.pincode) setPincode(addr.pincode);

        // Verify serviceability of saved address
        await runGeofenceCheck(addr.lat, addr.lng);
      }
    } catch {}
  };

  const checkAuth = async () => {
    setCheckingAuth(true);
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (res.ok && data?.success && data?.data?.user?.role === 'CUSTOMER') {
        setIsCustomer(true);
        setPhone(data.data.user.phone || '');
        setName(getDisplayName(data.data.user));
      } else {
        setIsCustomer(false);
        setPhone('');
        setName('');
        setLoginOpen(true);
      }
    } catch {
      setIsCustomer(false);
      setPhone('');
      setName('');
      setLoginOpen(true);
    } finally {
      setCheckingAuth(false);
    }
  };

  // Fetch categories, location & auth status on mount
  useEffect(() => {
    checkAuth();
    loadLocationFromStore();

    fetch('/api/waste-categories')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data)) {
          setCategories(data.data);
          const params = new URLSearchParams(window.location.search);
          const requestedCategory = params.get('category');
          const cartItems = params.get('cart') ? readPickupCart() : [];
          const selectedCategory = data.data.find(
            (c: any) => c.id === requestedCategory || c.name === requestedCategory
          );
          const defaultServiceCategory = data.data.find((c: any) => c.type === 'WASTE_CHARGE') || data.data[0];

          if (cartItems.length > 0) {
            const validItems = cartItems
              .filter((item) => data.data.some((c: any) => c.id === item.categoryId))
              .map((item) => ({ categoryId: item.categoryId, estimatedWeight: Math.max(1, item.quantity || 5) }));
            if (validItems.length > 0) setSelectedItems(validItems);
          } else if (selectedCategory) {
            setSelectedItems([{ categoryId: selectedCategory.id, estimatedWeight: 5 }]);
          } else if (defaultServiceCategory) {
            setSelectedItems([{ categoryId: defaultServiceCategory.id, estimatedWeight: 5 }]);
          }
        }
      })
      .catch(() => {});

    const handleLocUpdate = () => {
      loadLocationFromStore();
    };

    window.addEventListener('jio_auth_change', checkAuth);
    window.addEventListener(LOCATION_CHANGE_EVENT, handleLocUpdate);

    return () => {
      window.removeEventListener('jio_auth_change', checkAuth);
      window.removeEventListener(LOCATION_CHANGE_EVENT, handleLocUpdate);
    };
  }, []);

  const runGeofenceCheck = async (targetLat: number, targetLng: number) => {
    try {
      const res = await fetch('/api/service-areas/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: targetLat, lng: targetLng }),
      });
      const data = await res.json();
      if (data.success && data.data?.serviceable) {
        setGeofenceResult(data.data);
        if (data.data.zone?.name) {
          setArea(data.data.zone.name);
        }
        return data.data;
      } else {
        const result = {
          serviceable: false,
          message: data.data?.message || data.message || "We don't currently serve this location. Please select a location in Bengaluru.",
        };
        setGeofenceResult(result);
        return result;
      }
    } catch (e) {
      const result = {
        serviceable: false,
        message: 'Unable to verify service area. Please check network connection.',
      };
      setGeofenceResult(result);
      return result;
    }
  };

  const toggleCategory = (catId: string) => {
    const exists = selectedItems.find((i) => i.categoryId === catId);
    if (exists) {
      if (selectedItems.length === 1) return; // Maintain at least 1 selected category
      setSelectedItems(selectedItems.filter((i) => i.categoryId !== catId));
    } else {
      setSelectedItems([...selectedItems, { categoryId: catId, estimatedWeight: 5 }]);
    }
  };

  // Calculate customer payable amount for booking flow
  const calculateEstimate = () => {
    let totalWasteCharge = 0;
    const baseCharge = geofenceResult?.zone?.basePickupCharge || 49.0;

    selectedItems.forEach((item) => {
      const cat = categories.find((c) => c.id === item.categoryId);
      if (cat && cat.type === 'WASTE_CHARGE') {
        totalWasteCharge += item.estimatedWeight * cat.pricePerKg;
      }
    });

    const discount = appliedCoupon === 'WELCOME50' ? 50 : 0;
    const netPayable = Math.max(1, baseCharge + totalWasteCharge - discount);

    return {
      totalWasteCharge,
      baseCharge,
      discount,
      netAmount: netPayable,
      direction: 'CUSTOMER_PAYS' as const,
    };
  };

  const estimate = calculateEstimate();

  // Selected date object & time slot label
  const curDateObj = availableDates[selectedDateIdx] || availableDates[0];
  const curSlotObj = TIME_SLOTS.find((s) => s.id === selectedSlotId) || TIME_SLOTS[0];
  const formattedScheduledSlot = `${curDateObj.dayLabel} (${curDateObj.dateStr}), ${curSlotObj.label}`;

  function loadRazorpayScript(): Promise<boolean> {
    return new Promise((resolve) => {
      if (typeof window !== 'undefined' && (window as any).Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }

  // Master Customer Booking & Razorpay Payment Handler
  const handleConfirmOrder = async () => {
    if (!isCustomer) {
      setLoginOpen(true);
      setErrorMsg('Authentication is required. Please log in with mobile OTP to complete your booking.');
      return;
    }

    if (!area || !geofenceResult?.serviceable) {
      setErrorMsg(geofenceResult?.message || 'Please select a valid pickup location in Bengaluru before confirming.');
      return;
    }

    if (selectedItems.length === 0) {
      setErrorMsg('Please select at least one waste category.');
      return;
    }

    // Ensure session-stable idempotency key
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = `booking-${phone.replace(/[\s+]/g, '')}-${Date.now()}`;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      // 1. Create order on server (CUSTOMER_PAYS)
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKeyRef.current,
        },
        body: JSON.stringify({
          phone,
          name,
          address: {
            label: addressLabel || 'Home',
            houseNo: houseNo || area || 'Pickup Location',
            building: building || undefined,
            street: street || area || 'Main Road',
            area,
            landmark: landmark || undefined,
            pincode: pincode || '560001',
            lat,
            lng,
            googlePlaceId: placeId,
          },
          items: selectedItems,
          pickupType,
          scheduledSlot: pickupType === 'SCHEDULED' ? formattedScheduledSlot : null,
          couponCode: appliedCoupon,
          photos: [], // Photo upload removed per user requirement
          notes: instructions,
          financialDirection: 'CUSTOMER_PAYS',
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setLoading(false);
        setErrorMsg(data.message || 'Failed to place order. Please verify your details and try again.');
        return;
      }

      const orderData = data.data;

      // 2. Initialize Razorpay Payment Order
      const payRes = await fetch('/api/payments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: orderData.id }),
      });

      const payData = await payRes.json();
      if (!payRes.ok || !payData.success) {
        setLoading(false);
        setErrorMsg(payData.message || 'Failed to initialize Razorpay payment order.');
        return;
      }

      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        setLoading(false);
        setErrorMsg('Failed to load Razorpay payment SDK. Please check your network connection.');
        return;
      }

      const razorpayConfig = payData.data;

      const options = {
        key: razorpayConfig.key,
        amount: Math.round(razorpayConfig.amount * 100),
        currency: razorpayConfig.currency || 'INR',
        name: 'Junk It Out',
        description: razorpayConfig.description || `Pickup Order #${orderData.orderNumber}`,
        image: typeof window !== 'undefined' ? `${window.location.origin}/logo.png` : '/logo.png',
        order_id: razorpayConfig.gatewayOrderId,
        handler: async function (response: any) {
          setLoading(true);
          try {
            const verifyRes = await fetch('/api/payments/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                orderId: orderData.id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });

            const verifyData = await verifyRes.json();
            setLoading(false);

            if (verifyRes.ok && verifyData.success) {
              setSuccessOrder({
                ...orderData,
                paymentStatus: 'CAPTURED',
                status: 'BOOKING_RECEIVED',
              });
            } else {
              setErrorMsg(verifyData.message || 'Payment verification failed server-side. Your booking has not been confirmed.');
            }
          } catch {
            setLoading(false);
            setErrorMsg('Network error verifying payment. Please check your order in My Pickups.');
          }
        },
        prefill: {
          name: name || 'Customer',
          contact: phone || '',
        },
        theme: {
          color: '#059669', // Emerald 600
        },
        modal: {
          ondismiss: function () {
            setLoading(false);
            setErrorMsg('Payment process was cancelled. Your booking has not been confirmed.');
          },
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', function (response: any) {
        setLoading(false);
        setErrorMsg(`Payment failed: ${response?.error?.description || 'Transaction declined.'} Your booking has not been confirmed.`);
      });

      // Open Razorpay Checkout (BEFORE confirming booking)
      rzp.open();
    } catch (err: any) {
      setLoading(false);
      setErrorMsg('Network error while processing booking request. Please try again.');
    }
  };

  // SUCCESS CONFIRMATION SCREEN (ONLY shown AFTER verified Razorpay payment)
  if (successOrder) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="bg-white rounded-3xl p-8 sm:p-10 shadow-2xl border border-emerald-100 text-center space-y-6 animate-scale-in">
          <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle2 className="w-12 h-12 stroke-[2.5]" />
          </div>

          <div className="space-y-2">
            <span className="text-xs font-black text-emerald-700 bg-emerald-50 px-3.5 py-1.5 rounded-full uppercase tracking-wider">
              ✓ Payment Verified & Booking Confirmed!
            </span>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight mt-1">Booking Confirmed</h1>
            <p className="text-xs font-mono font-extrabold text-slate-500">Order ID: #{successOrder.orderNumber}</p>
          </div>

          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 text-left text-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
              <span className="text-slate-500 font-semibold">Booking Status:</span>
              <span className="font-extrabold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full uppercase text-[10px]">
                {successOrder.status.replace(/_/g, ' ')}
              </span>
            </div>

            <div className="flex items-start justify-between">
              <span className="text-slate-500 font-semibold shrink-0">Pickup Address:</span>
              <span className="font-bold text-slate-900 text-right max-w-[240px]">
                {fullAddress || `${area}, Bengaluru`}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-semibold">Pickup Schedule:</span>
              <span className="font-bold text-emerald-700">
                {pickupType === 'ASAP' ? '⚡ 20–30 Mins Doorstep Pickup' : formattedScheduledSlot}
              </span>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-200">
              <span className="text-slate-600 font-bold">Amount Paid:</span>
              <span className="font-black text-emerald-600 text-base">
                ₹{Number(successOrder.finalAmount || estimate.netAmount).toFixed(2)}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-600 font-bold">Payment Status:</span>
              <span className="font-extrabold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                ✓ Verified via Razorpay
              </span>
            </div>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-3.5 rounded-2xl text-xs text-left font-medium">
            <p className="font-bold text-emerald-800 mb-0.5">🚀 What Happens Next?</p>
            <p>
              Your payment is verified. Our nearest agent is assigned and will arrive at your doorstep for pickup.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-3">
            <Link
              href={`/orders/${successOrder.id}`}
              className="hover-lift w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs py-4 rounded-2xl shadow-lg flex items-center justify-center gap-2 uppercase tracking-wider"
            >
              <Truck className="w-4 h-4" />
              TRACK PICKUP LIVE
            </Link>

            <Link
              href="/customer/orders"
              className="hover-lift w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs py-4 rounded-2xl flex items-center justify-center gap-2 border border-slate-200 uppercase tracking-wider"
            >
              MY PICKUPS
            </Link>

            <Link
              href="/"
              className="hover-lift w-full bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold text-xs py-4 rounded-2xl flex items-center justify-center gap-2 border border-slate-200 uppercase tracking-wider"
            >
              BACK TO HOME
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* 3-STEP PROGRESS HEADER */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase tracking-wide">
              On-Demand Doorstep Pickup
            </span>
            <h1 className="text-2xl font-black text-slate-950 tracking-tight mt-1">Book Waste Pickup</h1>
          </div>
          <span className="text-xs font-extrabold text-emerald-800 bg-emerald-100 px-3.5 py-1.5 rounded-full">
            Step {step} of 3
          </span>
        </div>

        {/* Clean 3-Step Progress Indicator */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { id: 1, title: 'Waste Categories' },
            { id: 2, title: 'Location & Time' },
            { id: 3, title: 'Summary & Payment' },
          ].map((st) => (
            <div key={st.id} className="space-y-1">
              <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full bg-emerald-600 transition-all duration-300 ease-out"
                  style={{ width: step > st.id ? '100%' : step === st.id ? '100%' : '0%' }}
                />
              </div>
              <span
                className={`text-[11px] block font-bold truncate ${
                  step === st.id ? 'text-emerald-700 font-extrabold' : 'text-slate-500'
                }`}
              >
                {step > st.id ? '✓ ' : `${st.id}. `}
                {st.title}
              </span>
            </div>
          ))}
        </div>
      </div>

      {errorMsg && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-900 rounded-2xl text-xs font-bold flex items-center gap-2.5 animate-scale-in">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* STEP 1: CATEGORY SELECTION ("What are we picking up?") */}
      {step === 1 && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-6 animate-scale-in">
          <div>
            <h2 className="text-xl font-black text-slate-950 tracking-tight">What are we picking up?</h2>
            <p className="text-xs text-slate-500 font-semibold mt-1">
              Select the category that best fits the items you want to dispose of.
            </p>
          </div>

          {/* Simple Clean Category Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {categories.map((cat) => {
              const isSelected = selectedItems.some((i) => i.categoryId === cat.id);

              return (
                <div
                  key={cat.id}
                  onClick={() => toggleCategory(cat.id)}
                  className={`group relative flex items-center justify-between p-4 rounded-2xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'border-emerald-600 bg-emerald-50/70 shadow-sm ring-2 ring-emerald-500/20'
                      : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/80'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0 pr-2">
                    <span
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl font-bold transition-colors ${
                        isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 group-hover:bg-emerald-100 group-hover:text-emerald-700'
                      }`}
                    >
                      <Sparkles className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <span className="block text-sm font-black text-slate-900 truncate">{cat.name}</span>
                      <span className="block text-xs text-slate-500 truncate mt-0.5 font-medium">
                        {cat.description || 'Doorstep collection'}
                      </span>
                    </div>
                  </div>

                  {/* Clean Selection Indicator */}
                  <div className="shrink-0 flex items-center gap-2">
                    <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-200">
                      ₹{cat.pricePerKg}/kg
                    </span>
                    <span
                      className={`grid h-6 w-6 place-items-center rounded-full border transition-all ${
                        isSelected
                          ? 'border-emerald-600 bg-emerald-600 text-white shadow-xs'
                          : 'border-slate-300 bg-white text-transparent'
                      }`}
                    >
                      <Check className="h-3.5 w-3.5 stroke-[3]" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end">
            <button
              disabled={selectedItems.length === 0}
              onClick={() => {
                setErrorMsg('');
                setStep(2);
              }}
              className="hover-lift w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-extrabold text-sm px-8 py-4 rounded-2xl shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              CONTINUE TO LOCATION & TIME
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: PICKUP LOCATION & SCHEDULE */}
      {step === 2 && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-6 animate-scale-in">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-xl font-black text-slate-950 tracking-tight">Pickup Location & Schedule</h2>
              <p className="text-xs text-slate-500 font-semibold mt-1">Verify your pickup address and choose timing</p>
            </div>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1 font-extrabold cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          </div>

          {/* PICKUP LOCATION DISPLAY / SELECTOR */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                Pickup Address:
              </label>
              <button
                type="button"
                onClick={() => setLocationSearchModalOpen(true)}
                className="text-xs font-extrabold text-emerald-700 hover:underline bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200 shadow-xs cursor-pointer"
              >
                {area ? 'Change Location' : 'Select Location'}
              </button>
            </div>

            {area && geofenceResult?.serviceable ? (
              <div className="bg-emerald-50/50 border border-emerald-200 p-4 rounded-2xl space-y-2">
                <div className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-emerald-600 shrink-0" />
                  <span className="text-base font-black text-slate-950">{area}</span>
                </div>
                <p className="text-xs font-semibold text-slate-600 pl-7 leading-relaxed">
                  {fullAddress || `${area}, Bengaluru`}
                </p>
                <div className="mt-2 pt-2 border-t border-emerald-200/60 flex items-center gap-2 text-xs font-bold text-emerald-800">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>✓ Active Doorstep Service Zone in Bengaluru</span>
                </div>
              </div>
            ) : (
              <div className="bg-amber-50 border-2 border-dashed border-amber-300 p-5 rounded-2xl text-center space-y-3">
                <div className="flex justify-center text-amber-600">
                  <MapPin className="h-8 w-8 animate-bounce" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-amber-950">No Pickup Location Selected</h3>
                  <p className="text-xs text-amber-800 font-semibold mt-0.5">
                    Please select your doorstep pickup area in Bengaluru before proceeding.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setLocationSearchModalOpen(true)}
                  className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold px-6 py-3 rounded-xl shadow-md cursor-pointer transition-all inline-flex items-center gap-2"
                >
                  <Search className="h-4 w-4" />
                  SELECT PICKUP LOCATION
                </button>
              </div>
            )}
          </div>

          {/* GOOGLE MAP DISPLAY FOR PICKUP LOCATION */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                Pickup Location Pin on Map:
              </label>
              <span className="text-[11px] font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200">
                📍 {lat.toFixed(4)}, {lng.toFixed(4)}
              </span>
            </div>
            <InteractiveMap
              centerLat={lat}
              centerLng={lng}
              zoom={15}
              markers={[
                {
                  id: 'selected-pickup',
                  lat,
                  lng,
                  title: area || 'Selected Pickup Location',
                  subtitle: fullAddress || `${area}, Bengaluru`,
                  type: 'PICKUP',
                },
              ]}
              onLocationSelect={async (newLat, newLng) => {
                setLat(newLat);
                setLng(newLng);
                const check = await runGeofenceCheck(newLat, newLng);
                const locData = {
                  address: fullAddress || `${area}, Bengaluru`,
                  area: check?.zone?.name || area || 'Bengaluru',
                  lat: newLat,
                  lng: newLng,
                  serviceable: Boolean(check?.serviceable),
                  zoneName: check?.zone?.name,
                };
                setSelectedLocation(locData);
              }}
              className="h-64 sm:h-72 w-full rounded-2xl overflow-hidden shadow-sm border border-slate-200"
            />
            <p className="text-[11px] text-slate-500 font-semibold flex items-center gap-1">
              📍 Drag marker or tap anywhere on map to fine-tune your doorstep pickup pin
            </p>
          </div>

          {/* DISPATCH MODE SELECTOR (ASAP vs SCHEDULED) */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <label className="block text-xs font-extrabold text-slate-800 uppercase tracking-wider">Pickup Speed & Timing:</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div
                onClick={() => setPickupType('ASAP')}
                className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                  pickupType === 'ASAP'
                    ? 'border-emerald-600 bg-emerald-50/70 shadow-sm ring-2 ring-emerald-500/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-5 h-5 text-emerald-600" />
                  <span className="font-extrabold text-slate-950 text-sm">⚡ ASAP (20–30 Mins)</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed font-medium">
                  Nearest available agent assigned immediately for doorstep collection.
                </p>
              </div>

              <div
                onClick={() => setPickupType('SCHEDULED')}
                className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                  pickupType === 'SCHEDULED'
                    ? 'border-emerald-600 bg-emerald-50/70 shadow-sm ring-2 ring-emerald-500/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="w-5 h-5 text-indigo-600" />
                  <span className="font-extrabold text-slate-950 text-sm">📅 Schedule for Later</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed font-medium">Select a specific date and 1-hour window for pickup.</p>
              </div>
            </div>
          </div>

          {/* SCHEDULED DATE & SLOT SELECTOR */}
          {pickupType === 'SCHEDULED' && (
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4 animate-scale-in">
              <div>
                <label className="block text-xs font-extrabold text-slate-800 mb-2">1. Select Pickup Date:</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {availableDates.map((d, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedDateIdx(idx)}
                      className={`p-3 rounded-xl border text-center transition-all ${
                        selectedDateIdx === idx
                          ? 'bg-emerald-600 text-white border-emerald-600 font-extrabold shadow-xs'
                          : 'bg-white text-slate-800 border-slate-200 font-bold hover:bg-slate-100'
                      }`}
                    >
                      <span className="block text-xs">{d.dayLabel}</span>
                      <span className="block text-[11px] opacity-80 mt-0.5">{d.dateStr}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-800 mb-2">2. Select 1-Hour Time Slot:</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {TIME_SLOTS.map((slot) => {
                    const isPast = curDateObj.isToday && slot.startHour <= currentHour;
                    const isSelected = selectedSlotId === slot.id;

                    return (
                      <button
                        key={slot.id}
                        type="button"
                        disabled={isPast}
                        onClick={() => setSelectedSlotId(slot.id)}
                        className={`p-3 rounded-xl border text-left text-xs font-bold transition-all flex items-center justify-between ${
                          isPast
                            ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed line-through'
                            : isSelected
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                            : 'bg-white text-slate-800 border-slate-200 hover:border-emerald-400'
                        }`}
                      >
                        <span>{slot.label}</span>
                        {isPast ? (
                          <span className="text-[10px] text-rose-500 font-semibold no-underline">Expired</span>
                        ) : isSelected ? (
                          <span className="text-[10px] bg-emerald-700 text-white px-2 py-0.5 rounded">Selected</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* PICKUP INSTRUCTIONS */}
          <div className="space-y-1.5 pt-2 border-t border-slate-100">
            <label className="block text-xs font-extrabold text-slate-800">
              Pickup Instructions for Agent (Optional):
            </label>
            <input
              type="text"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Ring main gate bell, call on arrival, park near building B"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-semibold outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
            />
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            <button
              onClick={() => setStep(1)}
              className="text-slate-600 font-extrabold text-sm px-4 py-2 hover:bg-slate-100 rounded-xl cursor-pointer"
            >
              Back
            </button>
            <button
              disabled={!area || !geofenceResult?.serviceable}
              onClick={() => {
                if (!area || !geofenceResult?.serviceable) {
                  setErrorMsg('Please select a pickup location before proceeding.');
                  return;
                }
                setErrorMsg('');
                setStep(3);
              }}
              className="hover-lift bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-extrabold text-sm px-6 py-3.5 rounded-2xl shadow-md flex items-center gap-2 cursor-pointer transition-all"
            >
              VIEW SUMMARY & PAY
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: BOOKING SUMMARY & PAYMENT VERIFICATION */}
      {step === 3 && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-6 animate-scale-in">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-xl font-black text-slate-950 tracking-tight">Booking Summary</h2>
              <p className="text-xs text-slate-500 font-semibold mt-1">Review your details and pay to confirm pickup</p>
            </div>
            <button
              onClick={() => setStep(2)}
              className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1 font-extrabold cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Edit Details
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* PICKUP LOCATION & SCHEDULE SUMMARY */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Pickup Location & Schedule</h3>
              <div className="flex items-start gap-2.5">
                <MapPin className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-extrabold text-sm text-slate-900">{area}</p>
                  <p className="text-xs text-slate-600 font-medium leading-relaxed">{fullAddress || `${area}, Bengaluru`}</p>
                  <p className="text-[11px] text-slate-500 mt-1 font-semibold">Contact: {name || 'Customer'} ({phone || 'Logged In'})</p>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs font-semibold">
                <span className="text-slate-600">Pickup Schedule:</span>
                <span className="text-emerald-700 font-extrabold bg-emerald-100 px-2.5 py-0.5 rounded-full">
                  {pickupType === 'ASAP' ? '⚡ 20–30 Mins ASAP' : formattedScheduledSlot}
                </span>
              </div>

              {instructions && (
                <div className="pt-2 border-t border-slate-200 text-xs">
                  <span className="text-slate-500 block font-semibold">Instructions:</span>
                  <span className="text-slate-800 font-medium italic">"{instructions}"</span>
                </div>
              )}
            </div>

            {/* SELECTED WASTE CATEGORIES SUMMARY */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Selected Waste Items</h3>
              <div className="space-y-2 text-xs">
                {selectedItems.map((item) => {
                  const cat = categories.find((c) => c.id === item.categoryId);
                  return (
                    <div key={item.categoryId} className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-slate-200">
                      <div>
                        <span className="font-extrabold text-slate-900 block">{cat?.name}</span>
                        <span className="text-[11px] text-slate-500 font-medium">Rate: ₹{cat?.pricePerKg}/kg</span>
                      </div>
                      <span className="font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                        {item.estimatedWeight} kg (Est)
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* PROMO COUPON BANNER */}
          <div className="bg-emerald-50/60 p-4 rounded-2xl border border-emerald-200 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Ticket className="w-5 h-5 text-emerald-600" />
              <div>
                <span className="font-extrabold text-xs text-slate-900 block">Promo Coupon Applied</span>
                <span className="text-[11px] text-emerald-700 font-semibold">WELCOME50 — ₹50 discount on pickup fee</span>
              </div>
            </div>
            <span className="text-xs font-black bg-emerald-600 text-white px-3 py-1 rounded-lg">
              APPLIED
            </span>
          </div>

          {/* FINANCIAL SUMMARY BOX */}
          <div className="bg-slate-950 text-white p-5 rounded-2xl space-y-3 shadow-lg">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2">
              Payment Summary
            </h3>
            {estimate.totalWasteCharge > 0 && (
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>Heavy Waste Service Charge:</span>
                <span>₹{estimate.totalWasteCharge.toFixed(2)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>Doorstep Pickup Charge:</span>
              <span>₹{estimate.baseCharge.toFixed(2)}</span>
            </div>
            {estimate.discount > 0 && (
              <div className="flex items-center justify-between text-xs text-emerald-400">
                <span>Coupon Discount (WELCOME50):</span>
                <span>- ₹{estimate.discount.toFixed(2)}</span>
              </div>
            )}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-base font-black">
              <span>Total Customer Amount to Pay:</span>
              <span className="text-xl text-emerald-400">₹{estimate.netAmount.toFixed(2)}</span>
            </div>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 flex items-center justify-between text-xs font-semibold">
            <span className="text-slate-600 font-bold">Payment Method:</span>
            <span className="font-extrabold text-slate-900 flex items-center gap-1.5">
              <CreditCard className="w-4 h-4 text-emerald-600" />
              Razorpay Standard Checkout (UPI / Cards / NetBanking)
            </span>
          </div>

          {/* ACTION BUTTONS */}
          <div className="flex flex-col gap-2 pt-2">
            <div className="flex items-center justify-between gap-4">
              <button
                onClick={() => setStep(2)}
                className="text-slate-600 font-extrabold text-sm px-4 py-2 hover:bg-slate-100 rounded-xl shrink-0 cursor-pointer"
              >
                Back
              </button>
              <button
                disabled={loading}
                onClick={handleConfirmOrder}
                className="hover-lift w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white font-black text-base py-4 rounded-2xl shadow-xl flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                {loading ? (
                  <>
                    <Clock className="w-5 h-5 animate-spin" />
                    OPENING RAZORPAY CHECKOUT...
                  </>
                ) : (
                  <>
                    PAY ₹{estimate.netAmount.toFixed(2)} & CONFIRM PICKUP
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>

            <p className="text-[11px] text-center text-slate-500 font-semibold mt-1">
              🔒 Secure payment powered by Razorpay. Booking confirmed only after verified successful payment.
            </p>
          </div>
        </div>
      )}

      {/* CUSTOMER OTP AUTH MODAL */}
      <CustomerOtpLogin
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onAuthenticated={async () => {
          await checkAuth();
          setLoginOpen(false);
        }}
      />

      {/* LOCATION SEARCH MODAL */}
      <LocationSearchModal
        open={locationSearchModalOpen}
        onClose={() => setLocationSearchModalOpen(false)}
        currentArea={area || 'Select delivery location'}
        onSelectLocation={(data) => {
          setSelectedLocation(data);
          setArea(data.area);
          setLat(data.lat);
          setLng(data.lng);
          if (data.placeId) setPlaceId(data.placeId);
          if (data.houseNo) setHouseNo(data.houseNo);
          if (data.street) setStreet(data.street);
          if (data.pincode) setPincode(data.pincode);
          setFullAddress(data.address || `${data.area}, Bengaluru`);
          setGeofenceResult({
            serviceable: data.serviceable,
            zone: data.zoneName ? { name: data.zoneName } : undefined,
          });
          setLocationSearchModalOpen(false);
        }}
      />
    </div>
  );
}
