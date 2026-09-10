'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard } from 'lucide-react';

export default function AgentBottomNav() {
  const pathname = usePathname();

  // Only render inside /agent paths
  if (!pathname.startsWith('/agent')) return null;

  const links = [{ href: '/agent', label: 'Dashboard', icon: LayoutDashboard }];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900 text-white border-t border-slate-800 px-3 py-2 shadow-2xl">
      <div className="flex items-center justify-around">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = pathname === link.href;

          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all ${
                isActive
                  ? 'text-emerald-400 bg-slate-800/80 font-bold scale-105'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] mt-1 tracking-tight">{link.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
