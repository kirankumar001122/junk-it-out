'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, LogOut, User } from 'lucide-react';

export default function AdminHeader() {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/admin/login');
    } catch (e) {
      console.error('Logout error:', e);
      router.push('/admin/login');
    }
  };

  return (
    <header className="bg-slate-900 text-white px-6 py-3.5 rounded-2xl shadow-md flex items-center justify-between gap-4 mb-6 border border-slate-800">
      {/* Left: Branding/Hub Title */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30 font-black text-xs">
          HQ
        </div>
        <div>
          <h2 className="text-sm font-extrabold tracking-tight text-white flex items-center gap-2">
            Bengaluru Control Hub
            <span className="text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded-full uppercase">
              Live
            </span>
          </h2>
          <p className="text-[11px] text-slate-400">Junk It Out Operations & Command Center</p>
        </div>
      </div>

      {/* Right: Actions (Notifications, Profile, Logout) */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin/notifications"
          className="relative p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700"
          title="System Alerts & Notifications"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-slate-900" />
        </Link>

        {/* Admin Profile */}
        <div className="hidden sm:flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700">
          <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
            <User className="w-4 h-4" />
          </div>
          <div className="text-left">
            <span className="block text-xs font-extrabold text-white leading-none">DARSHAN TEJOMAYA M</span>
            <span className="text-[10px] text-emerald-400 font-semibold">Operations Lead</span>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800/80 text-xs font-bold transition-colors"
          title="Logout Admin Session"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}
