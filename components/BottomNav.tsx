'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, PackageCheck, Search, ShoppingBasket, User } from 'lucide-react';

export default function BottomNav() {
  const pathname = usePathname();

  const links = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/categories', label: 'Categories', icon: Search },
    { href: '/book?cart=1', label: 'Pickup Cart', icon: ShoppingBasket, highlight: true },
    { href: '/customer/orders', label: 'Pickups', icon: PackageCheck },
    { href: '/customer/profile', label: 'Profile', icon: User },
  ];

  // Don't render on Admin or Agent views
  if (pathname.startsWith('/admin') || pathname.startsWith('/agent')) return null;

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/80 px-2 py-1 pb-[calc(0.25rem+env(safe-area-inset-bottom,0px))] shadow-md">
      <div className="flex items-center justify-around">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = pathname === link.href;

          if (link.highlight) {
            return (
              <Link
                key={link.href}
                href={link.href}
                className="flex flex-col items-center justify-center -mt-4 group"
              >
                <div className="w-11 h-11 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-md shadow-slate-900/20 border-2 border-white group-active:scale-95 transition-transform">
                  <Icon className="w-5 h-5 text-emerald-400" />
                </div>
                <span className="text-[10px] font-bold text-slate-900 mt-0.5">{link.label}</span>
              </Link>
            );
          }

          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all ${
                isActive ? 'text-emerald-700 font-bold bg-emerald-50/60' : 'text-slate-500 font-medium hover:text-slate-900'
              }`}
            >
              <Icon className="w-4.5 h-4.5" />
              <span className="text-[10px] mt-0.5">{link.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
