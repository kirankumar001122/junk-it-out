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
  CheckCircle2,
  Truck,
  Search,
  Check,
  Sparkles,
  ShieldCheck,
  CreditCard,
  Plus,
  Minus,
  Ticket,
  X,
} from 'lucide-react';
import CustomerOtpLogin from '@/components/CustomerOtpLogin';
import WeightQuantityInput from '@/components/WeightQuantityInput';
import LocationSearchModal from '@/components/LocationSearchModal';
import InteractiveMap, { loadGoogleMaps } from '@/components/InteractiveMap';
import { readPickupCart } from '@/lib/pickupCart';
import { getSelectedLocation, setSelectedLocation, LOCATION_CHANGE_EVENT } from '@/lib/selectedLocation';
import { loadRazorpayScript } from '@/lib/razorpayClient';
import { isCustomerWasteCategory, getMaterialImageUrl, subscribeWasteCategoriesChanged } from '@/lib/customerWasteCategories';
import { calculateBookingTotalPayable, calculatePickupSummary, PICKUP_SERVICE_CHARGE } from '@/lib/pricing';

// Small category images used in the booking cards.
const CATEGORY_IMAGES: Record<string, string> = {
  'E-Waste': '/categories/e-waste.webp',
  'Household Dry Waste': '/categories/household-waste.webp',
  'Paper & Cardboard': '/categories/paper-carboard.jpg',
  'Plastic Waste': '/categories/plastic-waste.jpg?v=2',
};

function resolveBookingCardImage(cat: any): string {
  const custom = typeof cat?.imageUrl === 'string' ? cat.imageUrl.trim() : '';
  if (custom && !custom.startsWith('/categories/')) {
    return custom;
  }
  return CATEGORY_IMAGES[cat?.name?.trim()] || custom || getMaterialImageUrl(cat);
}

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

const checkoutFlowIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successOrder, setSuccessOrder] = useState<any>(null);
  const [pendingOrder, setPendingOrder] = useState<any | null>(null);
  const [bookingStatusText, setBookingStatusText] = useState('Opening secure payment...');

  // Idempotency Protection Ref
  const idempotencyKeyRef = useRef<string>('');
  const lastPayloadSignatureRef = useRef<string>('');
  const checkoutFlowIdRef = useRef<string>('');
  const isRetryingRef = useRef(false);
  const isSubmittingRef = useRef(false);

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

    fetch('/api/waste-categories?customer=true', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data)) {
          const availableCategories = data.data.filter(isCustomerWasteCategory);
          setCategories(availableCategories);

          const params = new URLSearchParams(window.location.search);
          const requestedCategory = params.get('category');
          const cartItems = params.get('cart') ? readPickupCart() : [];

          const selectedCategory = availableCategories.find(
            (c: any) => c.id === requestedCategory || c.name === requestedCategory
          );

          const defaultServiceCategory =
            availableCategories.find((c: any) => c.name === 'E-Waste') ||
            availableCategories[0];

          if (cartItems.length > 0) {
            const validItems = cartItems
              .filter((item) =>
                availableCategories.some((c: any) => c.id === item.categoryId)
              )
              .map((item) => ({
                categoryId: item.categoryId,
                estimatedWeight: Math.max(1, item.quantity || 1),
              }));


            if (validItems.length > 0) {
              setSelectedItems(validItems);
            } else if (selectedCategory) {
              setSelectedItems([
                { categoryId: selectedCategory.id, estimatedWeight: 1 },
              ]);
            } else if (defaultServiceCategory) {
              setSelectedItems([
                { categoryId: defaultServiceCategory.id, estimatedWeight: 1 },
              ]);
            }
          } else if (selectedCategory) {
            setSelectedItems([
              { categoryId: selectedCategory.id, estimatedWeight: 1 },
            ]);
          } else if (requestedCategory) {
            const allDbCategory = data.data.find(
              (c: any) => c.id === requestedCategory || c.name === requestedCategory
            );
            if (defaultServiceCategory) {
              setSelectedItems([
                { categoryId: defaultServiceCategory.id, estimatedWeight: 1 },
              ]);
            }
          } else if (defaultServiceCategory) {
            setSelectedItems([
              { categoryId: defaultServiceCategory.id, estimatedWeight: 1 },
            ]);
          }
        }
      })
      .catch(() => {});

    const handleLocUpdate = () => {
      loadLocationFromStore();
    };

    window.addEventListener('jio_auth_change', checkAuth);
    window.addEventListener(LOCATION_CHANGE_EVENT, handleLocUpdate);
    const unsubscribeWasteCategories = subscribeWasteCategoriesChanged(() => {
      fetch('/api/waste-categories?customer=true', { cache: 'no-store' })
        .then((res) => res.json())
        .then((data) => {
          if (data?.success && Array.isArray(data.data)) {
            setCategories(data.data.filter(isCustomerWasteCategory));
          }
        })
        .catch(() => {});
    });

    return () => {
      window.removeEventListener('jio_auth_change', checkAuth);
      window.removeEventListener(LOCATION_CHANGE_EVENT, handleLocUpdate);
      unsubscribeWasteCategories();
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
    idempotencyKeyRef.current = '';
    lastPayloadSignatureRef.current = '';
    setPendingOrder(null);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('jio_pending_order');
    }
    const exists = selectedItems.find((i) => i.categoryId === catId);
    if (exists) {
      if (selectedItems.length === 1) return; // Maintain at least 1 selected category
      setSelectedItems(selectedItems.filter((i) => i.categoryId !== catId));
    } else {
      setSelectedItems([...selectedItems, { categoryId: catId, estimatedWeight: 1 }]);
    }
  };

  const updateItemWeight = (catId: string, weight: number) => {
    idempotencyKeyRef.current = '';
    lastPayloadSignatureRef.current = '';
    setPendingOrder(null);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('jio_pending_order');
    }
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
    const summary = calculatePickupSummary(
      selectedItems
        .map((item) => {
          const cat = categories.find((c) => c.id === item.categoryId);
          if (!cat) return null;
          return {
            categoryId: cat.id,
            categoryName: cat.name,
            type: cat.type,
            pricePerKg: Number(cat.pricePerKg),
            weightKg: Number(item.estimatedWeight),
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item)),
      PICKUP_SERVICE_CHARGE
    );

    return {
      items: summary.items,
      materialCount: summary.materialCount,
      totalWeightKg: summary.totalWeightKg,
      totalWasteItemsValue: summary.pickupValue,
      baseCharge: summary.serviceCharge,
      totalWasteCharge: 0,
      subtotal: summary.totalAmountPayable,
      discountAmount: 0,
      netAmount: summary.totalAmountPayable,
      direction: 'CUSTOMER_PAYS' as const,
    };
  };

  const estimate = calculateEstimate();

  // Selected date object & time slot label
  const curDateObj = availableDates[selectedDateIdx] || availableDates[0];
  const curSlotObj = TIME_SLOTS.find((s) => s.id === selectedSlotId) || TIME_SLOTS[0];
  const formattedScheduledSlot = `${curDateObj.dayLabel} (${curDateObj.dateStr}), ${curSlotObj.label}`;

  // Preload Razorpay checkout SDK as soon as booking page mounts to ensure zero-delay checkout opening
  // Also recover pending unpaid order from sessionStorage if customer dismissed or refreshed
  useEffect(() => {
    loadRazorpayScript().catch(() => {});
    try {
      if (typeof window !== 'undefined') {
        const raw = sessionStorage.getItem('jio_pending_order');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.id && parsed?.orderNumber) {
            setPendingOrder(parsed);
          }
        }
      }
    } catch {}
  }, []);

  // Proactively warm up / ensure Razorpay SDK is loaded whenever customer reaches address (step 2) or checkout (step 3)
  useEffect(() => {
    if (step >= 2) {
      loadRazorpayScript().catch(() => {});
    }
  }, [step]);

  const handleStartFresh = () => {
    setPendingOrder(null);
    setErrorMsg('');
    idempotencyKeyRef.current = '';
    lastPayloadSignatureRef.current = '';
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('jio_pending_order');
    }
    setStep(1);
  };

  // Safe JSON parsing helper to guard against unexpected non-JSON (e.g. 500/502/504 HTML) responses
  const safeParseJsonResponse = async (res: Response): Promise<{ ok: boolean; status: number; data: any; parseError?: string }> => {
    try {
      const text = await res.text();
      if (!text || !text.trim()) {
        return { ok: res.ok, status: res.status, data: null, parseError: "Empty response from server" };
      }
      const json = JSON.parse(text);
      return { ok: res.ok, status: res.status, data: json };
    } catch (parseErr: any) {
      return {
        ok: false,
        status: res.status,
        data: null,
        parseError: parseErr instanceof Error ? parseErr.message : "Invalid JSON",
      };
    }
  };

  const getFriendlyApiErrorMessage = (parsed: { ok: boolean; status: number; data: any; parseError?: string }, defaultMsg: string): string => {
    const data = parsed.data;
    if (data) {
      const serverMsg = data.error?.message || data.message;
      if (serverMsg && typeof serverMsg === "string") return serverMsg;
    }
    if (parsed.status === 504) {
      return "The booking request timed out on the server. Please check your connection or retry in a moment.";
    }
    if (parsed.status === 502 || parsed.status === 503) {
      return `The Junk It Out service is momentarily unavailable (HTTP ${parsed.status}). Please try again shortly.`;
    }
    if (parsed.status === 401) {
      return "Your login session expired. Please verify your mobile number and retry.";
    }
    if (parsed.status === 403) {
      return "You are not authorized to complete this booking.";
    }
    if (parsed.status >= 500) {
      return `A server error occurred (HTTP ${parsed.status}). Please try again or retry payment below.`;
    }
    return defaultMsg;
  };

  const savePendingOrderToStorage = (orderData: any, areaName: string, flowId: string) => {
    if (typeof window !== "undefined" && orderData?.id) {
      sessionStorage.setItem("jio_pending_order", JSON.stringify({
        id: orderData.id,
        orderNumber: orderData.orderNumber,
        finalAmount: orderData.finalAmount,
        area: orderData.address?.area || areaName,
        checkoutFlowId: flowId,
      }));
    }
  };

  // Safe retry payment for existing unpaid order (no duplicate order creation)
  const handleRetryPayment = async (orderToRetry?: any) => {
    const targetOrder = orderToRetry || pendingOrder;
    if (!targetOrder?.id) return;
    if (isRetryingRef.current || loading) return;
    isRetryingRef.current = true;
    const storedFlowId =
      typeof targetOrder.checkoutFlowId === "string" &&
      checkoutFlowIdPattern.test(targetOrder.checkoutFlowId)
        ? targetOrder.checkoutFlowId.toLowerCase()
        : null;
    const checkoutFlowId =
      storedFlowId || checkoutFlowIdRef.current || window.crypto.randomUUID();
    checkoutFlowIdRef.current = checkoutFlowId;
    targetOrder.checkoutFlowId = checkoutFlowId;
    setLoading(true);
    setBookingStatusText("Re-connecting to secure payment...");
    setErrorMsg("");

    const scriptPromise = loadRazorpayScript();

    try {
      let payRes: Response;
      try {
        payRes = await fetch("/api/payments/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Checkout-Flow-ID": checkoutFlowId,
          },
          body: JSON.stringify({ orderId: targetOrder.id }),
        });
      } catch (fetchErr: any) {
        console.error("[PAYMENT_RETRY_FETCH_FAILED]", fetchErr);
        setLoading(false);
        isRetryingRef.current = false;
        setErrorMsg("Unable to connect to payment server. Please check your internet connection.");
        return;
      }

      const payParsed = await safeParseJsonResponse(payRes);
      const payData = payParsed.data;

      if (!payRes.ok || !payData?.success) {
        setLoading(false);
        isRetryingRef.current = false;
        const msg = getFriendlyApiErrorMessage(payParsed, "Unable to resume payment for this order.");
        setErrorMsg(msg);
        return;
      }

      if (payData.alreadyPaid) {
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("jio_pending_order");
        }
        setPendingOrder(null);
        setLoading(false);
        isRetryingRef.current = false;
        setSuccessOrder({
          ...targetOrder,
          paymentStatus: "CAPTURED",
          status: "BOOKING_RECEIVED",
        });
        return;
      }

      const razorpayConfig = payData.data;
      if (!razorpayConfig?.key || !razorpayConfig?.gatewayOrderId) {
        setLoading(false);
        isRetryingRef.current = false;
        setErrorMsg("Payment gateway configuration is incomplete. Please contact support or try again later.");
        return;
      }

      const scriptLoaded = await scriptPromise;
      if (!scriptLoaded || typeof (window as any).Razorpay !== "function") {
        setLoading(false);
        isRetryingRef.current = false;
        setErrorMsg("Failed to load payment checkout SDK. Please disable ad-blockers or check your connection and retry.");
        return;
      }

      const options = {
        key: razorpayConfig.key,
        amount: Math.round(Number(razorpayConfig.amount) * 100),
        currency: razorpayConfig.currency || "INR",
        name: "Junk It Out",
        description: razorpayConfig.description || `Pickup Order #${targetOrder.orderNumber}`,
        image: typeof window !== "undefined" ? `${window.location.origin}/logo.png` : "/logo.png",
        order_id: razorpayConfig.gatewayOrderId,
        handler: async function (response: any) {
          setLoading(true);
          try {
            const verifyRes = await fetch("/api/payments/verify", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Checkout-Flow-ID": checkoutFlowId,
              },
              body: JSON.stringify({
                orderId: targetOrder.id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });

            const verifyParsed = await safeParseJsonResponse(verifyRes);
            const verifyData = verifyParsed.data;
            setLoading(false);
            isRetryingRef.current = false;

            if (verifyRes.ok && verifyData?.success) {
              idempotencyKeyRef.current = "";
              lastPayloadSignatureRef.current = "";
              setPendingOrder(null);
              if (typeof window !== "undefined") {
                sessionStorage.removeItem("jio_pending_order");
              }
              setSuccessOrder({
                ...targetOrder,
                paymentStatus: "CAPTURED",
                status: "BOOKING_RECEIVED",
              });
            } else {
              const verifyMsg = getFriendlyApiErrorMessage(verifyParsed, "Payment verification failed server-side. Your booking has not been confirmed.");
              setErrorMsg(verifyMsg);
            }
          } catch (verifyErr: any) {
            console.error("[RETRY_VERIFY_NETWORK_ERROR]", verifyErr);
            setLoading(false);
            isRetryingRef.current = false;
            setErrorMsg("Network error verifying payment. Please check your order in My Pickups.");
          }
        },
        prefill: {
          name: name || "Customer",
          contact: phone || "",
        },
        theme: {
          color: "#059669",
        },
        modal: {
          ondismiss: function () {
            setLoading(false);
            isSubmittingRef.current = false;
            isRetryingRef.current = false;
            setErrorMsg(`Checkout was cancelled or dismissed. Order #${targetOrder.orderNumber} is saved. You can retry payment whenever ready.`);
          },
        },
      };

      try {
        const rzp = new (window as any).Razorpay(options);
        rzp.on("payment.failed", function (response: any) {
          setLoading(false);
          isSubmittingRef.current = false;
          isRetryingRef.current = false;
          const reason = response?.error?.description || response?.error?.reason || "Transaction declined.";
          setErrorMsg(`Payment failed: ${reason} Order #${targetOrder.orderNumber} is saved. Please retry payment whenever ready.`);
        });

        rzp.open();
      } catch (sdkErr: any) {
        console.error("[RETRY_RAZORPAY_SDK_ERROR]", sdkErr);
        setLoading(false);
        isSubmittingRef.current = false;
        isRetryingRef.current = false;
        const sdkMsg = sdkErr instanceof Error ? sdkErr.message : "Unable to launch checkout.";
        setErrorMsg(`Order #${targetOrder.orderNumber} is saved. ${sdkMsg} Please retry payment.`);
      }
    } catch (err: any) {
      console.error("[PAYMENT_RETRY_MASTER_ERROR]", err);
      setLoading(false);
      isRetryingRef.current = false;
      const isNetworkErr = err instanceof TypeError && /fetch|network/i.test(err.message || "");
      setErrorMsg(
        isNetworkErr
          ? "Unable to connect to payment server. Please check your internet connection and try again."
          : (err instanceof Error ? err.message : "Failed to retry payment. Please try again.")
      );
    }
  };

  // Master Customer Booking & Razorpay Payment Handler
  const handleConfirmOrder = async () => {
    if (isSubmittingRef.current || loading) return;
    if (!isCustomer) {
      setLoginOpen(true);
      setErrorMsg("Authentication is required. Please log in with mobile OTP to complete your booking.");
      return;
    }

    if (!area || !geofenceResult?.serviceable) {
      setErrorMsg(geofenceResult?.message || "Please select a valid pickup location in Bengaluru before confirming.");
      return;
    }

    if (selectedItems.length === 0) {
      setErrorMsg("Please select at least one waste category.");
      return;
    }

    // If an unpaid order is already pending for this booking session, retry payment safely without creating a duplicate order
    if (pendingOrder?.id) {
      await handleRetryPayment(pendingOrder);
      return;
    }

    const bookingPayload = {
      phone,
      name,
      address: {
        label: addressLabel || "Home",
        houseNo: houseNo || area || "Pickup Location",
        building: building || undefined,
        street: street || area || "Main Road",
        area,
        landmark: landmark || undefined,
        pincode: pincode || "560001",
        lat,
        lng,
        googlePlaceId: placeId,
      },
      items: selectedItems,
      pickupType,
      scheduledSlot: pickupType === "SCHEDULED" ? formattedScheduledSlot : null,
      photos: [], // Photo upload removed per user requirement
      notes: instructions,
      financialDirection: "CUSTOMER_PAYS" as const,
    };

    const currentPayloadSignature = JSON.stringify({
      phone: phone.trim(),
      name: name.trim(),
      area: area.trim(),
      houseNo: (houseNo || area || "Pickup Location").trim(),
      street: (street || area || "Main Road").trim(),
      pincode: (pincode || "560001").trim(),
      lat,
      lng,
      items: selectedItems
        .map((i) => ({ categoryId: i.categoryId, weight: i.estimatedWeight }))
        .sort((a, b) => a.categoryId.localeCompare(b.categoryId)),
      pickupType,
      scheduledSlot: pickupType === "SCHEDULED" ? formattedScheduledSlot : null,
      notes: instructions.trim(),
    });

    // Ensure session-stable idempotency key:
    // If the booking payload was edited since last submission, or no key was assigned yet, generate a new key.
    // If the exact same booking is retried, preserve the key so duplicate orders are prevented.
    if (!idempotencyKeyRef.current || lastPayloadSignatureRef.current !== currentPayloadSignature) {
      idempotencyKeyRef.current = `booking-${phone.replace(/[\s+]/g, "")}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      lastPayloadSignatureRef.current = currentPayloadSignature;
      checkoutFlowIdRef.current = window.crypto.randomUUID();
    }
    const checkoutFlowId = checkoutFlowIdRef.current || window.crypto.randomUUID();
    checkoutFlowIdRef.current = checkoutFlowId;

    isSubmittingRef.current = true;
    setLoading(true);
    setErrorMsg("");
    setBookingStatusText("Securing your booking slot...");

    // Preload / load SDK in parallel with API calls
    const scriptPromise = loadRazorpayScript();
    let createdOrderData: any = null;

    try {
      // 1. Create order on server (CUSTOMER_PAYS)
      let res: Response;
      try {
        res = await fetch("/api/orders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKeyRef.current,
            "X-Checkout-Flow-ID": checkoutFlowId,
          },
          body: JSON.stringify(bookingPayload),
        });
      } catch (fetchErr: any) {
        console.error("[BOOKING_FETCH_FAILED]", fetchErr);
        setLoading(false);
        isSubmittingRef.current = false;
        setErrorMsg("Unable to connect to Junk It Out. Please check your internet connection and try again.");
        return;
      }

      const parsed = await safeParseJsonResponse(res);
      const data = parsed.data;

      if (!res.ok || !data?.success) {
        const errorCode = data?.error?.code || data?.code;
        const errorMsg = getFriendlyApiErrorMessage(parsed, "Failed to place order. Please verify your details and try again.");
        if (res.status === 409 || errorCode === "IDEMPOTENCY_CONFLICT") {
          idempotencyKeyRef.current = "";
          lastPayloadSignatureRef.current = "";
        }
        setLoading(false);
        isSubmittingRef.current = false;
        setErrorMsg(errorMsg);
        return;
      }

      const orderData = data.data;
      if (!orderData || !orderData.id) {
        setLoading(false);
        isSubmittingRef.current = false;
        setErrorMsg("Order was created, but response was invalid. Please check My Pickups or refresh.");
        return;
      }

      createdOrderData = orderData;
      orderData.checkoutFlowId = checkoutFlowId;

      // If order does not require customer payment (e.g. JUNKITOUT_PAYS scrap payout or ZERO_BALANCE), confirm directly
      if (orderData.financialDirection !== "CUSTOMER_PAYS" || Number(orderData.finalAmount) === 0) {
        idempotencyKeyRef.current = "";
        lastPayloadSignatureRef.current = "";
        setPendingOrder(null);
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("jio_pending_order");
        }
        setLoading(false);
        isSubmittingRef.current = false;
        setSuccessOrder({
          ...orderData,
          paymentStatus: "NOT_APPLICABLE",
          status: "BOOKING_RECEIVED",
        });
        return;
      }

      // 2. Check if paymentConfig was already provided in single round-trip by /api/orders
      let razorpayConfig = orderData.paymentConfig;

      if (!razorpayConfig) {
        setBookingStatusText("Connecting to secure payment...");
        let payRes: Response;
        try {
          payRes = await fetch("/api/payments/create", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Checkout-Flow-ID": checkoutFlowId,
            },
            body: JSON.stringify({ orderId: orderData.id }),
          });
        } catch (payFetchErr: any) {
          console.error("[PAYMENT_CREATE_FETCH_FAILED]", payFetchErr);
          setPendingOrder(orderData);
          savePendingOrderToStorage(orderData, area, checkoutFlowId);
          setLoading(false);
          isSubmittingRef.current = false;
          setErrorMsg(`Order #${orderData.orderNumber} is saved. Network error reaching payment gateway. Please retry payment below.`);
          return;
        }

        const payParsed = await safeParseJsonResponse(payRes);
        const payData = payParsed.data;

        if (!payRes.ok || !payData?.success) {
          setPendingOrder(orderData);
          savePendingOrderToStorage(orderData, area, checkoutFlowId);
          setLoading(false);
          isSubmittingRef.current = false;
          const payMsg = getFriendlyApiErrorMessage(payParsed, "Failed to initialize payment gateway.");
          setErrorMsg(`Order #${orderData.orderNumber} is saved. ${payMsg} You can retry payment below.`);
          return;
        }

        if (payData.alreadyPaid) {
          idempotencyKeyRef.current = "";
          lastPayloadSignatureRef.current = "";
          setPendingOrder(null);
          if (typeof window !== "undefined") {
            sessionStorage.removeItem("jio_pending_order");
          }
          setLoading(false);
          isSubmittingRef.current = false;
          setSuccessOrder({
            ...orderData,
            paymentStatus: "CAPTURED",
            status: "BOOKING_RECEIVED",
          });
          return;
        }

        razorpayConfig = payData.data;
      }

      // Validate payment configuration
      if (!razorpayConfig?.key || !razorpayConfig?.gatewayOrderId) {
        console.error("[PAYMENT_CONFIG_INCOMPLETE]", razorpayConfig);
        setPendingOrder(orderData);
        savePendingOrderToStorage(orderData, area, checkoutFlowId);
        setLoading(false);
        isSubmittingRef.current = false;
        setErrorMsg(`Order #${orderData.orderNumber} is saved, but payment gateway configuration is incomplete. Please retry payment below.`);
        return;
      }

      setBookingStatusText("Opening Razorpay checkout...");
      const scriptLoaded = await scriptPromise;
      if (!scriptLoaded || typeof (window as any).Razorpay !== "function") {
        console.warn("[RAZORPAY_SCRIPT_UNAVAILABLE]", { scriptLoaded, hasWindowRazorpay: typeof (window as any).Razorpay });
        setPendingOrder(orderData);
        savePendingOrderToStorage(orderData, area, checkoutFlowId);
        setLoading(false);
        isSubmittingRef.current = false;
        setErrorMsg(`Order #${orderData.orderNumber} is saved. Unable to load payment checkout (ad-blocker or connection issue). Please disable ad-blockers and retry payment below.`);
        return;
      }

      const options = {
        key: razorpayConfig.key,
        amount: Math.round(Number(razorpayConfig.amount) * 100),
        currency: razorpayConfig.currency || "INR",
        name: "Junk It Out",
        description: razorpayConfig.description || `Pickup Order #${orderData.orderNumber}`,
        image: typeof window !== "undefined" ? `${window.location.origin}/logo.png` : "/logo.png",
        order_id: razorpayConfig.gatewayOrderId,
        handler: async function (response: any) {
          setLoading(true);
          try {
            const verifyRes = await fetch("/api/payments/verify", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Checkout-Flow-ID": checkoutFlowId,
              },
              body: JSON.stringify({
                orderId: orderData.id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });

            const verifyParsed = await safeParseJsonResponse(verifyRes);
            const verifyData = verifyParsed.data;
            setLoading(false);

            if (verifyRes.ok && verifyData?.success) {
              idempotencyKeyRef.current = "";
              lastPayloadSignatureRef.current = "";
              setPendingOrder(null);
              if (typeof window !== "undefined") {
                sessionStorage.removeItem("jio_pending_order");
              }
              setSuccessOrder({
                ...orderData,
                paymentStatus: "CAPTURED",
                status: "BOOKING_RECEIVED",
              });
            } else {
              setPendingOrder(orderData);
              savePendingOrderToStorage(orderData, area, checkoutFlowId);
              const verifyMsg = getFriendlyApiErrorMessage(verifyParsed, "Payment verification failed server-side. Your booking has not been confirmed.");
              setErrorMsg(verifyMsg);
            }
          } catch (verifyErr: any) {
            console.error("[PAYMENT_VERIFY_NETWORK_ERROR]", verifyErr);
            setLoading(false);
            setPendingOrder(orderData);
            savePendingOrderToStorage(orderData, area, checkoutFlowId);
            setErrorMsg(`Order #${orderData.orderNumber} is saved. Network error verifying payment. Please check your order in My Pickups.`);
          }
        },
        prefill: {
          name: name || "Customer",
          contact: phone || "",
        },
        theme: {
          color: "#059669", // Emerald 600
        },
        modal: {
          ondismiss: function () {
            setLoading(false);
            setPendingOrder(orderData);
            savePendingOrderToStorage(orderData, area, checkoutFlowId);
            setErrorMsg(`Checkout was cancelled or dismissed. Order #${orderData.orderNumber} is saved. You can retry payment below or view it anytime.`);
          },
        },
      };

      try {
        const rzp = new (window as any).Razorpay(options);
        rzp.on("payment.failed", function (response: any) {
          setLoading(false);
          setPendingOrder(orderData);
          savePendingOrderToStorage(orderData, area, checkoutFlowId);
          const reason = response?.error?.description || response?.error?.reason || "Transaction declined.";
          setErrorMsg(`Payment failed: ${reason} Order #${orderData.orderNumber} is saved. Please retry payment below.`);
        });

        // Open Razorpay Checkout (BEFORE confirming booking)
        rzp.open();
      } catch (sdkInitErr: any) {
        console.error("[RAZORPAY_SDK_INIT_ERROR]", sdkInitErr);
        setPendingOrder(orderData);
        savePendingOrderToStorage(orderData, area, checkoutFlowId);
        setLoading(false);
        isSubmittingRef.current = false;
        const sdkMsg = sdkInitErr instanceof Error ? sdkInitErr.message : "Unable to launch checkout.";
        setErrorMsg(`Order #${orderData.orderNumber} is saved. ${sdkMsg} Please retry payment below.`);
      }
    } catch (err: any) {
      console.error("[BOOKING_MASTER_HANDLER_ERROR]", err);
      setLoading(false);
      isSubmittingRef.current = false;

      if (createdOrderData) {
        setPendingOrder(createdOrderData);
        savePendingOrderToStorage(createdOrderData, area, checkoutFlowId);
        const detailMsg = err instanceof Error ? err.message : "Payment setup encountered an issue.";
        setErrorMsg(`Order #${createdOrderData.orderNumber} is saved. ${detailMsg} You can retry payment below.`);
      } else {
        const isNetworkErr = err instanceof TypeError && /fetch|network/i.test(err.message || "");
        setErrorMsg(
          isNetworkErr
            ? "Unable to connect to Junk It Out. Please check your internet connection and try again."
            : (err instanceof Error ? err.message : "An unexpected error occurred while placing your booking. Please try again.")
        );
      }
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
    <div className="customer-page-cream">
    <div className="customer-page max-w-4xl">
      {/* 3-STEP PROGRESS HEADER */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full uppercase tracking-wider border border-emerald-200/80">
              Doorstep Pickup Booking
            </span>
            <h1 className="customer-title mt-2">Book your pickup</h1>
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
                  className="customer-progress-rail h-full transition-all duration-300 ease-out"
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
        <div role="alert" aria-live="assertive" className="mb-6 p-3.5 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl text-xs font-medium flex items-center gap-2.5 animate-scale-in">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* STEP 1: CATEGORY SELECTION ("What are we picking up?") */}
      {step === 1 && (
        <div className="customer-surface rounded-[1.75rem] p-5 sm:p-7 space-y-6 animate-scale-in">
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">What materials are you disposing?</h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Select one or more waste categories to schedule for doorstep collection.
            </p>
          </div>

          {/* Simple Clean Category Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {categories
              .map((cat) => {
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
                      className={`relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg border text-xs font-bold transition-colors ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-50'
                          : 'border-slate-200 bg-slate-50 group-hover:border-emerald-200'
                      }`}
                    >
                      <img
                        src={resolveBookingCardImage(cat)}
                        alt={cat.name}
                        loading="lazy"
                        decoding="async"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = '/categories/household-waste.webp';
                        }}
                        className="h-full w-full object-cover"
                      />
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
                        <WeightQuantityInput
                          value={quantity}
                          onChange={(val) => updateItemWeight(cat.id, val)}
                          categoryName={cat.name}
                          textClassName="text-xs font-extrabold text-emerald-950"
                        />
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

          {selectedItems.length > 0 && (
            <div className="rounded-2xl bg-slate-900 p-4 text-white space-y-2 border border-slate-800">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>Selected Materials ({estimate.materialCount}) · Est. Weight ({estimate.totalWeightKg} kg)</span>
                <span className="font-semibold text-emerald-300">Pickup Value: ₹{estimate.totalWasteItemsValue.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>Service Charge</span>
                <span>₹{estimate.baseCharge.toFixed(2)}</span>
              </div>
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-sm font-bold">
                <span>Total Amount Payable</span>
                <span className="text-emerald-400 font-extrabold">₹{estimate.netAmount.toFixed(2)}</span>
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-slate-100 flex justify-end">
            <button
              disabled={selectedItems.length === 0}
              onClick={() => {
                setErrorMsg('');
                setStep(2);
              }}
              className="btn-glossy-primary rounded-full w-full sm:w-auto text-xs font-bold px-7 py-3.5 shadow-md flex items-center justify-center gap-2 cursor-pointer"
            >
              Continue to Location & Time
              <ArrowRight className="w-4 h-4 text-emerald-200" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: PICKUP LOCATION & SCHEDULE */}
      {step === 2 && (
        <div className="customer-surface rounded-[1.75rem] p-5 sm:p-7 space-y-6 animate-scale-in">
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
        <div className="customer-surface rounded-[1.75rem] p-5 sm:p-7 space-y-6 animate-scale-in">
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
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Selected Waste Items</h3>
                <span className="text-[11px] font-bold text-slate-600">
                  {estimate.materialCount} {estimate.materialCount === 1 ? 'item' : 'items'} · {estimate.totalWeightKg} kg
                </span>
              </div>
              <div className="space-y-1.5 text-xs">
                {selectedItems.map((item) => {
                  const cat = categories.find((c) => c.id === item.categoryId);
                  const itemAmount = Math.round(((Number(cat?.pricePerKg || 0) * Number(item.estimatedWeight || 0)) + Number.EPSILON) * 100) / 100;
                  return (
                    <div key={item.categoryId} className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200/80">
                      <div>
                        <span className="font-bold text-slate-900 text-xs block">{cat?.name}</span>
                        <span className="text-[10px] text-slate-500 font-medium">
                          ₹{cat?.pricePerKg}/kg × {item.estimatedWeight} kg
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                          {item.estimatedWeight} kg
                        </span>
                        <span className="font-extrabold text-emerald-700 text-xs">
                          ₹{itemAmount.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* FINANCIAL SUMMARY BOX */}
          <div className="bg-slate-900 text-white p-4 sm:p-5 rounded-xl space-y-2.5 shadow-sm border border-slate-800">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2">
              Pickup Summary
            </h3>
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>Waste Types:</span>
              <span className="font-semibold text-white">{estimate.materialCount}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>Estimated Weight:</span>
              <span className="font-semibold text-white">{estimate.totalWeightKg} kg</span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>Pickup Value:</span>
              <span className="text-emerald-300 font-semibold">₹{estimate.totalWasteItemsValue.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>Service Charge:</span>
              <span className="font-semibold text-white">₹{estimate.baseCharge.toFixed(2)}</span>
            </div>
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

          {/* PENDING / FAILED PAYMENT RETRY BANNER */}
          {pendingOrder ? (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 sm:p-5 space-y-4 animate-scale-in">
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-amber-100 text-amber-700 rounded-xl shrink-0 mt-0.5 border border-amber-200">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[10px] uppercase tracking-wider text-amber-900 bg-amber-200/80 px-2 py-0.5 rounded font-mono">
                      Payment Action Required
                    </span>
                    <span className="font-mono text-xs font-bold text-slate-900">
                      Order #{pendingOrder.orderNumber}
                    </span>
                  </div>
                  <p className="text-xs text-amber-900 font-medium">
                    {errorMsg || 'Your pickup request was recorded, but payment was cancelled, dismissed, or could not be completed. Your order is safely preserved and waiting for payment.'}
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-amber-200 flex flex-col sm:flex-row items-center gap-2.5">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleRetryPayment(pendingOrder)}
                  className="w-full sm:flex-1 btn-glossy-primary rounded-full text-xs font-bold py-3.5 shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <Clock className="w-4 h-4 animate-spin text-white" />
                      {bookingStatusText || 'Opening secure payment...'}
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4" />
                      Retry Payment (₹{Number(pendingOrder.finalAmount || estimate.netAmount).toFixed(2)})
                    </>
                  )}
                </button>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Link
                    href={`/orders/${pendingOrder.id}`}
                    className="btn-glossy-secondary rounded-full flex-1 sm:flex-initial w-full sm:w-auto text-center font-bold text-xs px-5 py-3 border border-slate-300 shadow-xs"
                  >
                    View Order Details
                  </Link>
                  <button
                    type="button"
                    onClick={handleStartFresh}
                    className="rounded-full flex-1 sm:flex-initial w-full sm:w-auto text-center text-slate-600 hover:text-slate-900 font-semibold text-xs px-3.5 py-3 hover:bg-amber-100/60 transition-colors cursor-pointer"
                  >
                    Start Fresh
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* STANDARD ACTION BUTTONS */
            <div className="flex flex-col gap-2 pt-2">
              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={() => setStep(2)}
                  className="text-slate-600 font-bold text-xs px-4 py-2 hover:bg-slate-100 rounded-full shrink-0 cursor-pointer transition-colors"
                >
                  Back
                </button>
                <button
                  disabled={loading}
                  onClick={handleConfirmOrder}
                  className="btn-glossy-primary rounded-full w-full py-4 text-sm font-extrabold shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <Clock className="w-4 h-4 animate-spin text-white" />
                      {bookingStatusText || 'Opening secure payment...'}
                    </>
                  ) : (
                    <>
                      Pay ₹{estimate.netAmount.toFixed(2)} & Confirm Pickup
                      <ArrowRight className="w-4 h-4 text-emerald-200" />
                    </>
                  )}
                </button>
              </div>

              <p className="text-[10px] text-center text-slate-500 font-medium mt-1">
                🔒 Secure payment powered by Razorpay. Booking confirmed only after verified successful payment.
              </p>
            </div>
          )}
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
    </div>
  );
}
