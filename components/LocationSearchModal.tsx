'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search,
  X,
  Navigation,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  LoaderCircle,
  Building2,
  ChevronRight,
} from 'lucide-react';
import { BENGALURU_ZONES } from '@/lib/geofence';
import { loadGoogleMaps } from '@/components/InteractiveMap';

type Props = {
  open: boolean;
  onClose: () => void;
  onSelectLocation: (locationData: {
    address: string;
    area: string;
    lat: number;
    lng: number;
    placeId?: string;
    houseNo?: string;
    street?: string;
    pincode?: string;
    serviceable: boolean;
    zoneName?: string;
  }) => void;
  currentArea?: string;
};

// Popular Bengaluru hubs for 1-tap quick selection
const POPULAR_HUB_LOCATIONS = [
  { name: 'Whitefield, ITPL & Kadugodi', lat: 12.9698, lng: 77.7500, street: 'ITPL Main Road', pincode: '560066' },
  { name: 'Koramangala & HSR Layout', lat: 12.9352, lng: 77.6245, street: '80 Feet Road', pincode: '560034' },
  { name: 'Indiranagar & Domlur', lat: 12.9784, lng: 77.6408, street: '100 Feet Road', pincode: '560038' },
  { name: 'Jayanagar & JP Nagar', lat: 12.9250, lng: 77.5938, street: '4th Block', pincode: '560041' },
  { name: 'Electronic City & Silk Board', lat: 12.8452, lng: 77.6602, street: 'Hosur Main Road', pincode: '560100' },
  { name: 'Yelahanka & Hebbal', lat: 13.0991, lng: 77.5944, street: 'Bellary Road', pincode: '560064' },
];

export default function LocationSearchModal({
  open,
  onClose,
  onSelectLocation,
  currentArea = 'Select delivery location',
}: Props) {
  const [query, setQuery] = useState('');
  const [predictions, setPredictions] = useState<any[]>([]);
  const [loadingGeolocate, setLoadingGeolocate] = useState(false);
  const [loadingPlaceSelect, setLoadingPlaceSelect] = useState(false);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [mapsReady, setMapsReady] = useState(false);

  const autocompleteServiceRef = useRef<any>(null);
  const geocoderRef = useRef<any>(null);

  // Initialize Google Maps Places & Geocoder Services
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setPredictions([]);
    setServiceError(null);

    loadGoogleMaps()
      .then((maps) => {
        setMapsReady(true);
        if (maps?.places && !autocompleteServiceRef.current) {
          autocompleteServiceRef.current = new maps.places.AutocompleteService();
        }
        if (maps && !geocoderRef.current) {
          geocoderRef.current = new maps.Geocoder();
        }
      })
      .catch((err) => {
        console.warn('Google Maps Places Autocomplete setup notice:', err.message);
        setMapsReady(false);
      });
  }, [open]);

  // Check serviceability via backend API
  const checkServiceability = async (lat: number, lng: number): Promise<{ serviceable: boolean; zoneName?: string; message?: string }> => {
    try {
      const res = await fetch('/api/service-areas/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng }),
      });
      const data = await res.json();
      if (data.success && data.data?.serviceable) {
        return { serviceable: true, zoneName: data.data.zone?.name || 'Bengaluru Zone' };
      } else {
        return {
          serviceable: false,
          message: data.data?.message || data.message || "We're not serving this location yet. Please select a location within Bengaluru.",
        };
      }
    } catch {
      return {
        serviceable: false,
        message: 'Unable to verify serviceability. Please check your network connection.',
      };
    }
  };

  // Handle Google Places Input Search
  const handleQueryChange = (val: string) => {
    setQuery(val);
    setServiceError(null);

    if (!val || val.trim().length < 2 || !autocompleteServiceRef.current) {
      setPredictions([]);
      return;
    }

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
            setPredictions(results);
          } else {
            setPredictions([]);
          }
        }
      );
    } catch (e) {
      console.error('Places autocomplete prediction error:', e);
      setPredictions([]);
    }
  };

  // Handle Selection of a Google Places Result
  const handleSelectPrediction = (prediction: any) => {
    if (!geocoderRef.current) return;
    setLoadingPlaceSelect(true);
    setServiceError(null);

    geocoderRef.current.geocode({ placeId: prediction.place_id }, async (results: any[], status: string) => {
      setLoadingPlaceSelect(false);
      if (status === 'OK' && results?.[0]?.geometry?.location) {
        const targetLat = results[0].geometry.location.lat();
        const targetLng = results[0].geometry.location.lng();
        const formattedAddress = results[0].formatted_address || prediction.description;

        const components = results[0].address_components || [];
        const valueFor = (type: string) => components.find((item: any) => item.types?.includes(type))?.long_name || '';
        const areaName = valueFor('sublocality_level_1') || valueFor('locality') || prediction.structured_formatting?.main_text || 'Bengaluru';
        const streetName = valueFor('route') || valueFor('neighborhood') || '';
        const postalCode = valueFor('postal_code') || '';

        const check = await checkServiceability(targetLat, targetLng);
        if (check.serviceable) {
          onSelectLocation({
            address: formattedAddress,
            area: areaName,
            lat: targetLat,
            lng: targetLng,
            placeId: prediction.place_id,
            street: streetName,
            pincode: postalCode,
            serviceable: true,
            zoneName: check.zoneName,
          });
          onClose();
        } else {
          setServiceError(check.message || "We're not serving this location yet. Please select a location within Bengaluru.");
        }
      } else {
        setServiceError('Unable to fetch coordinates for this location. Please select another suggestion.');
      }
    });
  };

  // Handle Current Location GPS Click
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setServiceError('Geolocation is not supported by your browser.');
      return;
    }

    setLoadingGeolocate(true);
    setServiceError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;

        if (geocoderRef.current) {
          geocoderRef.current.geocode({ location: { lat: userLat, lng: userLng } }, async (results: any[], status: string) => {
            setLoadingGeolocate(false);
            if (status === 'OK' && results?.[0]) {
              const res = results[0];
              const formattedAddress = res.formatted_address || `GPS (${userLat.toFixed(4)}, ${userLng.toFixed(4)})`;
              const components = res.address_components || [];
              const valueFor = (type: string) => components.find((item: any) => item.types?.includes(type))?.long_name || '';
              const areaName = valueFor('sublocality_level_1') || valueFor('locality') || 'Bengaluru';
              const streetName = valueFor('route') || '';
              const postalCode = valueFor('postal_code') || '';

              const check = await checkServiceability(userLat, userLng);
              if (check.serviceable) {
                onSelectLocation({
                  address: formattedAddress,
                  area: areaName,
                  lat: userLat,
                  lng: userLng,
                  placeId: res.place_id,
                  street: streetName,
                  pincode: postalCode,
                  serviceable: true,
                  zoneName: check.zoneName,
                });
                onClose();
              } else {
                setServiceError("We're not serving this location yet. Please select a location within Bengaluru.");
              }
            } else {
              const check = await checkServiceability(userLat, userLng);
              if (check.serviceable) {
                onSelectLocation({
                  address: `Near (${userLat.toFixed(4)}, ${userLng.toFixed(4)})`,
                  area: 'Bengaluru',
                  lat: userLat,
                  lng: userLng,
                  serviceable: true,
                });
                onClose();
              } else {
                setServiceError("We're not serving this location yet. Please select a location within Bengaluru.");
              }
            }
          });
        } else {
          setLoadingGeolocate(false);
          const check = await checkServiceability(userLat, userLng);
          if (check.serviceable) {
            onSelectLocation({
              address: `GPS (${userLat.toFixed(4)}, ${userLng.toFixed(4)})`,
              area: 'Bengaluru',
              lat: userLat,
              lng: userLng,
              serviceable: true,
            });
            onClose();
          } else {
            setServiceError("We're not serving this location yet. Please select a location within Bengaluru.");
          }
        }
      },
      (err) => {
        setLoadingGeolocate(false);
        if (err.code === err.PERMISSION_DENIED) {
          setServiceError('Location permission denied. Please search for your area manually.');
        } else {
          setServiceError('Unable to detect current GPS location. Please search for your area.');
        }
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  // Handle Quick Select Popular Bengaluru Hubs
  const handleSelectPopularHub = async (hub: typeof POPULAR_HUB_LOCATIONS[0]) => {
    setLoadingPlaceSelect(true);
    setServiceError(null);
    const check = await checkServiceability(hub.lat, hub.lng);
    setLoadingPlaceSelect(false);

    if (check.serviceable) {
      onSelectLocation({
        address: `${hub.name}, Bengaluru - ${hub.pincode}`,
        area: hub.name,
        lat: hub.lat,
        lng: hub.lng,
        street: hub.street,
        pincode: hub.pincode,
        serviceable: true,
        zoneName: check.zoneName,
      });
      onClose();
    } else {
      setServiceError("We're not serving this location yet. Please select a location within Bengaluru.");
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Select delivery location"
    >
      {/* BACKDROP */}
      <button
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
        aria-label="Close modal"
      />

      {/* ZEPTO-STYLE LOCATION SEARCH CONTAINER */}
      <div className="animate-scale-in relative flex max-h-[92dvh] h-[92dvh] sm:h-auto w-full max-w-lg flex-col rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl overflow-hidden">
        {/* HEADER */}
        <header className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4 bg-white">
          <div>
            <h2 className="text-base font-black text-slate-950">Select delivery location</h2>
            <p className="text-xs text-slate-500 font-semibold mt-0.5">Choose your doorstep pickup area in Bengaluru</p>
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* SEARCH BAR INPUT */}
        <div className="shrink-0 p-4 border-b border-slate-100 bg-slate-50/70">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Search area, street name, apartment..."
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-10 text-sm font-bold text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 placeholder:text-slate-400 placeholder:font-semibold"
            />
            {query && (
              <button
                onClick={() => {
                  setQuery('');
                  setPredictions([]);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* SERVICEABILITY ERROR ALERT BANNER */}
        {serviceError && (
          <div className="shrink-0 mx-4 mt-3 p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 text-xs font-bold flex items-center gap-2.5 animate-scale-in">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span>{serviceError}</span>
          </div>
        )}

        {/* SCROLLABLE LOCATION OPTIONS & PREDICTIONS */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
          {/* PROMINENT USE CURRENT LOCATION BUTTON */}
          <button
            onClick={handleUseCurrentLocation}
            disabled={loadingGeolocate}
            className="w-full flex items-center justify-between p-3.5 bg-emerald-50/80 hover:bg-emerald-100/80 border border-emerald-200/80 rounded-2xl transition-all text-left group"
          >
            <div className="flex items-center gap-3.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white shadow-md group-hover:scale-105 transition-transform">
                {loadingGeolocate ? (
                  <LoaderCircle className="h-5 w-5 animate-spin" />
                ) : (
                  <Navigation className="h-5 w-5 fill-current" />
                )}
              </span>
              <div>
                <span className="block text-sm font-black text-emerald-950">Use current location</span>
                <span className="block text-xs font-semibold text-emerald-700 mt-0.5">
                  {loadingGeolocate ? 'Detecting your GPS position...' : 'Using your device location'}
                </span>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-emerald-600 group-hover:translate-x-0.5 transition-transform" />
          </button>

          {/* GOOGLE PLACES LIVE PREDICTIONS LIST */}
          {predictions.length > 0 ? (
            <div className="space-y-1">
              <span className="block text-[11px] font-black uppercase tracking-wider text-slate-400 px-1 mb-2">
                Search Results
              </span>
              {predictions.map((prediction) => (
                <button
                  key={prediction.place_id}
                  onClick={() => handleSelectPrediction(prediction)}
                  disabled={loadingPlaceSelect}
                  className="w-full flex items-start gap-3 p-3 rounded-2xl hover:bg-slate-100/80 text-left transition-colors border border-transparent hover:border-slate-200"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600 mt-0.5">
                    <MapPin className="h-4 w-4 text-emerald-600" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="block text-sm font-extrabold text-slate-900 truncate">
                      {prediction.structured_formatting?.main_text || prediction.description}
                    </span>
                    <span className="block text-xs font-semibold text-slate-500 line-clamp-1 mt-0.5">
                      {prediction.structured_formatting?.secondary_text || prediction.description}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            /* POPULAR BENGALURU LOCATIONS SUGGESTIONS */
            <div className="space-y-2 pt-1">
              <span className="block text-[11px] font-black uppercase tracking-wider text-slate-400 px-1">
                Recent / Popular Bengaluru Locations
              </span>
              <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                {POPULAR_HUB_LOCATIONS.map((hub, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSelectPopularHub(hub)}
                    disabled={loadingPlaceSelect}
                    className="w-full flex items-center justify-between p-3.5 hover:bg-slate-50 text-left transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                        <Building2 className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <span className="block text-xs font-black text-slate-900 truncate">{hub.name}</span>
                        <span className="block text-[11px] font-semibold text-slate-500">Bengaluru • {hub.pincode}</span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <footer className="shrink-0 border-t border-slate-100 p-4 bg-slate-50/50 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] text-center">
          <p className="text-[11px] font-semibold text-slate-500">
            ⚡ Doorstep waste pickup is active across all Bengaluru zones
          </p>
        </footer>
      </div>
    </div>
  );
}
