'use client';

import { useState, useEffect } from 'react';
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
  X,
} from 'lucide-react';

export default function AdminSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleOpen = () => setMobileOpen(true);
    const handleClose = () => setMobileOpen(false);
    window.addEventListener('jio_admin_sidebar_open', handleOpen);
    window.addEventListener('jio_admin_sidebar_close', handleClose);
    return () => {
      window.removeEventListener('jio_admin_sidebar_open', handleOpen);
      window.removeEventListener('jio_admin_sidebar_close', handleClose);
    };
  }, []);

  // Keyboard accessibility: Escape key dismisses mobile drawer
  useEffect(() => {
    if (!mobileOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen]);

  // Lock background scroll when mobile drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  // Close mobile drawer when pathname changes
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const menuItems = [
    { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/admin/orders', label: 'Orders Management', icon: Package },
    { href: '/admin/live-map', label: 'Live Agent Map', icon: Map },
    { href: '/admin/agents', label: 'Field Agents', icon: Users },
    { href: '/admin/customers', label: 'Customers Roster', icon: UserCheck },
    { href: '/admin/waste-categories', label: 'Waste Categories', icon: Trash2 },
    { href: '/admin/pricing', label: 'Pricing & Rates', icon: Tag },
    { href: '/admin/service-areas', label: 'Service Areas', icon: Globe },
    { href: '/admin/payments', label: 'Payments & Settlement', icon: CreditCard },
    { href: '/admin/complaints', label: 'Support & Complaints', icon: AlertCircle },
    { href: '/admin/coupons', label: 'Coupons & Promos', icon: Ticket },
    { href: '/admin/reports', label: 'Reports & Analytics', icon: FileBarChart },
    { href: '/admin/notifications', label: 'System Alerts & Logs', icon: Bell },
    { href: '/admin/admin-users', label: 'Admin Users Roster', icon: UserCog },
    { href: '/admin/audit-logs', label: 'Audit Trail Logs', icon: History },
    { href: '/admin/settings', label: 'API & Business Settings', icon: Settings },
  ];

  const navContent = (
    <>
      {/* Admin Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-slate-800 p-0.5 flex items-center justify-center border border-slate-700 overflow-hidden shrink-0">
            <img src="/logo.png" alt="Junk It Out Logo" decoding="async" className="w-full h-full object-contain" />
          </div>
          <div>
            <h2 className="font-extrabold text-white text-sm tracking-tight">Admin Operations</h2>
            <p className="text-[10px] text-emerald-400 font-bold uppercase">Bengaluru Hub</p>
          </div>
        </div>
        {/* Mobile close button */}
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
          aria-label="Close sidebar menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1 text-xs font-semibold scrollbar-none">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === '/admin'
              ? pathname === '/admin'
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
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

      {/* Footer Back Link */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/40">
        <Link
          href="/"
          onClick={() => setMobileOpen(false)}
          className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-emerald-400" />
          Return to Customer Site
        </Link>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Static Sidebar */}
      <aside className="hidden md:flex w-64 bg-slate-900 text-slate-300 min-h-screen flex-col border-r border-slate-800 shrink-0 sticky top-0 h-screen overflow-hidden">
        {navContent}
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Admin Navigation Menu"
          className="fixed inset-0 z-50 flex md:hidden"
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity cursor-pointer"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          {/* Slide-in sidebar drawer */}
          <aside className="relative w-72 max-w-[85vw] bg-slate-900 text-slate-300 h-full flex flex-col border-r border-slate-800 shadow-2xl z-10 animate-slide-in-right">
            {navContent}
          </aside>
        </div>
      )}
    </>
  );
}
