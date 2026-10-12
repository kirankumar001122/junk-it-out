'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  User,
  Phone,
  Mail,
  MapPin,
  Package,
  Ticket,
  AlertCircle,
  LogOut,
  ChevronRight,
  ShieldCheck,
  LoaderCircle,
  Smartphone,
  CheckCircle2,
} from 'lucide-react';
import CustomerOtpLogin from '@/components/CustomerOtpLogin';

export default function CustomerProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isCustomer, setIsCustomer] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutSuccess, setLogoutSuccess] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  const fetchAuthUser = useCallback(async () => {
    setCheckingAuth(true);
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      console.log('[PROFILE] Auth user response:', data);
      if (res.ok && data.success && data.data?.user?.role === 'CUSTOMER') {
        console.log('[PROFILE] Setting user with name:', data.data.user.name);
        setUser(data.data.user);
        setIsCustomer(true);
      } else {
        setUser(null);
        setIsCustomer(false);
      }
    } catch {
      setUser(null);
      setIsCustomer(false);
    } finally {
      setCheckingAuth(false);
    }
  }, []);

  useEffect(() => {
    fetchAuthUser();
    if (typeof window !== 'undefined') {
      window.addEventListener('jio_auth_change', fetchAuthUser);
      return () => window.removeEventListener('jio_auth_change', fetchAuthUser);
    }
  }, [fetchAuthUser]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('jio_auth_change'));
      }
      router.refresh();
      setUser(null);
      setIsCustomer(false);
      setLogoutSuccess(true);
    } catch (e) {
      console.error('Logout error:', e);
    } finally {
      setLoggingOut(false);
    }
  };

  const getDisplayName = (userObj: any) => {
    if (!userObj) return 'Customer';
    if (userObj.name && typeof userObj.name === 'string') {
      const trimmed = userObj.name.trim();
      return trimmed || 'Customer';
    }
    return 'Customer';
  };

  const getInitials = (nameStr?: string) => {
    if (!nameStr || nameStr === 'Customer') return 'CU';
    const trimmed = nameStr.trim();
    const parts = trimmed.split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return trimmed.substring(0, 2).toUpperCase();
  };

  const menuGroups = [
    {
      title: 'My Orders & Addresses',
      items: [
        { label: 'My Pickups & Order History', href: '/my-pickups', icon: Package },
        { label: 'Saved Addresses (Home, Work)', href: '/customer/addresses', icon: MapPin },
        { label: 'Offers & Coupons', href: '/customer/coupons', icon: Ticket },
      ],
    },
    {
      title: 'Help & Customer Care',
      items: [
        { label: 'Disputes & Customer Support', href: '/customer/support', icon: AlertCircle },
        { label: 'Waste Acceptance Policy', href: '/accepted-waste', icon: ShieldCheck },
        { label: 'Service Areas Map', href: '/service-areas', icon: MapPin },
      ],
    },
  ];

  if (checkingAuth) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-3">
        <LoaderCircle className="w-8 h-8 animate-spin text-emerald-600 mx-auto" />
        <p className="text-xs font-bold text-slate-600">Verifying account profile details...</p>
      </div>
    );
  }

  if (!isCustomer || !user) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 space-y-6">
        {logoutSuccess && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl text-xs font-bold flex items-center gap-2 animate-scale-in">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>Logged out successfully. Your session has been ended.</span>
          </div>
        )}

        <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm text-center space-y-5 animate-scale-in">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-700 rounded-3xl grid place-items-center mx-auto">
            <Smartphone className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-black text-slate-900">Customer Account</h1>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Log in with your mobile OTP to view your profile, saved addresses, and doorstep pickup history.
            </p>
          </div>
          <button
            onClick={() => setLoginOpen(true)}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs py-3.5 rounded-2xl shadow-md uppercase tracking-wider transition-colors"
          >
            LOGIN WITH MOBILE OTP
          </button>
        </div>

        <CustomerOtpLogin
          open={loginOpen}
          onClose={() => setLoginOpen(false)}
          onAuthenticated={() => fetchAuthUser()}
        />
      </div>
    );
  }

  const displayName = getDisplayName(user);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* PROFILE HEADER CARD */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500 text-slate-950 font-black text-2xl flex items-center justify-center shadow-lg shadow-emerald-500/30 shrink-0">
            {getInitials(displayName)}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-black truncate">{displayName}</h1>
            <p className="text-xs text-slate-300 font-mono mt-0.5">{user.phone} • {user.email || 'Mobile Verified'}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] font-extrabold bg-emerald-400/20 text-emerald-300 border border-emerald-400/30 px-2.5 py-0.5 rounded-full uppercase">
                Customer Account
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* MENU GROUPS */}
      {menuGroups.map((group, idx) => (
        <div key={idx} className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-3">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">{group.title}</h3>
          <div className="divide-y divide-slate-100">
            {group.items.map((item, itemIdx) => {
              const Icon = item.icon;
              return (
                <Link
                  key={itemIdx}
                  href={item.href}
                  className="py-3 flex items-center justify-between hover:bg-slate-50 px-2 rounded-xl transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="font-bold text-xs text-slate-900">{item.label}</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      {/* LOGOUT BUTTON */}
      <div className="pt-2">
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full bg-rose-50 hover:bg-rose-100 text-rose-700 font-extrabold text-xs py-3.5 rounded-2xl border border-rose-200 flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
        >
          {loggingOut ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
          LOG OUT OF ACCOUNT
        </button>
      </div>
    </div>
  );
}
