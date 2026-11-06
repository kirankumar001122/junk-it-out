'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Package,
  Wallet,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  ArrowRight,
  Sparkles,
  MapPin,
  RefreshCw,
  AlertCircle,
  Smartphone,
  Tag,
} from 'lucide-react';
import CustomerOtpLogin from '@/components/CustomerOtpLogin';

interface SubscriptionOffer {
  id: string;
  name: string;
  description: string;
  billingPeriod: string;
  durationDays: number;
  price: number;
  pickupLimit: number;
  benefits: string[];
  active: boolean;
  displayOrder: number;
}

interface ActiveSub {
  id: string;
  planName: string;
  remainingPickups: number;
  pickupsUsed: number;
  pickupsAllowed: number;
  expiryDate: string;
  status: string;
}

export default function CustomerDashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loginOpen, setLoginOpen] = useState(false);
  const [offers, setOffers] = useState<SubscriptionOffer[]>([]);
  const [activeSub, setActiveSub] = useState<ActiveSub | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // 1. Fetch available subscription offers (live from backend)
      const offersRes = await fetch('/api/subscription-offers', { cache: 'no-store' });
      const offersData = await offersRes.json();
      if (offersData.success && Array.isArray(offersData.data)) {
        setOffers(offersData.data);
      }

      // 2. Fetch authenticated customer details
      const authRes = await fetch('/api/auth/me', { cache: 'no-store' });
      const authData = await authRes.json();

      if (authRes.ok && authData.success && authData.data?.user?.role === 'CUSTOMER') {
        setUser(authData.data.user);

        // Fetch wallet & active subscription info
        const [walletRes, subRes] = await Promise.all([
          fetch('/api/customer/wallet', { cache: 'no-store' }),
          fetch('/api/customer/subscriptions', { cache: 'no-store' }),
        ]);

        const walletJson = await walletRes.json().catch(() => ({}));
        if (walletJson.success && walletJson.data) {
          setWalletBalance(Number(walletJson.data.balance || 0));
        }

        const subJson = await subRes.json().catch(() => ({}));
        if (subJson.success && Array.isArray(subJson.data)) {
          const active = subJson.data.find(
            (s: any) => (s.computedStatus || s.status) === 'ACTIVE' && s.remainingPickups > 0,
          );
          if (active) {
            setActiveSub({
              id: active.id,
              planName: active.offer?.name || 'Active Pass',
              remainingPickups: active.remainingPickups,
              pickupsUsed: active.pickupsUsed,
              pickupsAllowed: active.pickupsAllowed,
              expiryDate: active.expiryDate,
              status: active.status,
            });
          } else {
            setActiveSub(null);
          }
        }
      } else {
        setUser(null);
        setActiveSub(null);
        setWalletBalance(null);
      }
    } catch {
      setErrorMsg('Unable to load subscription offers. Please refresh.');
    } finally {
      setCheckingAuth(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDashboardData();
  }, [fetchDashboardData]);

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Welcome Header */}
        <header className="rounded-3xl border border-slate-200/80 bg-white p-6 sm:p-8 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">
                Customer Portal
              </span>
              {walletBalance !== null && (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                  Wallet: ₹{walletBalance.toFixed(2)}
                </span>
              )}
            </div>
            <h1 className="mt-2 text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {user?.name ? `Welcome back, ${user.name}` : 'Customer Dashboard'}
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-500">
              Manage your doorstep recycling, subscription passes, and doorstep scrap bookings.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void fetchDashboardData()}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <Link
              href="/book"
              className="rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs px-4 py-2.5 shadow-sm transition-all active:scale-95 flex items-center gap-1.5"
            >
              <Package className="h-4 w-4" />
              <span>Book Pickup</span>
            </Link>
          </div>
        </header>

        {errorMsg && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Active Subscription Status Banner (if customer has active plan) */}
        {activeSub && (
          <div className="rounded-3xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-[10px] font-black uppercase text-white">
                    Active Pass
                  </span>
                  <h3 className="text-lg font-black text-slate-900">{activeSub.planName}</h3>
                </div>
                <p className="text-xs text-slate-600">
                  <span className="font-extrabold text-emerald-700">{activeSub.remainingPickups} free pickups remaining</span>{' '}
                  ({activeSub.pickupsUsed} / {activeSub.pickupsAllowed} used this cycle).
                </p>
                <p className="text-[11px] text-slate-500 flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Valid through {new Date(activeSub.expiryDate).toLocaleDateString('en-IN')}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  href="/customer/wallet"
                  className="rounded-xl border border-emerald-300 bg-white px-3.5 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-50 transition-colors shadow-xs"
                >
                  Manage Pass / Renew
                </Link>
                <Link
                  href="/book"
                  className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition-colors shadow-xs"
                >
                  Use Free Pickup
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Quick Nav Grid */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Link
            href="/my-pickups"
            className="rounded-2xl border border-slate-200 bg-white p-4 text-center hover:border-emerald-300 hover:shadow-md transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-2 group-hover:scale-105 transition-transform">
              <Package className="h-5 w-5" />
            </div>
            <p className="text-xs font-black text-slate-900">My Pickups</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Track & history</p>
          </Link>

          <Link
            href="/customer/wallet"
            className="rounded-2xl border border-slate-200 bg-white p-4 text-center hover:border-emerald-300 hover:shadow-md transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center mx-auto mb-2 group-hover:scale-105 transition-transform">
              <Wallet className="h-5 w-5" />
            </div>
            <p className="text-xs font-black text-slate-900">Wallet & Passes</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Balance & top-up</p>
          </Link>

          <Link
            href="/customer/addresses"
            className="rounded-2xl border border-slate-200 bg-white p-4 text-center hover:border-emerald-300 hover:shadow-md transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center mx-auto mb-2 group-hover:scale-105 transition-transform">
              <MapPin className="h-5 w-5" />
            </div>
            <p className="text-xs font-black text-slate-900">Saved Addresses</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Manage locations</p>
          </Link>

          <Link
            href="/pricing"
            className="rounded-2xl border border-slate-200 bg-white p-4 text-center hover:border-emerald-300 hover:shadow-md transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-2 group-hover:scale-105 transition-transform">
              <Tag className="h-5 w-5" />
            </div>
            <p className="text-xs font-black text-slate-900">Scrap Rates</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Per-kg valuations</p>
          </Link>
        </section>

        {/* Available Subscription Offers Section (Requested by Kiran) */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-emerald-700">
                <Sparkles className="h-4 w-4" />
                <span>Green Passes & Subscription Plans</span>
              </div>
              <h2 className="mt-1 text-xl font-black text-slate-900">Available Subscription Offers</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Choose a recurring pass for zero doorstep pickup charges, priority dispatch, and top scrap valuations.
              </p>
            </div>

            <Link
              href="/customer/wallet"
              className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
            >
              <span>Manage on Wallet Page</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {offers.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-3">
              {offers.map((offer) => {
                const isWeekly = offer.billingPeriod === 'WEEKLY' || offer.durationDays <= 7;
                const isQuarterly = offer.billingPeriod === 'QUARTERLY' || offer.durationDays >= 90;
                const periodLabel = isWeekly ? 'Weekly' : isQuarterly ? 'Quarterly' : 'Monthly';

                return (
                  <article
                    key={offer.id}
                    className="flex flex-col justify-between rounded-3xl border border-slate-200 bg-slate-50/60 p-5 hover:border-emerald-300 hover:shadow-md transition-all"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-black uppercase text-emerald-800">
                          {periodLabel} Pass
                        </span>
                        <span className="text-[11px] font-bold text-slate-500">
                          {offer.durationDays} Days Validity
                        </span>
                      </div>

                      <h3 className="mt-3 text-base font-black text-slate-900">{offer.name}</h3>
                      <p className="mt-1 text-xs text-slate-500 line-clamp-2">{offer.description}</p>

                      <div className="mt-4 border-t border-slate-200/60 pt-3">
                        <p className="text-2xl font-black text-emerald-700">
                          ₹{offer.price}
                          <span className="text-xs font-bold text-slate-500"> / cycle</span>
                        </p>
                        <p className="text-xs font-bold text-slate-700 mt-1">
                          Includes {offer.pickupLimit} Doorstep Pickups
                        </p>
                      </div>

                      <ul className="mt-4 space-y-1.5 text-xs text-slate-600 border-t border-slate-200/60 pt-3">
                        {offer.benefits.map((benefit, idx) => (
                          <li key={idx} className="flex items-start gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                            <span>{benefit}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="mt-6 pt-3 border-t border-slate-200/60">
                      <Link
                        href={`/customer/wallet?plan=${offer.id}`}
                        className="w-full block text-center rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs py-2.5 shadow-sm transition-all active:scale-95"
                      >
                        Choose this Pass &rarr;
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-slate-500 bg-slate-50 rounded-2xl">
              No subscription plans currently active. Please check back shortly.
            </div>
          )}
        </section>

        {/* Not logged in prompt */}
        {!user && !checkingAuth && (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 text-center space-y-3">
            <Smartphone className="h-8 w-8 text-emerald-600 mx-auto" />
            <h3 className="text-sm font-black text-slate-900">Access Your Customer Profile</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Sign in with your mobile OTP to view active passes, wallet balance, and order history.
            </p>
            <button
              onClick={() => setLoginOpen(true)}
              className="rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs px-6 py-2.5 shadow-sm transition-all"
            >
              Sign In with OTP
            </button>
          </div>
        )}

        <CustomerOtpLogin
          open={loginOpen}
          onClose={() => setLoginOpen(false)}
          onAuthenticated={() => void fetchDashboardData()}
        />
      </div>
    </div>
  );
}
