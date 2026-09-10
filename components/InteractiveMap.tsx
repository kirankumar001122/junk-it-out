'use client';

import { useEffect, useRef, useState } from 'react';

interface MapMarker { id: string; lat: number; lng: number; title: string; subtitle?: string; type?: 'AGENT' | 'PICKUP' | 'ZONE'; status?: string; vehicleNumber?: string; }
interface MapProps { centerLat?: number; centerLng?: number; zoom?: number; markers?: MapMarker[]; polygons?: { name: string; coordinates: ({ lat: number; lng: number } | [number, number])[] }[]; routePoints?: { lat: number; lng: number }[]; onLocationSelect?: (lat: number, lng: number) => void; onGoogleReady?: (maps: any) => void; className?: string; }

declare global { interface Window { google?: any; __junkItOutGoogleMapsPromise?: Promise<any> } }

function loadGoogleMaps() {
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
  if (window.__junkItOutGoogleMapsPromise) return window.__junkItOutGoogleMapsPromise;
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return Promise.reject(new Error('Google Maps is not configured.'));
  window.__junkItOutGoogleMapsPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById('junk-it-out-google-maps');
    if (existing) {
      existing.addEventListener('load', () => window.google?.maps ? resolve(window.google.maps) : reject(new Error('Google Maps did not initialise.')), { once: true });
      existing.addEventListener('error', () => reject(new Error('Google Maps could not be loaded.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.id = 'junk-it-out-google-maps'; script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&v=weekly`;
    script.onload = () => window.google?.maps ? resolve(window.google.maps) : reject(new Error('Google Maps did not initialise.'));
    script.onerror = () => reject(new Error('Google Maps could not be loaded. Check your connection and API restrictions.'));
    document.head.appendChild(script);
  });
  return window.__junkItOutGoogleMapsPromise;
}

export default function InteractiveMap({ centerLat = 12.9716, centerLng = 77.5946, zoom = 13, markers = [], polygons = [], routePoints = [], onLocationSelect, onGoogleReady, className = 'h-80 w-full rounded-2xl overflow-hidden shadow-md border border-slate-200' }: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null); const mapRef = useRef<any>(null); const overlaysRef = useRef<any[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading'); const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then((maps) => {
      if (cancelled || !containerRef.current) return;
      mapRef.current = new maps.Map(containerRef.current, { center: { lat: centerLat, lng: centerLng }, zoom, mapTypeControl: false, streetViewControl: false, fullscreenControl: false });
      mapRef.current.addListener('click', (event: any) => onLocationSelect?.(event.latLng.lat(), event.latLng.lng()));
      setStatus('ready'); onGoogleReady?.(maps);
    }).catch((reason) => { if (!cancelled) { setError(reason.message || 'Google Maps could not be loaded.'); setStatus('error'); } });
    return () => { cancelled = true; overlaysRef.current.forEach((overlay) => overlay.setMap?.(null)); overlaysRef.current = []; };
  }, []);
  useEffect(() => {
    const maps = window.google?.maps; const map = mapRef.current;
    if (!maps || !map || status !== 'ready') return;
    map.setCenter({ lat: centerLat, lng: centerLng }); map.setZoom(zoom);
    overlaysRef.current.forEach((overlay) => overlay.setMap?.(null)); const overlays: any[] = [];
    polygons.forEach((polygon) => overlays.push(new maps.Polygon({ paths: polygon.coordinates.map((point) => Array.isArray(point) ? { lat: point[0], lng: point[1] } : point), strokeColor: '#16a34a', strokeOpacity: 0.9, strokeWeight: 2, fillColor: '#22c55e', fillOpacity: 0.15, map })));
    if (routePoints.length > 1) overlays.push(new maps.Polyline({ path: routePoints, strokeColor: '#0284c7', strokeOpacity: 1, strokeWeight: 4, map }));
    markers.forEach((item) => { const marker = new maps.Marker({ position: { lat: item.lat, lng: item.lng }, map, title: item.title, draggable: item.type === 'PICKUP' }); marker.addListener('dragend', (event: any) => onLocationSelect?.(event.latLng.lat(), event.latLng.lng())); overlays.push(marker); });
    overlaysRef.current = overlays;
  }, [centerLat, centerLng, zoom, markers, polygons, routePoints, status, onLocationSelect]);
  return <div className={`${className} relative min-h-[300px]`}><div ref={containerRef} className="h-full min-h-[300px] w-full" />{status === 'loading' && <div className="absolute inset-0 grid place-items-center bg-slate-100 text-xs font-bold text-slate-500">Loading Google Maps…</div>}{status === 'error' && <div className="absolute inset-0 grid place-items-center bg-rose-50 p-5 text-center text-sm font-bold text-rose-700">{error}</div>}</div>;
}
