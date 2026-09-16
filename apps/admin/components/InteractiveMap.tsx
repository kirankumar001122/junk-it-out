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

    window.gm_authFailure = () => {
      cleanup();
      window.__junkItOutGoogleMapsPromise = undefined;
      reject(new Error('Google Maps API authentication failed. Check your API key restrictions or billing status.'));
    };

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry,drawing`;
    script.async = true;
    script.defer = true;

    script.onload = () => {
      cleanup();
      if (window.google?.maps?.Map) {
        resolve(window.google.maps);
      } else {
        window.__junkItOutGoogleMapsPromise = undefined;
        reject(new Error('Google Maps loaded but maps.Map symbol is unavailable.'));
      }
    };

    script.onerror = () => {
      cleanup();
      window.__junkItOutGoogleMapsPromise = undefined;
      reject(new Error('Failed to load Google Maps script. Check network connection or API key.'));
    };

    timeoutId = setTimeout(() => {
      if (!window.google?.maps?.Map) {
        window.__junkItOutGoogleMapsPromise = undefined;
        reject(new Error('Google Maps API script load timed out after 12 seconds.'));
      }
    }, 12000);

    document.head.appendChild(script);
  });

  return window.__junkItOutGoogleMapsPromise;
}

export default function InteractiveMap({
  centerLat = 12.9077,
  centerLng = 77.5854,
  zoom = 13,
  markers = [],
  polygons = [],
  routePoints = [],
  onLocationSelect,
  onGoogleReady,
  className = 'h-96 w-full rounded-2xl border border-slate-200 overflow-hidden shadow-inner',
}: MapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const polygonsRef = useRef<any[]>([]);
  const polylineRef = useRef<any>(null);

  const [mapError, setMapError] = useState<string | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;

    loadGoogleMaps()
      .then((maps) => {
        if (!isMounted || !mapContainerRef.current) return;

        if (!mapInstanceRef.current) {
          const map = new maps.Map(mapContainerRef.current, {
            center: { lat: centerLat, lng: centerLng },
            zoom: zoom,
            mapTypeId: 'roadmap',
            disableDefaultUI: false,
            zoomControl: true,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: true,
            styles: [
              { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
              { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
            ],
          });

          mapInstanceRef.current = map;

          if (onLocationSelect) {
            map.addListener('click', (e: any) => {
              if (e.latLng) {
                onLocationSelect(e.latLng.lat(), e.latLng.lng());
              }
            });
          }

          if (onGoogleReady) {
            onGoogleReady(maps);
          }
        } else {
          mapInstanceRef.current.setCenter({ lat: centerLat, lng: centerLng });
          mapInstanceRef.current.setZoom(zoom);
        }

        setMapLoaded(true);
      })
      .catch((err: Error) => {
        if (!isMounted) return;
        setMapError(err.message || 'Failed to render Google Map.');
      });

    return () => {
      isMounted = false;
    };
  }, [centerLat, centerLng, zoom]);

  // Update Markers
  useEffect(() => {
    if (!mapLoaded || !mapInstanceRef.current || !window.google?.maps) return;
    const maps = window.google.maps;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    markers.forEach((m) => {
      const marker = new maps.Marker({
        position: { lat: m.lat, lng: m.lng },
        map: mapInstanceRef.current,
        title: m.title,
      });

      if (m.subtitle || m.status) {
        const infoWindow = new maps.InfoWindow({
          content: `
            <div style="font-family: sans-serif; padding: 4px;">
              <strong style="font-size: 12px; color: #0f172a;">${m.title}</strong>
              ${m.subtitle ? `<p style="margin: 2px 0 0 0; font-size: 11px; color: #475569;">${m.subtitle}</p>` : ''}
            </div>
          `,
        });
        marker.addListener('click', () => {
          infoWindow.open(mapInstanceRef.current, marker);
        });
      }

      markersRef.current.push(marker);
    });
  }, [mapLoaded, markers]);

  return (
    <div className={`relative ${className}`}>
      <div ref={mapContainerRef} className="w-full h-full" />
      {mapError && (
        <div className="absolute inset-0 bg-slate-900/90 text-white flex flex-col items-center justify-center p-4 text-center">
          <p className="text-xs font-bold text-rose-400">Map Error</p>
          <p className="text-xs text-slate-300 mt-1">{mapError}</p>
        </div>
      )}
    </div>
  );
}
