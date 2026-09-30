'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  CheckCircle2,
  KeyRound,
  LoaderCircle,
  MapPin,
  Smartphone,
  X,
} from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
  onAuthenticated: () => void;
};

export default function CustomerOtpLogin({
  open,
  onClose,
  onAuthenticated,
}: Props) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'details' | 'code'>('details');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [showServiceNotice, setShowServiceNotice] = useState(false);

  // Reset the login form whenever the modal is closed.
  useEffect(() => {
    if (!open) {
      setStep('details');
      setPhone('');
      setName('');
      setCode('');
      setError('');
      setCooldown(0);
      setShowServiceNotice(false);
    }
  }, [open]);

  // OTP resend countdown.
  useEffect(() => {
    if (!cooldown) return;

    const timer = window.setInterval(() => {
      setCooldown((value) => Math.max(0, value - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [cooldown]);

  if (!open) return null;

  // ---------------------------------------------------------
  // SEND OTP
  // ---------------------------------------------------------

  const sendOtp = async (event: FormEvent) => {
    event.preventDefault();

    const cleanPhone = phone.trim().replace(/\D/g, '');

    if (cleanPhone.length !== 10) {
      setError('Please enter a valid 10-digit mobile number.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: phone.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message ||
            data.error?.message ||
            'Unable to send OTP. Please check mobile number.'
        );
      }

      // Existing customer name
      if (data.data?.isExisting && data.data?.existingName) {
        setName(data.data.existingName);
      } else if (!name || name.trim().length < 2) {
        setName('Customer');
      }

      setError('');
      setCode('');
      setStep('code');

      // Test number will normally return 0.
      // Real OTP users will receive the server cooldown.
      setCooldown(Number(data.data?.cooldownSeconds) || 0);
    } catch (err: any) {
      setError(err?.message || 'Unable to send OTP.');
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------
  // VERIFY OTP
  // ---------------------------------------------------------

  const verifyOtp = async (event: FormEvent) => {
    event.preventDefault();

    const cleanCode = code.trim();

    if (!/^\d{6}$/.test(cleanCode)) {
      setError('Please enter a valid 6-digit OTP.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: phone.trim(),
          code: cleanCode,
          name: name.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message ||
            data.error?.message ||
            'The OTP could not be verified.'
        );
      }

      /*
       * Do NOT notify the parent yet.
       *
       * The parent can close/unmount this login modal when it receives
       * jio_auth_change. We want the service-area notice to remain visible
       * until the customer clicks "Got it".
       */
      setShowServiceNotice(true);
    } catch (err: any) {
      setError(
        err?.message || 'The OTP could not be verified.'
      );
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------
  // CLOSE SERVICE NOTICE
  // ---------------------------------------------------------

  const closeServiceNotice = () => {
    setShowServiceNotice(false);

    /*
     * Authentication is complete.
     * Now notify the rest of the application.
     */
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('jio_auth_change'));
    }

    onAuthenticated();
    onClose();
  };

  // ---------------------------------------------------------
  // UI
  // ---------------------------------------------------------

  return (
    <div
      className="fixed inset-0 z-[120] grid place-items-center p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]"
      role="dialog"
      aria-modal="true"
      aria-label="Customer login"
    >
      {/* Background overlay */}
      <button
        type="button"
        aria-label={
          showServiceNotice
            ? 'Close service area notice'
            : 'Close login'
        }
        onClick={
          showServiceNotice
            ? closeServiceNotice
            : onClose
        }
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
      />

      <section className="relative w-full max-w-md max-h-[85dvh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl animate-scale-in">
        {!showServiceNotice ? (
          <>
            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Icon */}
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
              <Smartphone className="h-5 w-5" />
            </span>

            {/* Heading */}
            <h2 className="mt-4 text-lg font-bold text-slate-900">
              Login to continue
            </h2>

            <p className="mt-0.5 text-xs font-medium text-slate-500">
              Enter your mobile number to verify and complete your pickup.
            </p>

            <form
              onSubmit={
                step === 'details'
                  ? sendOtp
                  : verifyOtp
              }
              className="mt-5 space-y-4"
            >
              {/* -------------------------------------------------
                  DETAILS STEP
              ------------------------------------------------- */}
              {step === 'details' && (
                <>
                  {/* Full name */}
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                    Full Name{' '}
                    <span className="font-normal lowercase text-slate-400">
                      (required for new customer)
                    </span>

                    <input
                      type="text"
                      value={name}
                      disabled={loading}
                      onChange={(event) =>
                        setName(event.target.value)
                      }
                      placeholder="Enter your full name"
                      className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-50 placeholder:text-slate-400 sm:text-sm"
                    />
                  </label>

                  {/* Mobile number */}
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                    Mobile Number

                    <input
                      type="tel"
                      inputMode="numeric"
                      autoFocus
                      value={phone}
                      disabled={loading}
                      onChange={(event) =>
                        setPhone(
                          event.target.value
                            .replace(/\D/g, '')
                            .slice(0, 10)
                        )
                      }
                      placeholder="10-digit mobile number"
                      maxLength={10}
                      className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-50 placeholder:text-slate-400 sm:text-sm"
                      required
                    />
                  </label>
                </>
              )}

              {/* -------------------------------------------------
                  OTP STEP
              ------------------------------------------------- */}
              {step === 'code' && (
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                  Enter 6-Digit OTP Code

                  <div className="relative mt-1.5">
                    <KeyRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                    <input
                      autoFocus
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={code}
                      disabled={loading}
                      onChange={(event) =>
                        setCode(
                          event.target.value
                            .replace(/\D/g, '')
                            .slice(0, 6)
                        )
                      }
                      placeholder="Enter 6-digit OTP"
                      className="h-10 w-full rounded-xl border border-slate-200 pl-10 pr-3 text-xs font-bold tracking-[0.3em] text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 placeholder:font-medium placeholder:tracking-normal placeholder:text-slate-400 sm:text-sm"
                      required
                    />
                  </div>
                </label>
              )}

              {/* Error */}
              {error && (
                <p className="rounded-lg border border-rose-100 bg-rose-50 p-2.5 text-xs font-medium text-rose-700">
                  {error}
                </p>
              )}

              {/* Main button */}
              <button
                type="submit"
                disabled={loading}
                className="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-slate-900 text-xs font-bold text-white shadow-sm transition-all hover:bg-slate-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading && (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                )}

                {step === 'details'
                  ? 'Send OTP'
                  : 'Verify & Continue'}
              </button>

              {/* Change details / resend */}
              {step === 'code' && (
                <div className="flex justify-between pt-1 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('details');
                      setCode('');
                      setError('');
                      setCooldown(0);
                    }}
                    className="cursor-pointer text-slate-500 hover:text-slate-900"
                  >
                    Change details
                  </button>

                  <button
                    type="button"
                    disabled={
                      cooldown > 0 || loading
                    }
                    onClick={() =>
                      sendOtp({
                        preventDefault: () => undefined,
                      } as FormEvent)
                    }
                    className="cursor-pointer text-emerald-600 hover:text-emerald-700 hover:underline disabled:cursor-default disabled:text-slate-400 disabled:no-underline"
                  >
                    {cooldown > 0
                      ? `Resend in ${cooldown}s`
                      : 'Resend OTP'}
                  </button>
                </div>
              )}
            </form>
          </>
        ) : (
          /* -------------------------------------------------------
             SERVICE AREA NOTICE
          ------------------------------------------------------- */
          <div className="text-center">
            {/* Success icon */}
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-7 w-7" />
            </div>

            {/* Welcome */}
            <h2 className="mt-4 text-xl font-bold text-slate-900">
              Welcome to Junk It Out!
            </h2>

            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              You are successfully logged in.
            </p>

            {/* Service areas */}
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-left">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-emerald-600 shadow-sm">
                  <MapPin className="h-5 w-5" />
                </span>

                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Currently serving
                  </h3>

                  <p className="mt-1 text-sm font-bold text-emerald-700">
                    JP Nagar &amp; BTM Layout
                  </p>

                  <p className="mt-2 text-xs leading-relaxed text-slate-600">
                    We are currently providing doorstep pickup
                    services in these areas. Please make sure your
                    pickup location is within our service zones.
                  </p>
                </div>
              </div>
            </div>

            {/* Continue */}
            <button
              type="button"
              onClick={closeServiceNotice}
              className="mt-5 flex h-10 w-full cursor-pointer items-center justify-center rounded-xl bg-slate-900 text-xs font-bold text-white transition-colors hover:bg-emerald-600"
            >
              Got it
            </button>
          </div>
        )}
      </section>
    </div>
  );
}