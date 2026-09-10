'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { CircleUserRound, MapPin, Search, ShoppingBasket } from 'lucide-react';
import { pickupCartEvent, readPickupCart } from '@/lib/pickupCart';
import PickupCartDrawer from '@/components/PickupCartDrawer';
import LocationSearchModal from '@/components/LocationSearchModal';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [locationOpen, setLocationOpen] = useState(false);
  const [location, setLocation] = useState('Whitefield, Bengaluru');
  const [cartCount, setCartCount] = useState(0);
  const [cartOpen, setCartOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

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
    <header className="sticky top-0 z-50 border-b border-emerald-100 bg-white/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Junk It Out home">
          <span className="relative grid h-10 w-10 place-items-center rounded-2xl bg-white border border-emerald-100/80 shadow-md shadow-emerald-600/10 overflow-hidden">
            <img src="/logo.png" alt="Junk It Out Logo" className="h-full w-full object-contain p-0.5" />
          </span>
          <span className="hidden text-lg font-black tracking-tight text-slate-950 sm:block">
            JUNK IT <em className="not-italic text-emerald-600">OUT</em>
          </span>
        </Link>

        {/* Location selector trigger */}
        <button
          onClick={() => setLocationOpen(true)}
          className="hidden min-w-0 items-center gap-2 rounded-xl px-2.5 py-1.5 text-left hover:bg-slate-100/80 transition-colors md:flex border border-slate-200/80"
          aria-label="Change pickup location"
        >
          <MapPin className="h-4 w-4 shrink-0 text-emerald-600" />
          <span className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Picking up from</span>
            <span className="block max-w-36 truncate text-xs font-black text-slate-900">{location}</span>
          </span>
        </button>

        {/* Search input */}
        <form onSubmit={submitSearch} className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search paper, plastic, e-waste..."
            className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm font-medium outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
          />
        </form>

        <button
          onClick={() => setLocationOpen(true)}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700 md:hidden"
          aria-label="Choose location"
        >
          <MapPin className="h-5 w-5" />
        </button>

        <Link href="/customer/profile" className="hidden items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 sm:flex">
          <CircleUserRound className="h-5 w-5" />
          <span className="hidden lg:inline">{checkingAuth ? 'Account' : getDisplayName(user)}</span>
        </Link>

        <button
          onClick={() => setCartOpen(true)}
          className="relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-900/15"
          aria-label="Open pickup cart"
        >
          <ShoppingBasket className="h-5 w-5" />
          {cartCount > 0 && (
            <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-emerald-500 px-1 text-[10px] font-black text-slate-950">
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
          setLocation(data.area);
        }}
      />

      <PickupCartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </header>
  );
}
