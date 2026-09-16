'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Package,
  Map,
  Users,
  UserCheck,
  Trash2,
  Tag,
  Globe,
  CreditCard,
  AlertCircle,
  Ticket,
  FileBarChart,
  Bell,
  Settings,
  History,
  ArrowLeft,
  UserCog,
} from 'lucide-react';

export default function AdminSidebar() {
  const pathname = usePathname();
  const customerSiteUrl = process.env.NEXT_PUBLIC_CUSTOMER_SITE_URL || 'https://www.junkitout.in';

  const menuItems = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/orders', label: 'Orders Management', icon: Package },
    { href: '/live-map', label: 'Live Agent Map', icon: Map },
    { href: '/agents', label: 'Field Agents', icon: Users },
    { href: '/customers', label: 'Customers Roster', icon: UserCheck },
    { href: '/waste-categories', label: 'Waste Categories', icon: Trash2 },
    { href: '/pricing', label: 'Pricing & Rates', icon: Tag },
    { href: '/service-areas', label: 'Service Areas', icon: Globe },
    { href: '/payments', label: 'Payments & Settlement', icon: CreditCard },
    { href: '/complaints', label: 'Support & Complaints', icon: AlertCircle },
    { href: '/coupons', label: 'Coupons & Promos', icon: Ticket },
    { href: '/reports', label: 'Reports & Analytics', icon: FileBarChart },
    { href: '/notifications', label: 'System Alerts & Logs', icon: Bell },
    { href: '/admin-users', label: 'Admin Users Roster', icon: UserCog },
    { href: '/audit-logs', label: 'Audit Trail Logs', icon: History },
    { href: '/settings', label: 'API & Business Settings', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 min-h-screen flex flex-col border-r border-slate-800 shrink-0 sticky top-0 h-screen overflow-hidden">
      {/* Admin Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-slate-800 p-0.5 flex items-center justify-center border border-slate-700 overflow-hidden font-black text-emerald-400 text-xs">
            JIO
          </div>
          <div>
            <h2 className="font-extrabold text-white text-sm tracking-tight">Admin Operations</h2>
            <p className="text-[10px] text-emerald-400 font-bold uppercase">Bengaluru Hub</p>
          </div>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1 text-xs font-semibold scrollbar-none">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === '/'
              ? pathname === '/' || pathname === '/admin'
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all ${
                isActive
                  ? 'bg-emerald-600 text-white font-bold shadow-md shadow-emerald-600/20'
                  : 'hover:bg-slate-800/80 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer Return Link */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/40">
        <a
          href={customerSiteUrl}
          className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-emerald-400" />
          Return to Customer Site
        </a>
      </div>
    </aside>
  );
}
