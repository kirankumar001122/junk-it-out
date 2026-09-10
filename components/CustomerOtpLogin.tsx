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
      } else if (!data.data?.isExisting && (!name || name.trim().length < 2)) {
        setError('Please enter your full name for registration.');
        setLoading(false);
        return;
      }

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
      <button aria-label="Close login" onClick={onClose} className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm" />
      <section className="relative w-full max-w-md max-h-[85dvh] overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl animate-scale-in">
        <button onClick={onClose} className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-xl text-slate-500 hover:bg-slate-100" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
          <Smartphone className="h-6 w-6" />
        </span>
        <h2 className="mt-4 text-xl font-black text-slate-950">Login to continue</h2>
        <p className="mt-1 text-xs text-slate-500 font-semibold">Enter your details to continue with your doorstep pickup.</p>
        <form onSubmit={step === 'details' ? sendOtp : verifyOtp} className="mt-6 space-y-4">
          {step === 'details' && (
            <>
              <label className="block text-xs font-black uppercase tracking-wide text-slate-600">
                Full Name <span className="text-slate-400 font-normal lowercase">(required for new customer)</span>
                <input
                  type="text"
                  value={name}
                  disabled={loading}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Enter your full name"
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 disabled:bg-slate-50"
                />
              </label>
              <label className="block text-xs font-black uppercase tracking-wide text-slate-600">
                Mobile Number
                <input
                  type="tel"
                  autoFocus
                  value={phone}
                  disabled={loading}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="10-digit mobile number"
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 disabled:bg-slate-50"
                  required
                />
              </label>
            </>
          )}
          {step === 'code' && (
            <label className="block text-xs font-black uppercase tracking-wide text-slate-600">
              Enter OTP
              <div className="relative mt-2">
                <KeyRound className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  autoFocus
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={10}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                  placeholder="Enter OTP"
                  className="h-12 w-full rounded-2xl border border-slate-200 pl-11 pr-4 text-sm font-semibold tracking-[0.35em] outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                  required
                />
              </div>
            </label>
          )}
          {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p>}
          <button
            disabled={loading}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-sm font-black text-white disabled:opacity-60 shadow-md transition-all hover:bg-emerald-700"
          >
            {loading && <LoaderCircle className="h-4 w-4 animate-spin" />}
            {step === 'details' ? 'Send OTP' : 'Verify & Continue'}
          </button>
          {step === 'code' && (
            <div className="flex justify-between text-xs font-bold">
              <button
                type="button"
                onClick={() => {
                  setStep('details');
                  setCode('');
                  setError('');
                }}
                className="text-slate-500 hover:text-slate-900"
              >
                Change details
              </button>
              <button
                type="button"
                disabled={cooldown > 0 || loading}
                onClick={() => sendOtp({ preventDefault: () => undefined } as FormEvent)}
                className="text-emerald-700 hover:underline disabled:text-slate-400 disabled:no-underline"
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
