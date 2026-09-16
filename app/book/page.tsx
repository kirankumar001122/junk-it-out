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
  Plus,
  Minus,
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
      await runGeofenceCheck(stored.lat, stored.lng);
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
              .map((item) => ({ categoryId: item.categoryId, estimatedWeight: Math.max(1, item.quantity || 1) }));
            if (validItems.length > 0) setSelectedItems(validItems);
          } else if (selectedCategory) {
            setSelectedItems([{ categoryId: selectedCategory.id, estimatedWeight: 1 }]);
          } else if (defaultServiceCategory) {
            setSelectedItems([{ categoryId: defaultServiceCategory.id, estimatedWeight: 1 }]);
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
      setSelectedItems([...selectedItems, { categoryId: catId, estimatedWeight: 1 }]);
    }
  };

  const updateItemWeight = (catId: string, weight: number) => {
    if (weight <= 0) {
      if (selectedItems.length > 1) {
        setSelectedItems(selectedItems.filter((i) => i.categoryId !== catId));
      }
      return;
    }
    const safeWeight = Math.max(1, Math.min(500, Math.round(weight)));
    setSelectedItems(
      selectedItems.map((i) => (i.categoryId === catId ? { ...i, estimatedWeight: safeWeight } : i))
    );
  };

  const calculateEstimate = () => {
    let totalWasteItemsValue = 0;
    const baseCharge = geofenceResult?.zone?.basePickupCharge || 69.0;

    selectedItems.forEach((item) => {
      const cat = categories.find((c) => c.id === item.categoryId);
      if (cat) {
        totalWasteItemsValue += item.estimatedWeight * cat.pricePerKg;
      }
    });

    const discount = appliedCoupon === 'WELCOME50' ? 50 : 0;
    const rawPayable = totalWasteItemsValue + baseCharge - discount;
    const netPayable = Math.max(1, Math.round(rawPayable * 100) / 100);

    return {
      totalWasteItemsValue: Math.round(totalWasteItemsValue * 100) / 100,
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
  }

  // Preload Razorpay checkout SDK as soon as customer reaches summary & payment step
  useEffect(() => {
    if (step === 3) {
      loadRazorpayScript().catch(() => {});
    }
  }, [step]);

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

    // Preload / load SDK in parallel with API calls
    const scriptPromise = loadRazorpayScript();

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

      const scriptLoaded = await scriptPromise;
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
        <div className="bg-white rounded-2xl p-6 sm:p-10 shadow-xl border border-slate-200 text-center space-y-6 animate-scale-in">
          <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto border border-emerald-100">
            <CheckCircle2 className="w-9 h-9 stroke-[2.2]" />
          </div>

          <div className="space-y-1.5">
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full uppercase tracking-wider border border-emerald-200/80">
              Payment Verified & Booking Confirmed
            </span>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1">Booking Confirmed!</h1>
            <p className="text-xs font-mono font-bold text-slate-500">Order ID: #{successOrder.orderNumber}</p>
          </div>

          <div className="bg-slate-50 p-4 sm:p-5 rounded-xl border border-slate-200 text-left text-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-2.5">
              <span className="text-slate-500 font-medium">Booking Status:</span>
              <span className="font-bold text-emerald-700 bg-emerald-100/80 px-2.5 py-0.5 rounded-md uppercase text-[10px]">
                {successOrder.status.replace(/_/g, ' ')}
              </span>
            </div>

            <div className="flex items-start justify-between">
              <span className="text-slate-500 font-medium shrink-0">Pickup Address:</span>
              <span className="font-bold text-slate-900 text-right max-w-[240px]">
                {fullAddress || `${area}, Bengaluru`}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">Pickup Schedule:</span>
              <span className="font-bold text-emerald-700">
                {pickupType === 'ASAP' ? '⚡ 20–30 Mins Doorstep Pickup' : formattedScheduledSlot}
              </span>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-200/80">
              <span className="text-slate-600 font-bold">Amount Paid:</span>
              <span className="font-extrabold text-emerald-700 text-sm">
                ₹{Number(successOrder.finalAmount || estimate.netAmount).toFixed(2)}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-600 font-bold">Payment Status:</span>
              <span className="font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-md text-[11px]">
                ✓ Verified via Razorpay
              </span>
            </div>
          </div>

          <div className="bg-emerald-50/80 border border-emerald-200/80 text-emerald-900 p-3.5 rounded-xl text-xs text-left font-medium">
            <p className="font-bold text-emerald-800 mb-0.5">🚀 What Happens Next?</p>
            <p>
              Your payment is verified. Our nearest agent is assigned and will arrive at your doorstep for pickup.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
            <Link
              href={`/orders/${successOrder.id}`}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-3 rounded-xl shadow-sm flex items-center justify-center gap-2 uppercase tracking-wider transition-all"
            >
              <Truck className="w-4 h-4 text-emerald-400" />
              Track Pickup Live
            </Link>

            <Link
              href="/customer/orders"
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs py-3 rounded-xl flex items-center justify-center gap-2 border border-slate-200 uppercase tracking-wider transition-all"
            >
              My Pickups
            </Link>

            <Link
              href="/"
              className="w-full bg-white hover:bg-slate-50 text-slate-600 font-bold text-xs py-3 rounded-xl flex items-center justify-center gap-2 border border-slate-200 uppercase tracking-wider transition-all"
            >
              Back to Home
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
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full uppercase tracking-wider border border-emerald-200/80">
              Doorstep Pickup Booking
            </span>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1">Book Waste Pickup</h1>
          </div>
          <span className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1 rounded-lg border border-slate-200">
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
              <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full bg-emerald-600 transition-all duration-300 ease-out"
                  style={{ width: step > st.id ? '100%' : step === st.id ? '100%' : '0%' }}
                />
              </div>
              <span
                className={`text-[11px] block truncate font-medium ${
                  step === st.id ? 'text-emerald-700 font-bold' : 'text-slate-500'
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
        <div className="mb-6 p-3.5 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl text-xs font-medium flex items-center gap-2.5 animate-scale-in">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* STEP 1: CATEGORY SELECTION ("What are we picking up?") */}
      {step === 1 && (
        <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-200 space-y-6 animate-scale-in">
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">What materials are you disposing?</h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Select one or more waste categories to schedule for doorstep collection.
            </p>
          </div>

          {/* Simple Clean Category Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {categories.map((cat) => {
              const selectedItem = selectedItems.find((i) => i.categoryId === cat.id);
              const isSelected = Boolean(selectedItem);
              const quantity = selectedItem ? selectedItem.estimatedWeight : 0;

              return (
                <div
                  key={cat.id}
                  className={`group relative flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50/60 shadow-sm ring-1 ring-emerald-500/30'
                      : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/80'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <span
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xs font-bold transition-colors ${
                        isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 group-hover:bg-emerald-100 group-hover:text-emerald-700'
                      }`}
                    >
                      <Sparkles className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <span className="block text-xs font-bold text-slate-900 truncate">{cat.name}</span>
                      <span className="block text-[11px] text-slate-500 truncate mt-0.5 font-normal">
                        ₹{cat.pricePerKg}/kg · {cat.description || 'Doorstep collection'}
                      </span>
                    </div>
                  </div>

                  {/* Quantity Stepper Control */}
                  <div className="shrink-0 flex items-center gap-2">
                    {!isSelected ? (
                      <button
                        type="button"
                        onClick={() => toggleCategory(cat.id)}
                        className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-600 transition-colors cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5" /> ADD
                      </button>
                    ) : (
                      <div className="flex items-center rounded-lg border border-emerald-300 bg-white px-1 py-0.5 shadow-xs">
                        <button
                          type="button"
                          onClick={() => updateItemWeight(cat.id, quantity - 1)}
                          className="grid h-7 w-7 place-items-center rounded-md text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                          aria-label="Decrease weight"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="text-xs font-extrabold text-emerald-950 px-2">{quantity} kg</span>
                        <button
                          type="button"
                          onClick={() => updateItemWeight(cat.id, quantity + 1)}
                          className="grid h-7 w-7 place-items-center rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors cursor-pointer"
                          aria-label="Increase weight"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
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
              className="w-full sm:w-auto bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold text-xs px-6 py-3 rounded-xl shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95"
            >
              Continue to Location & Time
              <ArrowRight className="w-4 h-4 text-emerald-400" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: PICKUP LOCATION & SCHEDULE */}
      {step === 2 && (
        <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-200 space-y-6 animate-scale-in">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">Pickup Location & Schedule</h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">Verify your pickup address and choose timing</p>
            </div>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1 font-semibold cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </button>
          </div>

          {/* PICKUP LOCATION DISPLAY / SELECTOR */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Pickup Address:
              </label>
              <button
                type="button"
                onClick={() => setLocationSearchModalOpen(true)}
                className="text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200/80 cursor-pointer"
              >
                {area ? 'Change Location' : 'Select Location'}
              </button>
            </div>

            {area && geofenceResult?.serviceable ? (
              <div className="bg-emerald-50/50 border border-emerald-200/80 p-3.5 rounded-xl space-y-1.5">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span className="text-sm font-bold text-slate-900">{area}</span>
                </div>
                <p className="text-xs font-medium text-slate-600 pl-6 leading-relaxed">
                  {fullAddress || `${area}, Bengaluru`}
                </p>
                <div className="mt-1 pt-1.5 border-t border-emerald-200/60 flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span>Verified Service Zone in Bengaluru</span>
                </div>
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl text-center space-y-3">
                <div className="flex justify-center text-amber-600">
                  <MapPin className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-amber-950">No Pickup Location Selected</h3>
                  <p className="text-[11px] text-amber-800 font-medium mt-0.5">
                    Please select your doorstep pickup area in Bengaluru before proceeding.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setLocationSearchModalOpen(true)}
                  className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-4 py-2.5 rounded-lg shadow-xs cursor-pointer transition-all inline-flex items-center gap-2"
                >
                  <Search className="h-3.5 w-3.5" />
                  Select Pickup Location
                </button>
              </div>
            )}
          </div>

          {/* GOOGLE MAP DISPLAY FOR PICKUP LOCATION */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Map Pin Location:
              </label>
              <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                {lat.toFixed(4)}, {lng.toFixed(4)}
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
              className="h-56 sm:h-64 w-full rounded-xl overflow-hidden shadow-xs border border-slate-200"
            />
            <p className="text-[10px] text-slate-500 font-medium flex items-center gap-1">
              📍 Drag marker or tap anywhere on map to fine-tune your doorstep pickup pin
            </p>
          </div>

          {/* DISPATCH MODE SELECTOR (ASAP vs SCHEDULED) */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Pickup Speed & Timing:</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div
                onClick={() => setPickupType('ASAP')}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  pickupType === 'ASAP'
                    ? 'border-emerald-500 bg-emerald-50/60 shadow-sm ring-1 ring-emerald-500/30'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-emerald-600" />
                  <span className="font-bold text-slate-900 text-xs">ASAP Pickup (20–30 Mins)</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed font-normal">
                  Nearest available agent assigned immediately for doorstep collection.
                </p>
              </div>

              <div
                onClick={() => setPickupType('SCHEDULED')}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  pickupType === 'SCHEDULED'
                    ? 'border-emerald-500 bg-emerald-50/60 shadow-sm ring-1 ring-emerald-500/30'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="w-4 h-4 text-indigo-600" />
                  <span className="font-bold text-slate-900 text-xs">Schedule for Later</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed font-normal">Select a specific date and 1-hour window for pickup.</p>
              </div>
            </div>
          </div>

          {/* SCHEDULED DATE & SLOT SELECTOR */}
          {pickupType === 'SCHEDULED' && (
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-3.5 animate-scale-in">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">1. Select Pickup Date:</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {availableDates.map((d, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedDateIdx(idx)}
                      className={`p-2.5 rounded-lg border text-center transition-all cursor-pointer ${
                        selectedDateIdx === idx
                          ? 'bg-slate-900 text-white border-slate-900 font-bold'
                          : 'bg-white text-slate-800 border-slate-200 font-medium hover:bg-slate-100'
                      }`}
                    >
                      <span className="block text-xs">{d.dayLabel}</span>
                      <span className="block text-[10px] opacity-80 mt-0.5">{d.dateStr}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">2. Select Time Slot:</label>
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
                        className={`p-2.5 rounded-lg border text-left text-xs font-medium transition-all flex items-center justify-between cursor-pointer ${
                          isPast
                            ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed line-through'
                            : isSelected
                            ? 'bg-emerald-600 text-white border-emerald-600 font-bold'
                            : 'bg-white text-slate-800 border-slate-200 hover:border-emerald-400'
                        }`}
                      >
                        <span>{slot.label}</span>
                        {isPast ? (
                          <span className="text-[10px] text-rose-500 font-normal no-underline">Expired</span>
                        ) : isSelected ? (
                          <span className="text-[10px] bg-emerald-700 text-white px-1.5 py-0.5 rounded">Selected</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* PICKUP INSTRUCTIONS */}
          <div className="space-y-1 pt-2 border-t border-slate-100">
            <label className="block text-xs font-bold text-slate-700">
              Pickup Instructions for Agent (Optional):
            </label>
            <input
              type="text"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Ring main gate bell, call on arrival..."
              className="w-full bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 text-xs font-medium outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 placeholder:text-slate-400"
            />
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            <button
              onClick={() => setStep(1)}
              className="text-slate-600 font-bold text-xs px-3 py-2 hover:bg-slate-100 rounded-lg cursor-pointer"
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
              className="bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold text-xs px-6 py-3 rounded-xl shadow-sm flex items-center gap-2 cursor-pointer transition-all active:scale-95"
            >
              View Summary & Pay
              <ArrowRight className="w-4 h-4 text-emerald-400" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: BOOKING SUMMARY & PAYMENT VERIFICATION */}
      {step === 3 && (
        <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-200 space-y-6 animate-scale-in">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">Booking Summary</h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">Review details and complete payment to confirm pickup</p>
            </div>
            <button
              onClick={() => setStep(2)}
              className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1 font-semibold cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Edit Details
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* PICKUP LOCATION & SCHEDULE SUMMARY */}
            <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 space-y-2.5">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Pickup & Schedule</h3>
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-xs text-slate-900">{area}</p>
                  <p className="text-[11px] text-slate-600 font-medium leading-relaxed">{fullAddress || `${area}, Bengaluru`}</p>
                  <p className="text-[10px] text-slate-500 mt-1">Contact: {name || 'Customer'} ({phone || 'Logged In'})</p>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">Schedule:</span>
                <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60 text-[11px]">
                  {pickupType === 'ASAP' ? '⚡ 20–30 Mins ASAP' : formattedScheduledSlot}
                </span>
              </div>

              {instructions && (
                <div className="pt-2 border-t border-slate-200/80 text-xs">
                  <span className="text-slate-500 block text-[11px] font-medium">Instructions:</span>
                  <span className="text-slate-800 font-normal italic">"{instructions}"</span>
                </div>
              )}
            </div>

            {/* SELECTED WASTE CATEGORIES SUMMARY */}
            <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 space-y-2.5">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Selected Waste Items</h3>
              <div className="space-y-1.5 text-xs">
                {selectedItems.map((item) => {
                  const cat = categories.find((c) => c.id === item.categoryId);
                  return (
                    <div key={item.categoryId} className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200/80">
                      <div>
                        <span className="font-bold text-slate-900 text-xs block">{cat?.name}</span>
                        <span className="text-[10px] text-slate-500 font-medium">Rate: ₹{cat?.pricePerKg}/kg</span>
                      </div>
                      <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[11px]">
                        {item.estimatedWeight} kg (Est)
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* PROMO COUPON BANNER */}
          <div className="bg-emerald-50/60 p-3.5 rounded-xl border border-emerald-200/80 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Ticket className="w-4 h-4 text-emerald-600 shrink-0" />
              <div>
                <span className="font-bold text-xs text-slate-900 block">Promo Coupon Applied</span>
                <span className="text-[11px] text-emerald-700 font-medium">WELCOME50 — ₹50 discount on pickup fee</span>
              </div>
            </div>
            <span className="text-[10px] font-bold bg-emerald-600 text-white px-2.5 py-1 rounded-md">
              APPLIED
            </span>
          </div>

          {/* FINANCIAL SUMMARY BOX */}
          <div className="bg-slate-900 text-white p-4 sm:p-5 rounded-xl space-y-2.5 shadow-sm border border-slate-800">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2">
              Payment Summary
            </h3>
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>Pickup Value:</span>
              <span className="text-emerald-300 font-semibold">₹{estimate.totalWasteItemsValue.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>Pickup Service Charge:</span>
              <span>₹{estimate.baseCharge.toFixed(2)}</span>
            </div>
            {estimate.discount > 0 && (
              <div className="flex items-center justify-between text-xs text-emerald-400 font-medium">
                <span>Coupon Discount (WELCOME50):</span>
                <span>- ₹{estimate.discount.toFixed(2)}</span>
              </div>
            )}
            <div className="pt-2.5 border-t border-slate-800 flex items-center justify-between text-sm font-bold">
              <span>Total Amount Payable:</span>
              <span className="text-lg text-emerald-400 font-extrabold">₹{estimate.netAmount.toFixed(2)}</span>
            </div>
          </div>

          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
            <span className="text-slate-600 font-medium">Payment Method:</span>
            <span className="font-bold text-slate-900 flex items-center gap-1.5">
              <CreditCard className="w-4 h-4 text-emerald-600" />
              Razorpay Checkout (UPI / Cards / NetBanking)
            </span>
          </div>

          {/* ACTION BUTTONS */}
          <div className="flex flex-col gap-2 pt-2">
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={() => setStep(2)}
                className="text-slate-600 font-bold text-xs px-3 py-2 hover:bg-slate-100 rounded-lg shrink-0 cursor-pointer"
              >
                Back
              </button>
              <button
                disabled={loading}
                onClick={handleConfirmOrder}
                className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-300 text-slate-950 font-bold text-sm py-3.5 rounded-xl shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95"
              >
                {loading ? (
                  <>
                    <Clock className="w-4 h-4 animate-spin text-slate-950" />
                    Opening secure payment...
                  </>
                ) : (
                  <>
                    Pay ₹{estimate.netAmount.toFixed(2)} & Confirm Pickup
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>

            <p className="text-[10px] text-center text-slate-500 font-medium mt-1">
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
