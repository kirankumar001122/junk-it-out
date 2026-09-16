'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  ImagePlus,
  LoaderCircle,
  MapPin,
  Minus,
  Plus,
  ShoppingBasket,
  Trash2,
  X,
  Lock,
  Smartphone,
  KeyRound,
  AlertTriangle,
} from 'lucide-react';
import { calculateOrderValuation } from '@/lib/pricing';
import {
  pickupCartEvent,
  readPickupCart,
  removeFromPickupCart,
  updatePickupCartQuantity,
  type PickupCartItem,
} from '@/lib/pickupCart';

type Props = { open: boolean; onClose: () => void };

export default function PickupCartDrawer({ open, onClose }: Props) {
  const [items, setItems] = useState<PickupCartItem[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isCustomer, setIsCustomer] = useState(false);

  // Inline OTP Login State
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [otpStep, setOtpStep] = useState<'details' | 'code'>('details');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [cooldown, setCooldown] = useState(0);

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

  const checkAuth = useCallback(async () => {
    setCheckingAuth(true);
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      const authenticatedCustomer = res.ok && data.success && data.data?.user?.role === 'CUSTOMER';
      if (authenticatedCustomer) {
        setIsCustomer(true);
        setUser(data.data.user);
        setPhone('');
        setName('');
        setCode('');
        setOtpStep('details');
        setOtpError('');
      } else {
        setIsCustomer(false);
        setUser(null);
        setPhone('');
        setName('');
        setCode('');
        setOtpStep('details');
        setOtpError('');
      }
      console.log('[AUTH_CHECK] Customer session status:', { authenticatedCustomer, user: data.data?.user?.phone });
    } catch {
      setIsCustomer(false);
      setUser(null);
      setPhone('');
      setName('');
      setCode('');
      setOtpStep('details');
      setOtpError('');
    } finally {
      setCheckingAuth(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const refresh = () => setItems(readPickupCart());
    refresh();
    setLoading(true);

    Promise.all([
      fetch('/api/waste-categories').then((res) => (res.ok ? res.json() : { success: false })),
      checkAuth(),
    ])
      .then(([categoryData]) => {
        setCategories(categoryData.success ? categoryData.data : []);
      })
      .catch(() => {
        setCategories([]);
      })
      .finally(() => setLoading(false));

    window.addEventListener(pickupCartEvent, refresh);
    window.addEventListener('jio_auth_change', checkAuth);
    return () => {
      window.removeEventListener(pickupCartEvent, refresh);
      window.removeEventListener('jio_auth_change', checkAuth);
    };
  }, [open, checkAuth]);

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setInterval(() => setCooldown((val) => Math.max(0, val - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const handleSendOtp = async (e?: FormEvent) => {
    if (e) e.preventDefault();

    if (!phone || phone.trim().replace(/\D/g, '').length < 10) {
      setOtpError('Please enter a valid 10-digit mobile number.');
      return;
    }

    setOtpLoading(true);
    setOtpError('');
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error?.message || 'Unable to send OTP. Please check mobile number.');
      }

      if (data.data?.isExisting && data.data?.existingName) {
        setName(data.data.existingName);
      } else if (!data.data?.isExisting && (!name || name.trim().length < 2)) {
        setOtpError('Please enter your full name for registration.');
        setOtpLoading(false);
        return;
      }

      setOtpStep('code');
      setCooldown(Number(data.data?.cooldownSeconds) || 30);
    } catch (err: any) {
      setOtpError(err.message || 'Unable to send OTP.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!code || code.trim().length === 0) {
      setOtpError('Please enter the OTP code received.');
      return;
    }
    setOtpLoading(true);
    setOtpError('');
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          phone: phone.trim(), 
          code: code.trim(),
          name: name.trim()
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error?.message || 'The OTP code could not be verified.');
      }

      // Refresh server-side session authority
      await checkAuth();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('jio_auth_change'));
      }
      setItems(readPickupCart()); // Preserve guest cart items
    } catch (err: any) {
      setOtpError(err.message || 'The OTP could not be verified.');
    } finally {
      setOtpLoading(false);
    }
  };

  const cartItems = useMemo(
    () =>
      items
        .map((item) => ({
          ...item,
          category: categories.find((category) => category.id === item.categoryId),
        }))
        .filter((item) => item.category),
    [items, categories]
  );

  const valuation = useMemo(
    () =>
      calculateOrderValuation(
        cartItems.map((item) => ({
          categoryId: item.category.id,
          categoryName: item.category.name,
          type: item.category.type,
          pricePerKg: item.category.pricePerKg,
          weightKg: item.quantity,
        }))
      ),
    [cartItems]
  );

  const totalWeight = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const updateQuantity = (categoryId: string, quantity: number) => setItems(updatePickupCartQuantity(categoryId, quantity));
  const remove = (categoryId: string) => setItems(removeFromPickupCart(categoryId));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end" role="dialog" aria-modal="true" aria-label="Pickup Cart">
      <button className="absolute inset-0 cursor-default bg-slate-950/45 backdrop-blur-sm" onClick={onClose} aria-label="Close Pickup Cart" />
      <aside className="animate-cart-in relative flex h-[100dvh] max-h-[100dvh] w-full max-w-[480px] flex-col bg-[#fbfdfb] shadow-2xl overflow-hidden">
        {/* HEADER */}
        <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-5 py-4">
          <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl hover:bg-slate-100" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-black text-slate-950">Pickup Cart</h2>
            <p className="text-xs font-semibold text-slate-500">
              {items.length} {items.length === 1 ? 'waste type' : 'waste types'} selected
            </p>
          </div>
          <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl hover:bg-slate-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* CART BODY */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {/* BENEFITS BANNER */}
          <section className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4">
            <div className="flex gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-emerald-700">
                <CheckCircle2 className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-sm font-black text-emerald-950">Doorstep Pickup Benefits</h3>
                <p className="mt-1 text-xs leading-relaxed text-emerald-800">
                  Transparent category rates, verified digital scale weighing, live tracking, and instant scrap settlement.
                </p>
              </div>
            </div>
          </section>

          {/* AUTHENTICATION CHECKING STATE */}
          {checkingAuth ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 text-center space-y-2">
              <LoaderCircle className="h-6 w-6 animate-spin text-emerald-600 mx-auto" />
              <p className="text-xs font-bold text-slate-600">Verifying customer login session...</p>
            </div>
          ) : isCustomer && user ? (
            /* AUTHENTICATED CUSTOMER BADGE */
            <section className="rounded-3xl border border-emerald-200 bg-white p-4 shadow-sm flex items-center justify-between gap-3 animate-scale-in">
              <div className="flex items-center gap-3 min-w-0">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-emerald-100 font-black text-emerald-800 text-sm">
                  {getInitials(getDisplayName(user))}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-black text-slate-900 truncate">{getDisplayName(user)}</span>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800 uppercase">Verified</span>
                  </div>
                  <p className="text-xs font-semibold text-slate-500 font-mono">{user.phone}</p>
                </div>
              </div>
              <button
                onClick={async () => {
                  try {
                    await fetch('/api/auth/logout', { method: 'POST' });
                    if (typeof window !== 'undefined') {
                      window.dispatchEvent(new Event('jio_auth_change'));
                    }
                  } catch (err) {
                    console.error('Logout error from cart:', err);
                  }
                }}
                className="text-xs font-bold text-rose-600 hover:text-rose-800 hover:underline shrink-0"
              >
                Logout
              </button>
            </section>
          ) : !isCustomer ? (
            /* INLINE MOBILE OTP LOGIN GATE FOR UNLOGGED CUSTOMER */
            <section className="rounded-3xl border border-emerald-200 bg-emerald-50/70 p-5 shadow-sm space-y-4 animate-scale-in">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-emerald-600 text-white">
                  <Smartphone className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base font-black text-slate-950">Login to continue</h3>
                  <p className="text-xs text-slate-600 font-semibold">
                    Enter your mobile number to continue with your pickup.
                  </p>
                </div>
              </div>

              <form onSubmit={otpStep === 'details' ? handleSendOtp : handleVerifyOtp} className="space-y-3">
                {otpStep === 'details' ? (
                  <>
                    <div>
                      <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 mb-1.5">
                        Full Name
                      </label>
                      <input
                        type="text"
                        autoFocus
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Enter your full name"
                        disabled={otpLoading}
                        className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 mb-1.5">
                        Mobile Number
                      </label>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="10-digit mobile number"
                        disabled={otpLoading}
                        className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100"
                        required
                      />
                    </div>
                  </>
                ) : (
                  <div className="space-y-3">
                    <div className="p-3 bg-white rounded-2xl border border-slate-200 flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700">Mobile OTP Sent</span>
                      <button
                        type="button"
                        onClick={() => {
                          setOtpStep('details');
                          setCode('');
                          setOtpError('');
                        }}
                        className="text-emerald-700 font-extrabold hover:underline text-[11px]"
                      >
                        Change details
                      </button>
                    </div>

                    <div>
                      <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 mb-1.5">
                        Enter OTP
                      </label>
                      <div className="relative">
                        <KeyRound className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          autoFocus
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={10}
                          value={code}
                          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                          placeholder="Enter OTP"
                          disabled={otpLoading}
                          className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-4 text-sm font-bold tracking-[0.3em] text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                          required
                        />
                      </div>
                    </div>
                  </div>
                )}

                {otpError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-bold flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                    <span>{otpError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={otpLoading}
                  className="flex h-13 min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 text-sm font-black text-white shadow-md hover:bg-emerald-700 disabled:opacity-60 transition-all uppercase tracking-wider"
                >
                  {otpLoading ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Lock className="h-4 w-4" />
                  )}
                  {otpStep === 'details' ? 'Send OTP to Continue' : 'Verify OTP & Continue'}
                  <ArrowRight className="h-4 w-4" />
                </button>

                {otpStep === 'code' && (
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      disabled={cooldown > 0 || otpLoading}
                      onClick={() => handleSendOtp()}
                      className="text-xs font-bold text-emerald-700 hover:underline disabled:text-slate-400 disabled:no-underline"
                    >
                      {cooldown > 0 ? `Resend OTP in ${cooldown}s` : 'Resend OTP'}
                    </button>
                  </div>
                )}
              </form>
            </section>
          ) : null}

          {/* CART ITEMS LIST */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2].map((index) => (
                <div key={index} className="h-24 animate-pulse rounded-3xl bg-slate-200" />
              ))}
            </div>
          ) : cartItems.length === 0 ? (
            <section className="grid place-items-center rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
              <span className="grid h-16 w-16 place-items-center rounded-3xl bg-emerald-100 text-emerald-700">
                <ShoppingBasket className="h-8 w-8" />
              </span>
              <h3 className="mt-4 text-lg font-black text-slate-950">Your Pickup Cart is empty</h3>
              <p className="mt-1 max-w-xs text-sm text-slate-500">Add waste categories to start your doorstep pickup request.</p>
              <Link onClick={onClose} href="/categories" className="mt-5 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white">
                Browse Waste Categories
              </Link>
            </section>
          ) : (
            <>
              <section className="space-y-3">
                {cartItems.map((item) => (
                  <article key={item.categoryId} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex gap-3">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-lg">
                        {item.category.type === 'WASTE_CHARGE' ? '🧰' : '♻️'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-black text-slate-950">{item.category.name}</h3>
                        <p className="mt-0.5 text-xs font-semibold text-emerald-700">
                          ₹{item.category.pricePerKg}/kg · {item.category.type === 'RECYCLABLE_BUY' ? 'Recyclable value' : 'Service category'}
                        </p>
                      </div>
                      <button
                        onClick={() => remove(item.categoryId)}
                        className="p-2 text-slate-400 hover:text-rose-600"
                        aria-label={`Remove ${item.category.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-500">Estimated quantity</span>
                      <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50">
                        <button
                          onClick={() => updateQuantity(item.categoryId, item.quantity - 1)}
                          className="grid h-9 w-9 place-items-center text-slate-700"
                          aria-label={`Decrease ${item.category.name}`}
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="min-w-16 text-center text-sm font-black text-slate-950">{item.quantity} kg</span>
                        <button
                          onClick={() => updateQuantity(item.categoryId, item.quantity + 1)}
                          className="grid h-9 w-9 place-items-center text-emerald-700"
                          aria-label={`Increase ${item.category.name}`}
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </section>

              <Link
                onClick={onClose}
                href="/categories"
                className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-emerald-300 bg-white px-4 py-3 text-sm font-black text-emerald-700"
              >
                <Plus className="h-4 w-4" /> Add More Waste
              </Link>

              {/* PICKUP DETAILS SECTION - Gated for Authenticated Customers */}
              <section className="rounded-3xl border border-slate-200 bg-white p-4 space-y-3">
                <h3 className="text-sm font-black text-slate-950">Pickup details</h3>
                <div className="space-y-2">
                  {isCustomer ? (
                    <>
                      <Link onClick={onClose} href="/book?cart=1" className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3 hover:bg-slate-100 transition-colors">
                        <span className="flex items-center gap-2 text-xs font-bold text-slate-700">
                          <MapPin className="h-4 w-4 text-emerald-600" /> Add pickup location
                        </span>
                        <ArrowRight className="h-4 w-4 text-slate-400" />
                      </Link>
                      <Link onClick={onClose} href="/book?cart=1" className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3 hover:bg-slate-100 transition-colors">
                        <span className="flex items-center gap-2 text-xs font-bold text-slate-700">
                          <Clock3 className="h-4 w-4 text-emerald-600" /> Choose pickup time
                        </span>
                        <ArrowRight className="h-4 w-4 text-slate-400" />
                      </Link>
                      <Link onClick={onClose} href="/book?cart=1" className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3 hover:bg-slate-100 transition-colors">
                        <span className="flex items-center gap-2 text-xs font-bold text-slate-700">
                          <ImagePlus className="h-4 w-4 text-emerald-600" /> Add waste photos in booking
                        </span>
                        <ArrowRight className="h-4 w-4 text-slate-400" />
                      </Link>
                    </>
                  ) : (
                    <div className="p-3 bg-amber-50/60 rounded-2xl border border-amber-200/60 text-xs font-bold text-amber-900 flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Lock className="h-4 w-4 text-amber-700 shrink-0" /> Log in above to complete address, schedule & photos
                      </span>
                    </div>
                  )}
                </div>
              </section>

              {/* ESTIMATED SUMMARY */}
              <section className="rounded-3xl bg-slate-950 p-4 text-white">
                <h3 className="text-sm font-black">Pickup Summary</h3>
                <div className="mt-3 space-y-2 text-xs">
                  <div className="flex justify-between text-slate-300">
                    <span>Waste types</span>
                    <strong className="text-white">{cartItems.length}</strong>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>Estimated weight</span>
                    <strong className="text-white">{totalWeight} kg</strong>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>Estimated waste value</span>
                    <strong className="text-emerald-300">₹{valuation.totalRecyclableValue.toFixed(2)}</strong>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>Pickup service charge</span>
                    <strong className="text-white">₹{(valuation.totalWasteCharge + valuation.basePickupCharge).toFixed(2)}</strong>
                  </div>
                  <div className="border-t border-white/10 pt-2 text-sm font-black flex justify-between">
                    <span>Amount payable</span>
                    <span className="text-emerald-300">₹{valuation.netAmount.toFixed(2)}</span>
                  </div>
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
                  Final amount may be updated after pickup verification and weighing.
                </p>
              </section>
            </>
          )}
        </div>

        {/* FOOTER BUTTON */}
        {cartItems.length > 0 && isCustomer && (
          <footer className="shrink-0 border-t border-slate-200 bg-white p-4 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]">
            <Link
              onClick={onClose}
              href="/book?cart=1"
              className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 text-sm font-black text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-colors uppercase tracking-wider"
            >
              Complete Pickup Details <ArrowRight className="h-4 w-4" />
            </Link>
          </footer>
        )}
      </aside>
    </div>
  );
}
