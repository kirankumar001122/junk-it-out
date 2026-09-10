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
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-3 py-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom,0px))] shadow-lg">
      <div className="flex items-center justify-around">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = pathname === link.href;

          if (link.highlight) {
            return (
              <Link
                key={link.href}
                href={link.href}
                className="flex flex-col items-center justify-center -mt-5"
              >
                <div className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-600/30 border-4 border-white">
                  <Icon className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-bold text-emerald-700 mt-0.5">{link.label}</span>
              </Link>
            );
          }

          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex flex-col items-center justify-center py-1 px-2 rounded-lg transition-colors ${
                isActive ? 'text-emerald-600 font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] mt-0.5">{link.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
