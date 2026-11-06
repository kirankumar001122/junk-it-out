'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Bell, LogOut, User } from 'lucide-react';
import { adminFetch } from '@/lib/api';

let cachedAdminProfile: { name: string; department: string } | null = null;

interface AdminHeaderProps {
  initialUser?: {
    name?: string;
    department?: string;
  };
}

export default function AdminHeader({ initialUser }: AdminHeaderProps = {}) {
  const router = useRouter();
  const [adminName, setAdminName] = useState(initialUser?.name || cachedAdminProfile?.name || 'Admin User');
  const [department, setDepartment] = useState(initialUser?.department || cachedAdminProfile?.department || 'Operations Lead');

  useEffect(() => {
    if (initialUser?.name) {
      cachedAdminProfile = {
        name: initialUser.name,
        department: initialUser.department || 'Operations Lead',
      };
      setAdminName(initialUser.name);
      setDepartment(initialUser.department || 'Operations Lead');
      return;
    }
    if (cachedAdminProfile) return;
    let isMounted = true;
    adminFetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (isMounted && d.success && d.data?.user) {
          const name = d.data.user.name || 'Admin User';
          const dept = d.data.user.admin?.department || d.data.user.role || 'Operations Lead';
          cachedAdminProfile = { name, department: dept };
          setAdminName(name);
          setDepartment(dept);
        }
      })
      .catch(() => {});
    return () => { isMounted = false; };
  }, [initialUser]);

  const handleLogout = async () => {
    cachedAdminProfile = null;
    try {
      await adminFetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login';
    } catch (e) {
      console.error('Logout error:', e);
      window.location.href = '/login';
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
          href="/notifications"
          className="relative p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700"
          title="System Alerts & Notifications"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-slate-900" />
        </Link>

        {/* Admin Profile */}
        <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700">
          <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
            <User className="w-4 h-4" />
          </div>
          <div className="text-left">
            <span className="block text-xs font-extrabold text-white leading-none">{adminName}</span>
            <span className="text-[10px] text-emerald-400 font-semibold">{department}</span>
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
