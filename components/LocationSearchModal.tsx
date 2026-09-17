'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Search,
  X,
  Navigation,
  MapPin,
  AlertTriangle,
  LoaderCircle,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { BENGALURU_ZONES, ServiceZone } from '@/lib/geofence';
import { loadGoogleMaps } from '@/components/InteractiveMap';
import { setSelectedLocation } from '@/lib/selectedLocation';

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

export default function LocationSearchModal({
  open,
  onClose,
  onSelectLocation,
  currentArea = 'Select delivery location',
}: Props) {
  const [query, setQuery] = useState('');
  const [predictions, setPredictions] = useState<any[]>([]);
  const [serviceZones, setServiceZones] = useState<any[]>(BENGALURU_ZONES);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [loadingGeolocate, setLoadingGeolocate] = useState(false);
  const [loadingPlaceSelect, setLoadingPlaceSelect] = useState(false);
  const [serviceError, setServiceError] = useState<string | null>(null);

  const autocompleteServiceRef = useRef<any>(null);
  const geocoderRef = useRef<any>(null);

  // Prevent background page scrolling when modal is open & handle Escape key
  useEffect(() => {
    if (!open) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  // Fetch configured service areas from backend API if available, fallback to BENGALURU_ZONES
  useEffect(() => {
    if (!open) return;

    fetch('/api/service-areas')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data) && data.data.length > 0) {
          setServiceZones(data.data);
        }
      })
      .catch(() => {
        // Fallback to static BENGALURU_ZONES already in state
      });
  }, [open]);

  // Initialize Google Maps Places & Geocoder Services
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setPredictions([]);
    setServiceError(null);
    setSelectedZoneId(null);

    loadGoogleMaps()
      .then((maps) => {
        if (maps?.places && !autocompleteServiceRef.current) {
          autocompleteServiceRef.current = new maps.places.AutocompleteService();
        }
        if (maps && !geocoderRef.current) {
          geocoderRef.current = new maps.Geocoder();
        }
      })
      .catch((err) => {
        console.warn('Google Maps Places Autocomplete setup notice:', err.message);
      });
  }, [open]);

  // Check serviceability via backend API
  const checkServiceability = async (
    lat: number,
    lng: number
  ): Promise<{ serviceable: boolean; zoneName?: string; message?: string }> => {
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
          message:
            data.data?.message ||
            data.message ||
            "We're not serving this location yet. Please select a location within Bengaluru.",
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

    geocoderRef.current.geocode(
      { placeId: prediction.place_id },
      async (results: any[], status: string) => {
        setLoadingPlaceSelect(false);
        if (status === 'OK' && results?.[0]?.geometry?.location) {
          const targetLat = results[0].geometry.location.lat();
          const targetLng = results[0].geometry.location.lng();
          const formattedAddress = results[0].formatted_address || prediction.description;

          const components = results[0].address_components || [];
          const valueFor = (type: string) =>
            components.find((item: any) => item.types?.includes(type))?.long_name || '';
          const areaName =
            valueFor('sublocality_level_1') ||
            valueFor('locality') ||
            prediction.structured_formatting?.main_text ||
            'Bengaluru';
          const streetName = valueFor('route') || valueFor('neighborhood') || '';
          const postalCode = valueFor('postal_code') || '';

          const check = await checkServiceability(targetLat, targetLng);
          if (check.serviceable) {
            const locData = {
              address: formattedAddress,
              area: areaName,
              lat: targetLat,
              lng: targetLng,
              placeId: prediction.place_id,
              street: streetName,
              pincode: postalCode,
              serviceable: true,
              zoneName: check.zoneName,
            };
            setSelectedLocation(locData);
            onSelectLocation(locData);
            onClose();
          } else {
            setServiceError(
              check.message ||
                "We're not serving this location yet. Please select a location within Bengaluru."
            );
          }
        } else {
          setServiceError('Unable to fetch coordinates for this location. Please select another suggestion.');
        }
      }
    );
  };

  // Handle Selection of a Service Zone from the list
  const handleSelectZone = async (zone: any) => {
    const zoneKey = zone.id || zone.name;
    setSelectedZoneId(zoneKey);
    setLoadingPlaceSelect(true);
    setServiceError(null);

    const lat = zone.centerLat || 12.9077;
    const lng = zone.centerLng || 77.5854;

    const check = await checkServiceability(lat, lng);
    setLoadingPlaceSelect(false);
    setSelectedZoneId(null);

    if (check.serviceable) {
      const locData = {
        address: `${zone.name}, Bengaluru`,
        area: zone.name,
        lat,
        lng,
        serviceable: true,
        zoneName: check.zoneName || zone.name,
      };
      setSelectedLocation(locData);
      onSelectLocation(locData);
      onClose();
    } else {
      setServiceError(
        check.message || "We're not serving this location yet. Please select a location within Bengaluru."
      );
    }
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
          geocoderRef.current.geocode(
            { location: { lat: userLat, lng: userLng } },
            async (results: any[], status: string) => {
              setLoadingGeolocate(false);
              if (status === 'OK' && results?.[0]) {
                const res = results[0];
                const formattedAddress =
                  res.formatted_address || `GPS (${userLat.toFixed(4)}, ${userLng.toFixed(4)})`;
                const components = res.address_components || [];
                const valueFor = (type: string) =>
                  components.find((item: any) => item.types?.includes(type))?.long_name || '';
                const areaName = valueFor('sublocality_level_1') || valueFor('locality') || 'Bengaluru';
                const streetName = valueFor('route') || '';
                const postalCode = valueFor('postal_code') || '';

                const check = await checkServiceability(userLat, userLng);
                if (check.serviceable) {
                  const locData = {
                    address: formattedAddress,
                    area: areaName,
                    lat: userLat,
                    lng: userLng,
                    placeId: res.place_id,
                    street: streetName,
                    pincode: postalCode,
                    serviceable: true,
                    zoneName: check.zoneName,
                  };
                  setSelectedLocation(locData);
                  onSelectLocation(locData);
                  onClose();
                } else {
                  setServiceError(
                    "We're not serving this location yet. Please select a location within Bengaluru."
                  );
                }
              } else {
                const check = await checkServiceability(userLat, userLng);
                if (check.serviceable) {
                  const locData = {
                    address: `Near (${userLat.toFixed(4)}, ${userLng.toFixed(4)})`,
                    area: 'Bengaluru',
                    lat: userLat,
                    lng: userLng,
                    serviceable: true,
                  };
                  setSelectedLocation(locData);
                  onSelectLocation(locData);
                  onClose();
                } else {
                  setServiceError(
                    "We're not serving this location yet. Please select a location within Bengaluru."
                  );
                }
              }
            }
          );
        } else {
          setLoadingGeolocate(false);
          const check = await checkServiceability(userLat, userLng);
          if (check.serviceable) {
            const locData = {
              address: `GPS (${userLat.toFixed(4)}, ${userLng.toFixed(4)})`,
              area: 'Bengaluru',
              lat: userLat,
              lng: userLng,
              serviceable: true,
            };
            setSelectedLocation(locData);
            onSelectLocation(locData);
            onClose();
          } else {
            setServiceError(
              "We're not serving this location yet. Please select a location within Bengaluru."
            );
          }
        }
      },
      (err) => {
        setLoadingGeolocate(false);
        if (err.code === err.PERMISSION_DENIED) {
          setServiceError('Location permission denied. Please select your area from the available list.');
        } else {
          setServiceError('Unable to detect current GPS location. Please select your area from the list below.');
        }
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  if (!open) return null;

  // Filter service zones by user search query
  const filteredZones = query.trim()
    ? serviceZones.filter((z) => z.name.toLowerCase().includes(query.trim().toLowerCase()))
    : serviceZones;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-start pt-12 sm:pt-16 px-3 pb-4 sm:pb-6 overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Select pickup location"
    >
      {/* BACKDROP */}
      <button
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
        aria-label="Close modal"
      />

      {/* LOCATION SEARCH CONTAINER */}
      <div className="animate-scale-in relative flex max-h-[calc(100dvh-4rem)] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200 z-10">
        {/* HEADER */}
        <header className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 sm:px-5 py-3.5 bg-white">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100">
              <MapPin className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Select Pickup Location</h2>
              <p className="text-xs text-slate-500 font-medium">📍 Doorstep waste pickup across Bengaluru</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* SEARCH BAR INPUT */}
        <div className="shrink-0 p-3.5 border-b border-slate-100 bg-slate-50/50">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Search area, zone name, apartment..."
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-9 text-xs sm:text-sm font-medium text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 placeholder:text-slate-400"
            />
            {query && (
              <button
                onClick={() => {
                  setQuery('');
                  setPredictions([]);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* SERVICEABILITY ERROR ALERT BANNER */}
        {serviceError && (
          <div className="shrink-0 mx-4 mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs font-medium flex items-center gap-2.5 animate-scale-in">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span>{serviceError}</span>
          </div>
        )}

        {/* SCROLLABLE LOCATION OPTIONS & PREDICTIONS */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
          {/* PROMINENT USE CURRENT LOCATION BUTTON */}
          <button
            onClick={handleUseCurrentLocation}
            disabled={loadingGeolocate || loadingPlaceSelect}
            className="w-full flex items-center justify-between p-3 bg-emerald-50/80 hover:bg-emerald-100/70 border border-emerald-200/80 rounded-xl transition-all text-left group cursor-pointer disabled:opacity-50"
          >
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-600 text-white shadow-sm group-hover:scale-105 transition-transform">
                {loadingGeolocate ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Navigation className="h-4 w-4 fill-current" />
                )}
              </span>
              <div>
                <span className="block text-xs font-bold text-slate-900">Use current location</span>
                <span className="block text-[11px] font-medium text-emerald-700 mt-0.5">
                  {loadingGeolocate ? 'Detecting your GPS position...' : 'Use device GPS location'}
                </span>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-emerald-600 group-hover:translate-x-0.5 transition-transform" />
          </button>

          {/* GOOGLE PLACES LIVE PREDICTIONS LIST (IF SEARCHING) */}
          {predictions.length > 0 && (
            <div className="space-y-1">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 mb-2">
                Google Search Results
              </span>
              {predictions.map((prediction) => (
                <button
                  key={prediction.place_id}
                  onClick={() => handleSelectPrediction(prediction)}
                  disabled={loadingPlaceSelect}
                  className="w-full flex items-start gap-3 p-2.5 rounded-xl hover:bg-slate-100/80 text-left transition-colors border border-transparent hover:border-slate-200 cursor-pointer disabled:opacity-50"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600 mt-0.5">
                    <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-slate-900 truncate">
                      {prediction.structured_formatting?.main_text || prediction.description}
                    </span>
                    <span className="block text-[11px] font-medium text-slate-500 line-clamp-1 mt-0.5">
                      {prediction.structured_formatting?.secondary_text || prediction.description}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* AVAILABLE SERVICE AREAS LIST */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                📍 Available Bengaluru Service Areas
              </span>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <ShieldCheck className="h-3 w-3 text-emerald-600" />
                {filteredZones.length} Active Zones
              </span>
            </div>

            {filteredZones.length === 0 ? (
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center text-xs text-slate-500">
                No matching service areas found for "{query}".
              </div>
            ) : (
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                {filteredZones.map((zone) => {
                  const zoneKey = zone.id || zone.name;
                  const isSelectingThisZone = loadingPlaceSelect && selectedZoneId === zoneKey;
                  return (
                    <button
                      key={zoneKey}
                      onClick={() => handleSelectZone(zone)}
                      disabled={loadingPlaceSelect}
                      className="w-full flex items-center justify-between p-3 hover:bg-slate-50 text-left transition-colors cursor-pointer group disabled:opacity-60"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100/80 group-hover:scale-105 transition-transform">
                          {isSelectingThisZone ? (
                            <LoaderCircle className="h-4 w-4 animate-spin text-emerald-600" />
                          ) : (
                            <MapPin className="h-4 w-4 text-emerald-600" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <span className="block text-xs font-bold text-slate-900 truncate group-hover:text-emerald-700 transition-colors">
                            {zone.name}
                          </span>
                          <span className="block text-[10px] font-medium text-slate-500 mt-0.5">
                            ⏱️ ETA {zone.etaMinutes || 20} mins • Base Fee: ₹{zone.basePickupCharge || 69}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-400 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* FOOTER */}
        <footer className="shrink-0 border-t border-slate-100 p-3 bg-slate-50/50 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] text-center">
          <p className="text-[10px] font-medium text-slate-500">
            Doorstep waste pickup active across Bengaluru service zones
          </p>
        </footer>
      </div>
    </div>
  );
}
