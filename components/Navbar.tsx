'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { CircleUserRound, MapPin, Search, ShoppingBasket } from 'lucide-react';
import { pickupCartEvent, readPickupCart } from '@/lib/pickupCart';
import { getSelectedLocation, LOCATION_CHANGE_EVENT, setSelectedLocation } from '@/lib/selectedLocation';
import PickupCartDrawer from '@/components/PickupCartDrawer';
import LocationSearchModal from '@/components/LocationSearchModal';

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
    const refreshLoc = () => {
      const loc = getSelectedLocation();
      if (loc?.area) {
        setLocation(loc.area);
      } else {
        setLocation('Select location');
      }
    };
    refreshLoc();
    window.addEventListener(LOCATION_CHANGE_EVENT, refreshLoc);
    return () => window.removeEventListener(LOCATION_CHANGE_EVENT, refreshLoc);
  }, []);

  useEffect(() => {
    const refresh = () => setCartCount(readPickupCart().length);
    refresh();
    window.addEventListener(pickupCartEvent, refresh);
    return () => window.removeEventListener(pickupCartEvent, refresh);
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      setCheckingAuth(true);
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (res.ok && data.success && data.data?.user?.role === 'CUSTOMER') {
          setUser(data.data.user);
        } else {
          setUser(null);
        }
      } catch {
        setUser(null);
      } finally {
        setCheckingAuth(false);
      }
    };

    checkAuth();
    window.addEventListener('jio_auth_change', checkAuth);
    return () => window.removeEventListener('jio_auth_change', checkAuth);
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
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-md transition-all">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 transition-opacity hover:opacity-90" aria-label="Junk It Out home">
          <span className="relative grid h-10 w-10 place-items-center rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden shrink-0">
            <img src="/logo.png" alt="Junk It Out Logo" className="h-full w-full object-contain p-1" />
          </span>
          <span className="hidden text-lg font-bold tracking-tight text-slate-900 sm:block">
            JUNK IT <span className="text-emerald-600 font-extrabold">OUT</span>
          </span>
        </Link>

        {/* Location selector trigger */}
        <button
          onClick={() => setLocationOpen(true)}
          className="hidden min-w-0 items-center gap-2 rounded-xl bg-slate-50/80 px-3 py-1.5 text-left border border-slate-200/90 hover:bg-slate-100/90 hover:border-slate-300 transition-all md:flex group cursor-pointer"
          aria-label="Change pickup location"
        >
          <MapPin className="h-4 w-4 shrink-0 text-emerald-600 transition-transform group-hover:scale-110" />
          <span className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 leading-tight">Pickup Location</span>
            <span className="block max-w-36 truncate text-xs font-bold text-slate-900 leading-tight">{location}</span>
          </span>
        </button>

        {/* Search input */}
        <form onSubmit={submitSearch} className="relative min-w-0 flex-1 max-w-md mx-auto">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search waste categories (paper, metal, e-waste...)"
            className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-10 pr-3 text-xs sm:text-sm font-medium text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
          />
        </form>

        <button
          onClick={() => setLocationOpen(true)}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors md:hidden"
          aria-label="Choose location"
        >
          <MapPin className="h-4.5 w-4.5" />
        </button>

        <Link href="/customer/profile" className="hidden items-center gap-2 rounded-xl border border-transparent px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors sm:flex">
          <CircleUserRound className="h-4.5 w-4.5 text-slate-600" />
          <span className="hidden lg:inline">{checkingAuth ? 'Account' : getDisplayName(user)}</span>
        </Link>

        <button
          onClick={() => setCartOpen(true)}
          className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-all shadow-sm active:scale-95"
          aria-label="Open pickup cart"
        >
          <ShoppingBasket className="h-4.5 w-4.5" />
          {cartCount > 0 && (
            <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-slate-950 shadow-sm animate-scale-in">
              {cartCount}
            </span>
          )}
        </button>
      </div>

      <LocationSearchModal
        open={locationOpen}
        onClose={() => setLocationOpen(false)}
        currentArea={location}
        onSelectLocation={(data) => {
          setSelectedLocation(data);
          setLocation(data.area);
        }}
      />

      <PickupCartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </header>
  );
}
