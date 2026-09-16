'use client';

import { FormEvent, useEffect, useState } from 'react';
import { KeyRound, LoaderCircle, Smartphone, X } from 'lucide-react';

type Props = { open: boolean; onClose: () => void; onAuthenticated: () => void };

export default function CustomerOtpLogin({ open, onClose, onAuthenticated }: Props) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'details' | 'code'>('details');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!open) {
      setStep('details');
      setPhone('');
      setName('');
      setCode('');
      setError('');
    }
  }, [open]);

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  if (!open) return null;

  const sendOtp = async (event: FormEvent) => {
    event.preventDefault();

    if (!phone || phone.trim().replace(/\D/g, '').length < 10) {
      setError('Please enter a valid 10-digit mobile number.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || data.error?.message || 'Unable to send OTP. Please check mobile number.');
      }

      if (data.data?.isExisting && data.data?.existingName) {
        // Returning customer with registered name stored in DB
        setName(data.data.existingName);
      } else if (!name || name.trim().length < 2) {
        setName('Customer');
      }

      setError('');
      setStep('code');
      setCooldown(Number(data.data?.cooldownSeconds) || 30);
    } catch (err: any) {
      setError(err.message || 'Unable to send OTP.');
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (event: FormEvent) => {
    event.preventDefault();
    if (!code || code.trim().length === 0) {
      setError('Please enter the OTP code received.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), code: code.trim(), name: name.trim() }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || data.error?.message || 'The OTP could not be verified.');
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('jio_auth_change'));
      }
      onAuthenticated();
      onClose();
    } catch (err: any) {
      setError(err.message || 'The OTP could not be verified.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]" role="dialog" aria-modal="true" aria-label="Customer login">
      <button aria-label="Close login" onClick={onClose} className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" />
      <section className="relative w-full max-w-md max-h-[85dvh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl animate-scale-in">
        <button onClick={onClose} className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
          <Smartphone className="h-5 w-5" />
        </span>
        <h2 className="mt-4 text-lg font-bold text-slate-900">Login to continue</h2>
        <p className="mt-0.5 text-xs text-slate-500 font-medium">Enter your mobile number to verify and complete your pickup.</p>
        <form onSubmit={step === 'details' ? sendOtp : verifyOtp} className="mt-5 space-y-4">
          {step === 'details' && (
            <>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                Full Name <span className="text-slate-400 font-normal lowercase">(required for new customer)</span>
                <input
                  type="text"
                  value={name}
                  disabled={loading}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Enter your full name"
                  className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 px-3 text-xs sm:text-sm font-medium text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-50 placeholder:text-slate-400"
                />
              </label>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                Mobile Number
                <input
                  type="tel"
                  autoFocus
                  value={phone}
                  disabled={loading}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="10-digit mobile number"
                  className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 px-3 text-xs sm:text-sm font-medium text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-50 placeholder:text-slate-400"
                  required
                />
              </label>
            </>
          )}
          {step === 'code' && (
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
              Enter OTP Code
              <div className="relative mt-1.5">
                <KeyRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  autoFocus
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={10}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                  placeholder="Enter OTP"
                  className="h-10 w-full rounded-xl border border-slate-200 pl-10 pr-3 text-xs sm:text-sm font-bold tracking-[0.3em] text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 placeholder:tracking-normal placeholder:font-medium placeholder:text-slate-400"
                  required
                />
              </div>
            </label>
          )}
          {error && <p className="rounded-lg bg-rose-50 border border-rose-100 p-2.5 text-xs font-medium text-rose-700">{error}</p>}
          <button
            disabled={loading}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-xs font-bold text-white disabled:opacity-60 shadow-sm transition-all hover:bg-slate-800 active:scale-95 cursor-pointer"
          >
            {loading && <LoaderCircle className="h-4 w-4 animate-spin" />}
            {step === 'details' ? 'Send OTP' : 'Verify & Continue'}
          </button>
          {step === 'code' && (
            <div className="flex justify-between text-xs font-semibold pt-1">
              <button
                type="button"
                onClick={() => {
                  setStep('details');
                  setCode('');
                  setError('');
                }}
                className="text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                Change details
              </button>
              <button
                type="button"
                disabled={cooldown > 0 || loading}
                onClick={() => sendOtp({ preventDefault: () => undefined } as FormEvent)}
                className="text-emerald-600 hover:text-emerald-700 hover:underline disabled:text-slate-400 disabled:no-underline cursor-pointer"
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend OTP'}
              </button>
            </div>
          )}
        </form>
      </section>
    </div>
  );
}
