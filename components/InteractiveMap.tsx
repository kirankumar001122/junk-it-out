'use client';

import { useEffect, useRef, useState } from 'react';

interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  title: string;
  subtitle?: string;
  type?: 'AGENT' | 'PICKUP' | 'ZONE';
  status?: string;
  vehicleNumber?: string;
}

interface MapProps {
  centerLat?: number;
  centerLng?: number;
  zoom?: number;
  markers?: MapMarker[];
  polygons?: { name: string; coordinates: ({ lat: number; lng: number } | [number, number])[] }[];
  routePoints?: { lat: number; lng: number }[];
  onLocationSelect?: (lat: number, lng: number) => void;
  onGoogleReady?: (maps: any) => void;
  className?: string;
}

declare global {
  interface Window {
    google?: any;
    __junkItOutGoogleMapsPromise?: Promise<any>;
    gm_authFailure?: () => void;
  }
}

export function loadGoogleMaps(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Window is undefined.'));
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
  if (window.__junkItOutGoogleMapsPromise) return window.__junkItOutGoogleMapsPromise;

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey.includes('YOUR_GOOGLE_MAPS_API_KEY')) {
    return Promise.reject(
      new Error('Google Maps API key is missing or not configured. Please set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.')
    );
  }

  window.__junkItOutGoogleMapsPromise = new Promise((resolve, reject) => {
    let timeoutId: NodeJS.Timeout;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
    };

    // Listen for Google Maps auth failure (invalid key / domain restricted)
    window.gm_authFailure = () => {
      cleanup();
      window.__junkItOutGoogleMapsPromise = undefined;
      reject(new Error('Google Maps API authentication failed. Check your API key restrictions or billing status.'));
    };

    const existingScript = document.getElementById('junk-it-out-google-maps') as HTMLScriptElement | null;
    if (existingScript) {
      if (window.google?.maps?.Map) {
        resolve(window.google.maps);
        return;
      }
      // Poll briefly if script element exists
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (window.google?.maps?.Map) {
          clearInterval(interval);
          cleanup();
          resolve(window.google.maps);
        } else if (attempts > 30) {
          clearInterval(interval);
          cleanup();
          window.__junkItOutGoogleMapsPromise = undefined;
          reject(new Error('Google Maps script exists but failed to initialize.'));
        }
      }, 300);
      return;
    }

    const script = document.createElement('script');
    script.id = 'junk-it-out-google-maps';
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey.trim())}&libraries=places&v=weekly`;

    script.onload = () => {
      cleanup();
      if (window.google?.maps?.Map) {
        resolve(window.google.maps);
      } else {
        window.__junkItOutGoogleMapsPromise = undefined;
        reject(new Error('Google Maps SDK script loaded but maps object is undefined.'));
      }
    };

    script.onerror = () => {
      cleanup();
      window.__junkItOutGoogleMapsPromise = undefined;
      reject(new Error('Failed to load Google Maps script. Check your internet connection or ad-blocker.'));
    };

    // 12-second safeguard timeout
    timeoutId = setTimeout(() => {
      if (!window.google?.maps?.Map) {
        window.__junkItOutGoogleMapsPromise = undefined;
        reject(new Error('Google Maps loading timed out after 12 seconds.'));
      }
    }, 12000);

    document.head.appendChild(script);
  });

  return window.__junkItOutGoogleMapsPromise;
}

export default function InteractiveMap({
  centerLat = 12.9716,
  centerLng = 77.5946,
  zoom = 13,
  markers = [],
  polygons = [],
  routePoints = [],
  onLocationSelect,
  onGoogleReady,
  className = 'h-80 w-full rounded-2xl overflow-hidden shadow-md border border-slate-200',
}: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !containerRef.current) return;
        mapRef.current = new maps.Map(containerRef.current, {
          center: { lat: centerLat, lng: centerLng },
          zoom,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        mapRef.current.addListener('click', (event: any) =>
          onLocationSelect?.(event.latLng.lat(), event.latLng.lng())
        );
        setStatus('ready');
        onGoogleReady?.(maps);
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(reason.message || 'Google Maps could not be loaded.');
          setStatus('error');
        }
      });

    return () => {
      cancelled = true;
      overlaysRef.current.forEach((overlay) => overlay.setMap?.(null));
      overlaysRef.current = [];
    };
  }, []);

  useEffect(() => {
    const maps = window.google?.maps;
    const map = mapRef.current;
    if (!maps || !map || status !== 'ready') return;

    map.setCenter({ lat: centerLat, lng: centerLng });
    map.setZoom(zoom);

    overlaysRef.current.forEach((overlay) => overlay.setMap?.(null));
    const overlays: any[] = [];

    polygons.forEach((polygon) =>
      overlays.push(
        new maps.Polygon({
          paths: polygon.coordinates.map((point) =>
            Array.isArray(point) ? { lat: point[0], lng: point[1] } : point
          ),
          strokeColor: '#16a34a',
          strokeOpacity: 0.9,
          strokeWeight: 2,
          fillColor: '#22c55e',
          fillOpacity: 0.15,
          map,
        })
      )
    );

    if (routePoints.length > 1) {
      overlays.push(
        new maps.Polyline({
          path: routePoints,
          strokeColor: '#0284c7',
          strokeOpacity: 1,
          strokeWeight: 4,
          map,
        })
      );
    }

    markers.forEach((item) => {
      const marker = new maps.Marker({
        position: { lat: item.lat, lng: item.lng },
        map,
        title: item.title,
        draggable: item.type === 'PICKUP',
      });
      marker.addListener('dragend', (event: any) =>
        onLocationSelect?.(event.latLng.lat(), event.latLng.lng())
      );
      overlays.push(marker);
    });

    overlaysRef.current = overlays;
  }, [centerLat, centerLng, zoom, markers, polygons, routePoints, status, onLocationSelect]);

  return (
    <div className={`${className} relative min-h-[300px]`}>
      <div ref={containerRef} className="h-full min-h-[300px] w-full" />
      {status === 'loading' && (
        <div className="absolute inset-0 grid place-items-center bg-slate-100/90 backdrop-blur-xs text-xs font-bold text-slate-600">
          <div className="flex items-center gap-2">
            <span className="h-4 w-4 rounded-full border-2 border-emerald-600 border-t-transparent animate-spin" />
            Loading Google Maps…
          </div>
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 grid place-items-center bg-amber-50 p-6 text-center text-xs font-bold text-amber-900 border border-amber-200 rounded-2xl">
          <div className="space-y-2 max-w-sm">
            <p className="text-sm font-black text-amber-800">📍 Map View Unavailable</p>
            <p className="text-slate-600 font-medium">{error}</p>
            <p className="text-[11px] text-slate-500 font-semibold pt-1">
              You can still search your location or choose popular Bengaluru hubs directly.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
