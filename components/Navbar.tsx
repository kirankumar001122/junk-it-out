'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { Bell, CircleUserRound, MapPin, Search, ShoppingBasket } from 'lucide-react';
import { pickupCartEvent, readPickupCart } from '@/lib/pickupCart';
import {
  clearSelectedLocation,
  getSelectedLocation,
  LOCATION_CHANGE_EVENT,
  setSelectedLocation,
} from '@/lib/selectedLocation';
import PickupCartDrawer from '@/components/PickupCartDrawer';
import LocationSearchModal from '@/components/LocationSearchModal';
import { getCachedClientJson } from '@/lib/clientRequestCache';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [locationOpen, setLocationOpen] = useState(false);
  const [location, setLocation] = useState<string>('Select location');
  const [cartCount, setCartCount] = useState(0);
  const [cartOpen, setCartOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    if (checkingAuth || !user) {
      setLocation('Select location');
      return;
    }

    const refreshLoc = (e?: Event) => {
      const customDetail = (e as CustomEvent)?.detail;
      if (customDetail?.area || customDetail?.address) {
        setLocation(customDetail.address || customDetail.area);
        return;
      }
      const loc = getSelectedLocation();
      if (loc?.area || loc?.address) {
        setLocation(loc.address || loc.area);
      } else {
        setLocation('Select location');
      }
    };
    refreshLoc();
    window.addEventListener(LOCATION_CHANGE_EVENT, refreshLoc as EventListener);
    window.addEventListener('storage', refreshLoc);
    return () => {
      window.removeEventListener(LOCATION_CHANGE_EVENT, refreshLoc as EventListener);
      window.removeEventListener('storage', refreshLoc);
    };
  }, [checkingAuth, user]);

  useEffect(() => {
    const refresh = () => setCartCount(readPickupCart().length);
    refresh();
    window.addEventListener(pickupCartEvent, refresh);
    return () => window.removeEventListener(pickupCartEvent, refresh);
  }, []);

  useEffect(() => {
    const checkAuth = async (force = false) => {
      setCheckingAuth(true);
      try {
        const data = await getCachedClientJson<any>(
          'authenticated-user',
          '/api/auth/me',
          10_000,
          { cache: 'no-store', force }
        );
        if (data.success && data.data?.user?.role === 'CUSTOMER') {
          setUser(data.data.user);
        } else {
          setUser(null);
          clearSelectedLocation();
        }
      } catch {
        setUser(null);
        clearSelectedLocation();
      } finally {
        setCheckingAuth(false);
      }
    };

    const handleAuthChange = (event: Event) => {
      if ((event as CustomEvent<{ type?: string }>).detail?.type === 'logout') {
        clearSelectedLocation();
        setLocation('Select location');
      }
      checkAuth(true);
    };
    checkAuth(true);
    window.addEventListener('jio_auth_change', handleAuthChange);
    return () => window.removeEventListener('jio_auth_change', handleAuthChange);
  }, []);

  const getDisplayName = (userObj: any) => {
    if (!userObj) return 'Account';
    if (userObj.name && typeof userObj.name === 'string') {
      const trimmed = userObj.name.trim();
      return trimmed || 'Account';
    }
    return 'Account';
  };

  if (pathname.startsWith('/admin') || pathname.startsWith('/agent')) return null;

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    router.push(value ? `/categories?q=${encodeURIComponent(value)}` : '/categories');
  };

  return (
    <>
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl transition-all">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 sm:gap-4 px-3 sm:px-6 py-2 sm:py-2.5">
        {/* Left: Brand Identity & Location */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Link href="/" prefetch className="flex shrink-0 items-center gap-2 transition-opacity hover:opacity-90" aria-label="Junk It Out home">
            <span className="relative grid h-9 w-9 sm:h-10 sm:w-10 place-items-center rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden shrink-0">
              <img src="/logo.png" alt="Junk It Out Logo" decoding="async" className="h-full w-full object-contain p-1" />
            </span>
            <span className="hidden text-base sm:text-lg font-bold tracking-tight text-slate-900 md:block">
              JUNK IT <span className="text-emerald-600 font-extrabold">OUT</span>
            </span>
          </Link>

          {/* Pickup location indicator & modal trigger */}
          <button
            type="button"
            onClick={() => setLocationOpen(true)}
            className="flex min-w-0 items-center gap-1.5 rounded-full bg-slate-50/90 px-2.5 py-1 sm:py-1.5 text-left border border-slate-200/90 max-w-[138px] min-[390px]:max-w-[165px] sm:max-w-[210px] md:max-w-[240px] shadow-sm hover:border-emerald-300 hover:bg-white transition-all active:scale-95 cursor-pointer"
            title={`Pickup Location: ${location}`}
            aria-label={`Change pickup location. Current location: ${location}`}
          >
            <MapPin className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 text-emerald-600" />
            <span className="min-w-0 flex-1 overflow-hidden">
              <span className="block text-[8px] sm:text-[9px] font-semibold uppercase tracking-wider text-slate-400 leading-none mb-0.5">Picking Up From</span>
              <span className="block truncate text-[11px] sm:text-xs font-bold text-slate-900 leading-tight">{location}</span>
            </span>
          </button>
        </div>

        {/* Center: Search input (desktop/tablet) */}
        <form onSubmit={submitSearch} className="relative hidden min-w-0 flex-1 max-w-md mx-4 sm:block">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search waste categories..."
            aria-label="Search waste categories"
            className="h-10 w-full min-w-0 rounded-full border border-slate-200 bg-slate-50/70 pl-10 pr-3 text-xs sm:text-sm font-medium text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
          />
        </form>

        {/* Right: Customer Actions */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
          <Link href="/customer/profile" prefetch className="hidden items-center gap-2 rounded-full border border-slate-200/70 bg-white/80 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-white hover:text-slate-900 hover:border-emerald-300 shadow-sm transition-all sm:flex active:scale-95">
            <CircleUserRound className="h-4.5 w-4.5 text-slate-600" />
            <span className="hidden lg:inline">{checkingAuth ? 'Account' : getDisplayName(user)}</span>
          </Link>

          <Link
            href="/customer/support"
            aria-label="Customer support"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-emerald-300 hover:text-emerald-700 active:scale-95 sm:h-10 sm:w-10"
          >
            <Bell className="h-4 w-4" />
          </Link>

          <span className="relative z-10 inline-flex shrink-0 overflow-visible isolate">
            <button
              onClick={() => setCartOpen(true)}
              className="btn-glossy-dark grid h-9 w-9 place-items-center rounded-full text-white shadow-lg shadow-slate-900/10 active:scale-95 sm:h-10 sm:w-10"
              aria-label={`Shopping cart, ${cartCount} ${cartCount === 1 ? 'item' : 'items'}`}
            >
              <ShoppingBasket className="h-4.5 w-4.5" />
            </button>
            {cartCount > 0 && (
              <span
                aria-live="polite"
                aria-label={`${cartCount} ${cartCount === 1 ? 'item' : 'items'} in cart`}
                className="pointer-events-none absolute -right-2 -top-2 z-20 grid h-6 min-w-6 place-items-center whitespace-nowrap rounded-full border-2 border-white bg-emerald-600 px-1.5 text-xs font-extrabold leading-none text-white shadow-lg"
              >
                {cartCount}
              </span>
            )}
          </span>
        </div>
      </div>

    </header>
    {/* Dialogs are rendered below the header so fixed positioning is relative to the viewport. */}
    <PickupCartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    <LocationSearchModal
      open={locationOpen}
      onClose={() => setLocationOpen(false)}
      currentArea={location}
      onSelectLocation={(data) => {
        setSelectedLocation(data);
        setLocation(data.area);
      }}
    />
    </>
  );
}
