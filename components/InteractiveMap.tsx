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
  orderId?: string;
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

    const infoWindow = new maps.InfoWindow();
    overlays.push(infoWindow);

    markers.forEach((item) => {
      const isAgent = item.type === 'AGENT';

      const agentSvg = encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="38" height="38" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="11" fill="#059669" stroke="#ffffff" stroke-width="2"/>
          <path d="M14 14V8a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1v6" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round"/>
          <path d="M14 10h3l2 2v2h-5" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round"/>
          <circle cx="8" cy="15" r="1.5" fill="#ffffff"/>
          <circle cx="16" cy="15" r="1.5" fill="#ffffff"/>
        </svg>
      `);

      const pickupSvg = encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="11" fill="#2563eb" stroke="#ffffff" stroke-width="2"/>
          <path d="M7 8h10l1 7H6z" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M10 8V6a2 2 0 0 1 4 0v2" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round"/>
        </svg>
      `);

      const marker = new maps.Marker({
        position: { lat: item.lat, lng: item.lng },
        map,
        title: item.title,
        draggable: item.type === 'PICKUP' && Boolean(onLocationSelect),
        icon: {
          url: `data:image/svg+xml;charset=UTF-8,${isAgent ? agentSvg : pickupSvg}`,
          scaledSize: new maps.Size(isAgent ? 34 : 30, isAgent ? 34 : 30),
          anchor: new maps.Point(isAgent ? 17 : 15, isAgent ? 17 : 15),
        },
      });

      const popupContent = `
        <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 4px 6px; min-width: 190px; max-width: 260px; color: #0f172a;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px;">
            <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; padding: 2px 8px; border-radius: 9999px; background: ${isAgent ? '#d1fae5' : '#dbeafe'}; color: ${isAgent ? '#065f46' : '#1e40af'};">
              ${isAgent ? 'Field Agent' : 'Pickup Order'}
            </span>
            ${item.status ? `<span style="font-size: 10px; font-weight: 800; color: #475569; background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${item.status}</span>` : ''}
          </div>
          <div style="font-size: 13px; font-weight: 800; color: #0f172a; line-height: 1.3; margin-bottom: 3px;">
            ${item.title}
          </div>
          ${item.subtitle ? `<div style="font-size: 11px; color: #64748b; line-height: 1.35; margin-bottom: 4px;">${item.subtitle}</div>` : ''}
          ${item.orderId ? `
            <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #e2e8f0;">
              <a href="/admin/orders/${item.orderId}" style="font-size: 11px; font-weight: 700; color: #059669; text-decoration: none;">
                Open Order Details &rarr;
              </a>
            </div>
          ` : ''}
        </div>
      `;

      marker.addListener('click', () => {
        infoWindow.setContent(popupContent);
        infoWindow.open(map, marker);
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
