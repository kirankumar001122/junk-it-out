'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  MapPin,
  Trash2,
  Camera,
  Clock,
  Calendar,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Ticket,
  ShieldCheck,
  CheckCircle2,
  Truck,
  Navigation,
  Search,
  Building,
  Home,
  Briefcase,
  Layers,
  FileText,
} from 'lucide-react';
import CustomerOtpLogin from '@/components/CustomerOtpLogin';
import LocationSearchModal from '@/components/LocationSearchModal';
import InteractiveMap from '@/components/InteractiveMap';
import { BENGALURU_ZONES } from '@/lib/geofence';
import { readPickupCart } from '@/lib/pickupCart';

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

  // Step 1: Location & Address
  const [area, setArea] = useState('Whitefield, ITPL & Kadugodi');
  const [fullAddress, setFullAddress] = useState('ITPL Main Road, Whitefield, Bengaluru - 560066');
  const [lat, setLat] = useState(12.9698);
  const [lng, setLng] = useState(77.7500);
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

  // Address Details & Labels (internal state for legacy payload preservation)
  const [addressLabel, setAddressLabel] = useState<'Home' | 'Work' | 'Other'>('Home');
  const [houseNo, setHouseNo] = useState('');
  const [building, setBuilding] = useState('');
  const [street, setStreet] = useState('');
  const [landmark, setLandmark] = useState('');
  const [city] = useState('Bengaluru');
  const [pincode, setPincode] = useState('');

  // Step 2: Waste Selection & Weight Quantity
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedItems, setSelectedItems] = useState<{ categoryId: string; estimatedWeight: number }[]>([]);

  // Step 3: Photos
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [showPhotoOptionsModal, setShowPhotoOptionsModal] = useState(false);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Step 4: Pickup Time & Instructions
  const [pickupType, setPickupType] = useState<'ASAP' | 'SCHEDULED'>('ASAP');
  const [instructions, setInstructions] = useState('Please call when outside the main gate.');

  // Date and Time Slot selection for Scheduled Pickup
  const [selectedDateIdx, setSelectedDateIdx] = useState(0); // 0 = Today, 1 = Tomorrow, etc.
  const [selectedSlotId, setSelectedSlotId] = useState('16-17');

  // Step 5: Summary & Confirmation
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

  // Fetch categories & authenticated user on mount
  useEffect(() => {
    checkAuth();

    fetch('/api/waste-categories')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setCategories(data.data);
          const params = new URLSearchParams(window.location.search);
          const requestedCategory = params.get('category');
          const cartItems = params.get('cart') ? readPickupCart() : [];
          const selectedCategory = data.data.find(
            (category: any) => category.id === requestedCategory || category.name === requestedCategory
          );
          const defaultServiceCategory = data.data.find((category: any) => category.type === 'WASTE_CHARGE');
          const category = selectedCategory || defaultServiceCategory;

          if (cartItems.length > 0) {
            const validItems = cartItems
              .filter((item) => data.data.some((category: any) => category.id === item.categoryId))
              .map((item) => ({ categoryId: item.categoryId, estimatedWeight: Math.max(1, item.quantity || 5) }));
            if (validItems.length > 0) setSelectedItems(validItems);
          } else if (category) {
            setSelectedItems([{ categoryId: category.id, estimatedWeight: 10 }]);
          }
        }
      })
      .catch(() => {});
    window.addEventListener('jio_auth_change', checkAuth);
    return () => {
      window.removeEventListener('jio_auth_change', checkAuth);
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
          message: data.data?.message || data.message || "Sorry, we don't currently serve this location.",
        };
        setGeofenceResult(result);
        setArea('Outside Active Service Zone');
        return result;
      }
    } catch (e) {
      console.error('Geofence check error:', e);
      const result = {
        serviceable: false,
        message: 'Unable to verify service area. Please check network connection.',
      };
      setGeofenceResult(result);
      return result;
    }
  };

  const reverseGeocode = async (targetLat: number, targetLng: number) => {
    const geocoder = window.google?.maps ? new window.google.maps.Geocoder() : null;
    if (!geocoder) return;
    try {
      const response = await geocoder.geocode({ location: { lat: targetLat, lng: targetLng } });
      const result = response.results?.[0];
      if (!result) return;
      setPlaceId(result.place_id || null);
      if (result.formatted_address) setFullAddress(result.formatted_address);
      const components = result.address_components || [];
      const valueFor = (type: string) => components.find((item: any) => item.types?.includes(type))?.long_name || '';
      const route = valueFor('route'); const locality = valueFor('sublocality_level_1') || valueFor('locality'); const postalCode = valueFor('postal_code');
      if (route) setStreet(route); if (locality) setArea(locality); if (postalCode) setPincode(postalCode);
    } catch { setLocationStatusMsg('Coordinates selected.'); }
  };

  // Initialize Google Maps Places & Geocoder Services for Map Search Input
  useEffect(() => {
    const checkGoogleMaps = () => {
      if (window.google?.maps?.places) {
        if (!autocompleteServiceRef.current) {
          autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
        }
        if (!geocoderRef.current) {
          geocoderRef.current = new window.google.maps.Geocoder();
        }
      } else {
        setTimeout(checkGoogleMaps, 300);
      }
    };
    checkGoogleMaps();
  }, []);

  const handleMapSearchInputChange = (val: string) => {
    setMapSearchQuery(val);
    if (!val || val.trim().length < 2) {
      setMapSearchPredictions([]);
      return;
    }

    if (!autocompleteServiceRef.current && window.google?.maps?.places) {
      autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
    }

    if (!autocompleteServiceRef.current) return;

    try {
      autocompleteServiceRef.current.getPlacePredictions(
        {
          input: val,
          componentRestrictions: { country: 'in' },
          locationBias: new window.google.maps.LatLngBounds(
            { lat: 12.734, lng: 77.379 },
            { lat: 13.203, lng: 77.978 }
          ),
        },
        (results: any[], status: any) => {
          if (status === window.google.maps.places.PlacesServiceStatus.OK && results) {
            setMapSearchPredictions(results);
          } else {
            setMapSearchPredictions([]);
          }
        }
      );
    } catch {
      setMapSearchPredictions([]);
    }
  };

  const handleSelectMapSearchPrediction = (prediction: any) => {
    if (!geocoderRef.current && window.google?.maps) {
      geocoderRef.current = new window.google.maps.Geocoder();
    }
    if (!geocoderRef.current) return;

    setSearchingMapLocation(true);
    setMapSearchPredictions([]);
    setMapSearchQuery(prediction.structured_formatting?.main_text || prediction.description);

    geocoderRef.current.geocode({ placeId: prediction.place_id }, async (results: any[], status: string) => {
      setSearchingMapLocation(false);
      if (status === 'OK' && results?.[0]?.geometry?.location) {
        const targetLat = results[0].geometry.location.lat();
        const targetLng = results[0].geometry.location.lng();
        const formattedAddress = results[0].formatted_address || prediction.description;

        const components = results[0].address_components || [];
        const valueFor = (type: string) => components.find((item: any) => item.types?.includes(type))?.long_name || '';
        const areaName = valueFor('sublocality_level_1') || valueFor('locality') || prediction.structured_formatting?.main_text || 'Bengaluru';
        const streetName = valueFor('route') || valueFor('neighborhood') || '';
        const postalCode = valueFor('postal_code') || '';

        setLat(targetLat);
        setLng(targetLng);
        setArea(areaName);
        setFullAddress(formattedAddress);
        if (streetName) setStreet(streetName);
        if (postalCode) setPincode(postalCode);
        if (prediction.place_id) setPlaceId(prediction.place_id);

        await runGeofenceCheck(targetLat, targetLng);
      }
    });
  };

  useEffect(() => {
    runGeofenceCheck(lat, lng);
  }, [lat, lng]);

  // Use Current Location via HTML5 Geolocation API
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatusMsg('Geolocation is not supported by your browser.');
      return;
    }

    setLocating(true);
    setLocationStatusMsg(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;
        setLat(userLat);
        setLng(userLng);

        await reverseGeocode(userLat, userLng);

        const geofence = await runGeofenceCheck(userLat, userLng);
        setLocating(false);

        if (geofence?.serviceable) {
          const zoneName = geofence.zone?.name || 'Bengaluru';
          setArea(zoneName);
          setLocationStatusMsg(`✓ GPS location (${userLat.toFixed(4)}, ${userLng.toFixed(4)}) verified inside ${zoneName}.`);
        } else {
          setArea('Outside Active Service Zone');
          setLocationStatusMsg(
            `✕ Location captured (${userLat.toFixed(4)}, ${userLng.toFixed(4)}) is outside active Junk It Out service boundaries.`
          );
        }
      },
      (err) => {
        setLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setLocationStatusMsg('Location permission was denied. Please select your location on the map or enter address manually.');
        } else {
          setLocationStatusMsg('Unable to determine your location. Please select your location on the map.');
        }
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  // Dedicated handler for Camera Capture input
  const handleCameraChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;

    setPhotoError(null);
    setErrorMsg('');

    if (photos.length + selectedFiles.length > 5) {
      setPhotoError('You can upload a maximum of 5 photos.');
      e.target.value = '';
      return;
    }

    const file = selectedFiles[0];
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const maxSize = 10 * 1024 * 1024; // 10MB limit
    const mime = file.type ? file.type.toLowerCase() : '';

    if (mime && !allowedTypes.includes(mime)) {
      setPhotoError(`Unsupported file format (${file.name}). Please capture or select a JPG, PNG, or WEBP photo.`);
      e.target.value = '';
      return;
    }
    if (file.size > maxSize) {
      setPhotoError(`Captured photo is too large. Maximum allowed size is 10MB.`);
      e.target.value = '';
      return;
    }

    setUploadingPhotos(true);

    try {
      const formData = new FormData();
      formData.append('files', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      setUploadingPhotos(false);

      if (data.success && data.urls && data.urls.length > 0) {
        setPhotos((prev) => [...prev, ...data.urls]);
        setPhotoError(null);
      } else {
        setPhotoError(data.message || 'Failed to upload captured photo. Please try again.');
      }
    } catch (err: any) {
      console.error('Camera upload error:', err);
      setUploadingPhotos(false);
      setPhotoError('Network error uploading camera photo. Please check your connection and retry.');
    }

    e.target.value = '';
  };

  // Dedicated handler for Gallery Multi-photo Upload input
  const handleGalleryChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;

    setPhotoError(null);
    setErrorMsg('');

    if (photos.length + selectedFiles.length > 5) {
      setPhotoError('You can upload a maximum of 5 photos.');
      e.target.value = '';
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const maxSize = 10 * 1024 * 1024; // 10MB limit

    for (const file of selectedFiles) {
      const mime = file.type ? file.type.toLowerCase() : '';
      if (mime && !allowedTypes.includes(mime)) {
        setPhotoError(`Unsupported file format (${file.name}). Please select JPG, PNG, or WEBP images.`);
        e.target.value = '';
        return;
      }
      if (file.size > maxSize) {
        setPhotoError(`File "${file.name}" is too large. Maximum allowed size is 10MB.`);
        e.target.value = '';
        return;
      }
    }

    setUploadingPhotos(true);

    try {
      const formData = new FormData();
      selectedFiles.forEach((file) => formData.append('files', file));

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      setUploadingPhotos(false);

      if (data.success && data.urls && data.urls.length > 0) {
        setPhotos((prev) => [...prev, ...data.urls]);
        setPhotoError(null);
      } else {
        setPhotoError(data.message || 'Failed to upload photo(s). Please try again.');
      }
    } catch (err: any) {
      console.error('Gallery upload error:', err);
      setUploadingPhotos(false);
      setPhotoError('Network error uploading photo(s). Please check your connection and retry.');
    }

    e.target.value = '';
  };

  const toggleCategory = (catId: string) => {
    const exists = selectedItems.find((i) => i.categoryId === catId);
    if (exists) {
      setSelectedItems(selectedItems.filter((i) => i.categoryId !== catId));
    } else {
      setSelectedItems([...selectedItems, { categoryId: catId, estimatedWeight: 5 }]);
    }
  };

  const updateWeight = (catId: string, weight: number) => {
    setSelectedItems(
      selectedItems.map((i) => (i.categoryId === catId ? { ...i, estimatedWeight: weight } : i))
    );
  };

  const calculateEstimate = () => {
    let totalRecyclable = 0;
    let totalWasteCharge = 0;
    const baseCharge = geofenceResult?.zone?.basePickupCharge || 49.0;

    selectedItems.forEach((item) => {
      const cat = categories.find((c) => c.id === item.categoryId);
      if (cat) {
        const val = item.estimatedWeight * cat.pricePerKg;
        if (cat.type === 'WASTE_CHARGE') totalWasteCharge += val;
        else totalRecyclable += val;
      }
    });

    const discount = appliedCoupon === 'WELCOME50' ? 50 : 0;
    const net = totalRecyclable - (totalWasteCharge + baseCharge - discount);

    return {
      totalRecyclable,
      totalWasteCharge,
      baseCharge,
      discount,
      netAmount: Math.abs(net),
      direction: net >= 0 ? 'JUNKITOUT_PAYS' : 'CUSTOMER_PAYS',
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

  const handleConfirmOrder = async () => {
    if (!isCustomer) {
      setLoginOpen(true);
      setErrorMsg('Authentication is required. Please log in with mobile OTP to complete your booking.');
      return;
    }

    if (!geofenceResult?.serviceable) {
      setErrorMsg(geofenceResult?.message || "Sorry, we don't currently serve this location.");
      return;
    }

    if (selectedItems.length === 0) {
      setErrorMsg('Please select at least one waste category.');
      return;
    }

    if (photos.length === 0) {
      setErrorMsg('At least 1 waste photo is required to complete booking.');
      return;
    }

    // Ensure session-stable idempotency key
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = `booking-${phone.replace(/[\s+]/g, '')}-${Date.now()}`;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      // 1. Create order on server
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
          photos,
          notes: instructions,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setLoading(false);
        setErrorMsg(data.message || 'Failed to place order. Please verify your details and try again.');
        return;
      }

      const orderData = data.data;

      // 2. Handle JIO_PAYS Flow (No customer checkout required; settled post-pickup)
      if (orderData.financialDirection === 'JUNKITOUT_PAYS') {
        setLoading(false);
        setSuccessOrder(orderData);
        return;
      }

      // 3. Handle CUSTOMER_PAYS Flow (Razorpay Payment Gateway Checkout)
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
        setErrorMsg('Failed to load Razorpay payment SDK. Please check network connection.');
        return;
      }

      const razorpayConfig = payData.data;

      const options = {
        key: razorpayConfig.key,
        amount: Math.round(razorpayConfig.amount * 100),
        currency: razorpayConfig.currency || 'INR',
        name: 'Junk It Out',
        description: razorpayConfig.description || `Pickup Order #${orderData.orderNumber}`,
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
              setErrorMsg(verifyData.message || 'Payment verification failed server-side.');
            }
          } catch {
            setLoading(false);
            setErrorMsg('Network error verifying payment. Please check your order details in My Pickups.');
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
            setErrorMsg('Payment process was cancelled. You can retry paying to confirm your pickup.');
          },
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (err: any) {
      setLoading(false);
      setErrorMsg('Network error while processing booking request. Please try again.');
    }
  };

  // SUCCESS CONFIRMATION SCREEN
  if (successOrder) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="bg-white rounded-3xl p-8 sm:p-10 shadow-2xl border border-emerald-100 text-center space-y-6 animate-scale-in">
          <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner animate-check-pop">
            <CheckCircle2 className="w-12 h-12 stroke-[2.5]" />
          </div>

          <div className="space-y-2">
            <span className="text-xs font-black text-emerald-700 bg-emerald-50 px-3.5 py-1.5 rounded-full uppercase tracking-wider">
              ✓ Pickup Scheduled Successfully!
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
                {fullAddress || `${houseNo ? `${houseNo}, ` : ''}${street ? `${street}, ` : ''}${area}, Bengaluru`}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-semibold">Pickup Schedule:</span>
              <span className="font-bold text-emerald-700">
                {pickupType === 'ASAP' ? '⚡ 20–30 Mins Doorstep Pickup' : formattedScheduledSlot}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-semibold">Waste Summary:</span>
              <span className="font-bold text-slate-900">
                {selectedItems.length} Category(s) • {photos.length} Photo(s) Attached
              </span>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-200">
              <span className="text-slate-600 font-bold">
                {successOrder.financialDirection === 'CUSTOMER_PAYS' ? 'Service Charge:' : 'Estimated Scrap Value:'}
              </span>
              <span className="font-black text-emerald-600 text-base">
                ₹{Number(successOrder.finalAmount || 0).toFixed(2)}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-600 font-bold">Financial Direction:</span>
              <span className="font-extrabold text-slate-900">
                {successOrder.financialDirection === 'CUSTOMER_PAYS'
                  ? successOrder.paymentStatus === 'CAPTURED' ? 'Payment Successful' : 'Payment Required'
                  : 'Junk It Out Pays You After Weighing'}
              </span>
            </div>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-3.5 rounded-2xl text-xs text-left font-medium">
            <p className="font-bold text-emerald-800 mb-0.5">🚀 What Happens Next?</p>
            <p>
              {successOrder.financialDirection === 'CUSTOMER_PAYS'
                ? 'Complete the service payment before pickup. Our nearest agent will then accept your booking request and you will receive live status updates.'
                : 'Our agent will verify and weigh the material at pickup. The final scrap settlement will be calculated from the actual weight and approved rate.'}
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-3">
            {successOrder.financialDirection === 'CUSTOMER_PAYS' && successOrder.paymentStatus !== 'CAPTURED' && (
              <Link
                href={`/orders/${successOrder.id}`}
                className="hover-lift w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs py-4 rounded-2xl shadow-lg flex items-center justify-center gap-2 uppercase tracking-wider"
              >
                PAY NOW
              </Link>
            )}
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
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* STEPS HEADER WITH ANIMATED PROGRESS BAR */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase">
              On-Demand Doorstep Pickup
            </span>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">Book Waste Pickup</h1>
          </div>
          <span className="text-xs font-extrabold text-emerald-800 bg-emerald-100 px-3.5 py-1.5 rounded-full">
            Step {step} of 5
          </span>
        </div>

        {/* 5-Step Progress Bar */}
        <div className="grid grid-cols-5 gap-2">
          {[
            { id: 1, title: 'Location' },
            { id: 2, title: 'Waste' },
            { id: 3, title: 'Photos' },
            { id: 4, title: 'Pickup Time' },
            { id: 5, title: 'Summary & Book' },
          ].map((st) => (
            <div key={st.id} className="space-y-1">
              <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-green-600 transition-all duration-500 ease-out"
                  style={{ width: step > st.id ? '100%' : step === st.id ? '100%' : '0%' }}
                />
              </div>
              <span className={`text-[11px] block font-bold truncate ${step === st.id ? 'text-emerald-700 font-extrabold' : 'text-slate-500'}`}>
                {step > st.id ? '✓ ' : `${st.id}. `}{st.title}
              </span>
            </div>
          ))}
        </div>
      </div>

      {errorMsg && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-900 rounded-2xl text-xs font-bold flex items-center gap-2 animate-scale-in">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* STEP 1: PICKUP LOCATION WITH GOOGLE MAP */}
      {step === 1 && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-6 animate-scale-in">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-black text-slate-900 tracking-tight">Pickup Location</h2>
              <p className="text-xs text-slate-500">Verify your doorstep pickup location on the map below</p>
            </div>
            <button
              type="button"
              onClick={() => setLocationSearchModalOpen(true)}
              className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-extrabold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all shrink-0 shadow-xs cursor-pointer"
            >
              <Search className="w-4 h-4 text-emerald-600" />
              Change Location
            </button>
          </div>

          {/* SEARCH INPUT DIRECTLY ABOVE MAP */}
          <div className="relative z-30">
            <div className="relative flex items-center">
              <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-emerald-600" />
              <input
                type="text"
                value={mapSearchQuery}
                onChange={(e) => handleMapSearchInputChange(e.target.value)}
                placeholder="Search for area, street name, building, landmark..."
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-10 text-xs font-bold text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100 shadow-xs"
              />
              {mapSearchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setMapSearchQuery('');
                    setMapSearchPredictions([]);
                  }}
                  className="absolute right-3 text-slate-400 hover:text-slate-600 text-xs font-bold p-1 cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* PREDICTIONS DROPDOWN ABOVE MAP CANVAS */}
            {mapSearchPredictions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-40 max-h-60 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl space-y-1">
                {mapSearchPredictions.map((pred: any) => (
                  <button
                    key={pred.place_id}
                    type="button"
                    onClick={() => handleSelectMapSearchPrediction(pred)}
                    className="w-full text-left p-3 rounded-xl hover:bg-emerald-50 transition-colors flex items-start gap-2.5 cursor-pointer border border-transparent hover:border-emerald-200"
                  >
                    <MapPin className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="block text-xs font-extrabold text-slate-900">
                        {pred.structured_formatting?.main_text || pred.description}
                      </span>
                      <span className="block text-[11px] font-medium text-slate-500 truncate">
                        {pred.structured_formatting?.secondary_text || pred.description}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Google Map Card */}
          <div className="rounded-3xl border border-slate-200 bg-slate-50/50 p-4 space-y-4 shadow-sm">
            <div className="relative w-full h-[320px] rounded-2xl overflow-hidden border border-slate-200 shadow-inner">
              <InteractiveMap
                centerLat={lat}
                centerLng={lng}
                zoom={15}
                markers={[
                  {
                    id: 'pickup-location',
                    lat,
                    lng,
                    title: area || 'Pickup Location',
                    type: 'PICKUP',
                  },
                ]}
                onLocationSelect={async (newLat, newLng) => {
                  setLat(newLat);
                  setLng(newLng);
                  await reverseGeocode(newLat, newLng);
                  await runGeofenceCheck(newLat, newLng);
                }}
                className="w-full h-full min-h-[300px] rounded-2xl"
              />
            </div>

            {/* Address Details & Serviceability Badge */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-emerald-600 shrink-0" />
                  <h3 className="text-base font-black text-slate-950">{area}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setLocationSearchModalOpen(true)}
                  className="text-xs font-extrabold text-emerald-700 hover:underline bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200 shadow-xs cursor-pointer"
                >
                  Change Location
                </button>
              </div>

              <p className="text-xs font-semibold text-slate-600 pl-7 leading-relaxed">
                {fullAddress || `${street ? `${street}, ` : ''}${area}, Bengaluru`}
              </p>

              {geofenceResult && (
                <div
                  className={`mt-2 p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                    geofenceResult.serviceable
                      ? 'bg-emerald-100/80 text-emerald-900 border border-emerald-200'
                      : 'bg-rose-100/80 text-rose-900 border border-rose-200'
                  }`}
                >
                  {geofenceResult.serviceable ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-rose-700 shrink-0" />
                  )}
                  <span>
                    {geofenceResult.serviceable
                      ? `✓ Active Service Area: ${geofenceResult.zone?.name || area} (Target ETA: 20–30 mins)`
                      : (geofenceResult.message || "We're not serving this location yet. Please select a location within Bengaluru.")}
                  </span>
                </div>
              )}
            </div>
          </div>

          <button
            disabled={!geofenceResult?.serviceable}
            onClick={() => setStep(2)}
            className="hover-lift w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-extrabold text-sm py-4 rounded-2xl shadow-lg flex items-center justify-center gap-2 cursor-pointer"
          >
            CONTINUE TO WASTE SELECTION
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* STEP 2: WASTE SELECTION & QUANTITY BANDS */}
      {step === 2 && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-6 animate-scale-in">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Step 2 — Select Waste Categories & Quantity</h2>
              <p className="text-xs text-slate-500">Select one or multiple types of waste and estimated weight</p>
            </div>
            <button
              onClick={() => setStep(1)}
              className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1 font-semibold"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {categories.map((cat) => {
              const isSelected = selectedItems.some((i) => i.categoryId === cat.id);
              const itemObj = selectedItems.find((i) => i.categoryId === cat.id);

              return (
                <div
                  key={cat.id}
                  className={`hover-lift p-4 rounded-2xl border transition-all ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50/50 shadow-sm ring-1 ring-emerald-500/20'
                      : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                  }`}
                >
                  <div
                    onClick={() => toggleCategory(cat.id)}
                    className="flex items-start justify-between cursor-pointer mb-3"
                  >
                    <div>
                      <span className="text-xs font-extrabold text-slate-900 block flex items-center gap-1.5">
                        {isSelected && <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />}
                        {cat.name}
                      </span>
                      <span className="text-[11px] text-slate-500 block mt-0.5 leading-snug">{cat.description}</span>
                    </div>
                    <span className="text-xs font-black text-emerald-700 bg-white border border-slate-200 px-2.5 py-1 rounded-lg shrink-0">
                      ₹{cat.pricePerKg} / kg
                    </span>
                  </div>

                  {isSelected && (
                    <div className="pt-3 border-t border-emerald-200/60 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700">Estimated Weight Band:</span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {[5, 10, 25, 50].map((w) => (
                          <button
                            key={w}
                            type="button"
                            onClick={() => updateWeight(cat.id, w)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                              itemObj?.estimatedWeight === w
                                ? 'bg-emerald-600 text-white shadow-sm scale-105'
                                : 'bg-white text-slate-700 border hover:bg-slate-100'
                            }`}
                          >
                            {w === 5 ? 'Under 5kg' : w === 10 ? '5-10kg' : w === 25 ? '10-25kg' : '25-50kg+'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            <button
              onClick={() => setStep(1)}
              className="text-slate-600 font-bold text-sm px-4 py-2 hover:bg-slate-100 rounded-xl"
            >
              Back
            </button>
            <button
              disabled={selectedItems.length === 0}
              onClick={() => setStep(3)}
              className="hover-lift bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold text-sm px-6 py-3.5 rounded-2xl shadow-md flex items-center gap-2"
            >
              CONTINUE TO SPEED & PHOTOS
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: WASTE PHOTOS */}
      {step === 3 && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-6 animate-scale-in">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Step 3 — Upload Waste Photos</h2>
              <p className="text-xs text-slate-500">Provide at least 1 clear photo of your waste for accuracy</p>
            </div>
            <button
              onClick={() => setStep(2)}
              className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1 font-semibold cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          </div>

          {/* Dedicated Hidden File Inputs for Camera & Gallery */}
          <input
            id="camera-file-input"
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={handleCameraChange}
          />
          <input
            id="gallery-file-input"
            ref={galleryInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            multiple
            style={{ display: 'none' }}
            onChange={handleGalleryChange}
          />

          {/* Photo Upload Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700">
                Upload Waste Photos (Minimum 1, Maximum 5 photos):
              </label>
              <span className="text-xs font-semibold text-slate-500">
                {photos.length} / 5 Selected
              </span>
            </div>

            {photoError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-bold flex items-center justify-between animate-scale-in">
                <span>⚠️ {photoError}</span>
                <button onClick={() => setPhotoError(null)} className="text-rose-500 hover:text-rose-700 font-bold ml-2">✕</button>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              {photos.map((url, idx) => (
                <div key={idx} className="w-24 h-24 rounded-2xl overflow-hidden border border-slate-200 relative group animate-scale-in shadow-sm bg-slate-100">
                  <img src={url} alt={`Waste Photo ${idx + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => {
                      setPhotos(photos.filter((_, i) => i !== idx));
                      if (photos.length - 1 < 5) setPhotoError(null);
                    }}
                    className="absolute top-1.5 right-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shadow-md transition-transform hover:scale-110"
                    title="Remove photo"
                  >
                    ✕
                  </button>
                </div>
              ))}

              {uploadingPhotos && (
                <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-emerald-400 bg-emerald-50 text-emerald-700 flex flex-col items-center justify-center text-xs font-bold gap-1 animate-pulse">
                  <Camera className="w-6 h-6 animate-spin" />
                  <span>Uploading...</span>
                </div>
              )}

              {photos.length < 5 && !uploadingPhotos && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowPhotoOptionsModal(true)}
                    className="w-24 h-24 rounded-2xl border-2 border-dashed border-slate-300 hover:border-emerald-500 bg-slate-50 hover:bg-emerald-50/50 text-slate-600 hover:text-emerald-700 flex flex-col items-center justify-center text-xs font-bold gap-1 transition-all shadow-sm cursor-pointer"
                  >
                    <Camera className="w-6 h-6 text-emerald-600" />
                    <span>+ Add</span>
                  </button>

                  {/* Photo Options Selection Modal */}
                  {showPhotoOptionsModal && (
                    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
                      <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 border border-slate-200 animate-scale-in">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                          <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                            <Camera className="w-4 h-4 text-emerald-600" />
                            Add Waste Photo
                          </h3>
                          <button
                            type="button"
                            onClick={() => setShowPhotoOptionsModal(false)}
                            className="text-slate-400 hover:text-slate-600 text-xs font-bold"
                          >
                            ✕ Close
                          </button>
                        </div>

                        <p className="text-xs text-slate-500 leading-relaxed">
                          Capture clear photos of your waste items to help our pickup agent prepare the right vehicle and weighing scale.
                        </p>

                        <div className="space-y-2.5 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setShowPhotoOptionsModal(false);
                              if (cameraInputRef.current) {
                                cameraInputRef.current.click();
                              }
                            }}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs py-3.5 px-4 rounded-2xl flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
                          >
                            📷 Take Photo (Camera)
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setShowPhotoOptionsModal(false);
                              if (galleryInputRef.current) {
                                galleryInputRef.current.click();
                              }
                            }}
                            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-extrabold text-xs py-3.5 px-4 rounded-2xl flex items-center justify-center gap-2 transition-all border border-slate-200 cursor-pointer"
                          >
                            🖼️ Upload Photos (Gallery)
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {photos.length === 0 && (
              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 p-3 rounded-xl font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>At least 1 photo of your waste items is required before continuing to pickup time selection.</span>
              </p>
            )}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            <button
              onClick={() => setStep(2)}
              className="text-slate-600 font-bold text-sm px-4 py-2 hover:bg-slate-100 rounded-xl"
            >
              Back
            </button>
            <button
              disabled={photos.length < 1}
              onClick={() => {
                if (photos.length < 1) {
                  setErrorMsg('Please upload or capture at least 1 waste photo before proceeding.');
                  setPhotoError('At least 1 waste photo is required.');
                  return;
                }
                setErrorMsg('');
                setPhotoError(null);
                setStep(4);
              }}
              className="hover-lift bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold text-sm px-6 py-3.5 rounded-2xl shadow-md flex items-center gap-2 cursor-pointer"
            >
              CONTINUE TO PICKUP TIME
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: PICKUP TIME & INSTRUCTIONS */}
      {step === 4 && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-6 animate-scale-in">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Step 4 — Pickup Speed, Schedule & Instructions</h2>
              <p className="text-xs text-slate-500">Choose immediate 20–30 min pickup or schedule a specific time slot</p>
            </div>
            <button
              onClick={() => setStep(3)}
              className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1 font-semibold cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          </div>

          {/* Dispatch Speed Selector */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Pickup Dispatch Mode:</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div
                onClick={() => setPickupType('ASAP')}
                className={`hover-lift p-4 rounded-2xl border cursor-pointer transition-all ${
                  pickupType === 'ASAP'
                    ? 'border-emerald-600 bg-emerald-50 shadow-sm ring-2 ring-emerald-500/20'
                    : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-5 h-5 text-emerald-600" />
                  <span className="font-extrabold text-slate-900 text-sm">⚡ ASAP Pickup (20–30 Mins)</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Nearest agent assigned immediately. Fastest doorstep collection in Bengaluru.
                </p>
              </div>

              <div
                onClick={() => setPickupType('SCHEDULED')}
                className={`hover-lift p-4 rounded-2xl border cursor-pointer transition-all ${
                  pickupType === 'SCHEDULED'
                    ? 'border-emerald-600 bg-emerald-50 shadow-sm ring-2 ring-emerald-500/20'
                    : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="w-5 h-5 text-indigo-600" />
                  <span className="font-extrabold text-slate-900 text-sm">📅 Schedule for Later</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">Select preferred date & 1-hour window for pickup.</p>
              </div>
            </div>
          </div>

          {/* SCHEDULED PICKUP DATE & TIME SLOT PICKER */}
          {pickupType === 'SCHEDULED' && (
            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4 animate-scale-in">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-2">1. Select Pickup Date:</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {availableDates.map((d, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedDateIdx(idx)}
                      className={`p-3 rounded-xl border text-center transition-all ${
                        selectedDateIdx === idx
                          ? 'bg-emerald-600 text-white border-emerald-600 font-extrabold shadow-sm'
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
                <label className="block text-xs font-bold text-slate-800 mb-2">2. Select 1-Hour Time Window:</label>
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
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
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
                {curDateObj.isToday && TIME_SLOTS.every((s) => s.startHour <= currentHour) && (
                  <p className="text-xs text-amber-800 bg-amber-50 p-2.5 rounded-xl mt-2 font-bold">
                    ⚠️ All time slots for today have passed. Please select Tomorrow for your pickup.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Customer Pickup Instructions */}
          <div className="space-y-1.5 pt-2 border-t border-slate-100">
            <label className="block text-xs font-bold text-slate-700">
              Pickup Instructions for Agent (Optional):
            </label>
            <input
              type="text"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Ring bell at main gate, call when outside, park near tower B"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-medium focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            <button
              onClick={() => setStep(3)}
              className="text-slate-600 font-bold text-sm px-4 py-2 hover:bg-slate-100 rounded-xl"
            >
              Back
            </button>
            <button
              onClick={() => {
                if (pickupType === 'SCHEDULED' && curDateObj.isToday && TIME_SLOTS.find(s => s.id === selectedSlotId)?.startHour! <= currentHour) {
                  setErrorMsg('The selected time slot has expired. Please pick a valid future time slot.');
                  return;
                }
                setErrorMsg('');
                setStep(5);
              }}
              className="hover-lift bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-6 py-3.5 rounded-2xl shadow-md flex items-center gap-2 cursor-pointer"
            >
              VIEW SUMMARY & CONFIRM
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 5: SUMMARY & CONFIRMATION */}
      {step === 5 && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-6 animate-scale-in">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Step 5 — Pickup Summary & Final Booking</h2>
              <p className="text-xs text-slate-500">Review your address, schedule, waste items and valuation before booking</p>
            </div>
            <button
              onClick={() => setStep(4)}
              className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1 font-semibold cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Edit Details
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Pickup Location & Schedule</h3>
              <div className="flex items-start gap-2.5">
                <MapPin className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-sm text-slate-900">📍 {area}</p>
                  <p className="text-xs text-slate-600">{fullAddress || `${street ? `${street}, ` : ''}${area}, Bengaluru`}</p>
                  <p className="text-[11px] text-slate-500 mt-1 font-semibold">Contact: {name} ({phone})</p>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs font-semibold">
                <span className="text-slate-600">Pickup Schedule:</span>
                <span className="text-emerald-700 font-bold bg-emerald-100 px-2.5 py-0.5 rounded-full">
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

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Selected Waste & Photos</h3>
              <div className="space-y-2 text-xs">
                {selectedItems.map((item) => {
                  const cat = categories.find((c) => c.id === item.categoryId);
                  return (
                    <div key={item.categoryId} className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-slate-200">
                      <div>
                        <span className="font-bold text-slate-900 block">{cat?.name}</span>
                        <span className="text-[11px] text-slate-500">Rate: ₹{cat?.pricePerKg}/kg</span>
                      </div>
                      <span className="font-bold text-emerald-700">{item.estimatedWeight} kg (Est)</span>
                    </div>
                  );
                })}
              </div>

              <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs font-semibold">
                <span className="text-slate-600">Waste Photos Proof:</span>
                <span className="font-bold text-slate-900 bg-white px-2.5 py-0.5 rounded-full border border-slate-200">
                  📷 {photos.length} Photo(s) Attached
                </span>
              </div>
            </div>
          </div>

          <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-200 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Ticket className="w-5 h-5 text-emerald-600" />
              <div>
                <span className="font-bold text-xs text-slate-900 block">Promo Coupon Applied</span>
                <span className="text-[11px] text-emerald-700">WELCOME50 — ₹50 discount on pickup fee</span>
              </div>
            </div>
            <span className="text-xs font-bold bg-emerald-600 text-white px-3 py-1 rounded-lg">
              APPLIED
            </span>
          </div>

          <div className="bg-slate-900 text-white p-5 rounded-2xl space-y-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2">
              {estimate.direction === 'CUSTOMER_PAYS' ? 'Payment Summary' : 'Valuation & Payout Summary'}
            </h3>
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>Recyclable Value:</span>
              <span className="font-bold text-emerald-400">₹{estimate.totalRecyclable.toFixed(2)}</span>
            </div>
            {estimate.totalWasteCharge > 0 && (
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>Heavy Waste Service Charge:</span>
                <span>₹{estimate.totalWasteCharge.toFixed(2)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>Pickup/Service Charge:</span>
              <span>₹{estimate.baseCharge.toFixed(2)}</span>
            </div>
            {estimate.discount > 0 && (
              <div className="flex items-center justify-between text-xs text-emerald-400">
                <span>Coupon Discount (WELCOME50):</span>
                <span>- ₹{estimate.discount.toFixed(2)}</span>
              </div>
            )}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-base font-extrabold">
              <span>{estimate.direction === 'JUNKITOUT_PAYS' ? 'Net Payout to You:' : 'Amount to Pay:'}</span>
              <span className="text-xl text-emerald-400">₹{estimate.netAmount.toFixed(2)}</span>
            </div>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 flex items-center justify-between text-xs font-semibold">
            <span className="text-slate-600 font-bold">Financial Direction:</span>
            <span className="font-extrabold text-slate-900">
              {estimate.direction === 'JUNKITOUT_PAYS'
                ? 'Junk It Out Pays You After Weighing'
                : 'Customer Payment Required (via Razorpay)'}
            </span>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <div className="flex items-center justify-between gap-4">
              <button
                onClick={() => setStep(4)}
                className="text-slate-600 font-bold text-sm px-4 py-2 hover:bg-slate-100 rounded-xl shrink-0"
              >
                Back
              </button>
              <button
                disabled={loading}
                onClick={handleConfirmOrder}
                className="hover-lift w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white font-black text-base py-4 rounded-2xl shadow-xl flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Clock className="w-5 h-5 animate-spin" />
                    {estimate.direction === 'CUSTOMER_PAYS' ? 'PROCESSING PAYMENT...' : 'CONFIRMING PICKUP...'}
                  </>
                ) : estimate.direction === 'CUSTOMER_PAYS' ? (
                  <>
                    🔒 PAY ₹{estimate.netAmount.toFixed(2)} & CONFIRM PICKUP
                    <ArrowRight className="w-5 h-5" />
                  </>
                ) : (
                  <>
                    CONFIRM & BOOK PICKUP NOW
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>

            <p className="text-[11px] text-center text-slate-500 font-semibold mt-1">
              {estimate.direction === 'CUSTOMER_PAYS'
                ? '🔒 Secure payment powered by Razorpay'
                : '⚡ Payment will be settled by Junk It Out after pickup verification & weighing.'}
            </p>
          </div>
        </div>
      )}

      <CustomerOtpLogin
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onAuthenticated={async () => {
          await checkAuth();
          setLoginOpen(false);
        }}
      />

      <LocationSearchModal
        open={locationSearchModalOpen}
        onClose={() => setLocationSearchModalOpen(false)}
        currentArea={area}
        onSelectLocation={(data) => {
          setArea(data.area);
          setLat(data.lat);
          setLng(data.lng);
          if (data.placeId) setPlaceId(data.placeId);
          if (data.houseNo) setHouseNo(data.houseNo);
          if (data.street) setStreet(data.street);
          if (data.pincode) setPincode(data.pincode);
          setFullAddress(data.address || `${data.street ? `${data.street}, ` : ''}${data.area}, Bengaluru`);
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
