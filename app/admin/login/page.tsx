'use client';

import { FormEvent, useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ShieldCheck, Smartphone, KeyRound, ArrowRight, Loader2, RotateCw } from 'lucide-react';

export default function AdminLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [sentPhone, setSentPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const isSubmittingRef = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const handleSendOtp = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (isSubmittingRef.current || loading) return;

    const trimmedPhone = phone.trim();
    if (!trimmedPhone) {
      setError('Please enter your admin phone number.');
      return;
    }

    isSubmittingRef.current = true;
    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: trimmedPhone }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error?.message || data.message || 'Failed to send OTP.');
        return;
      }

      setSentPhone(trimmedPhone);
      setOtpSent(true);
      setInfo('OTP sent to your registered admin phone.');
      setCooldown(Number(data.data?.cooldownSeconds) || 30);
    } catch {
      setError('Network error while sending OTP.');
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };

  const handleResendOtp = async () => {
    if (isSubmittingRef.current || loading || cooldown > 0 || !sentPhone) return;

    isSubmittingRef.current = true;
    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: sentPhone }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error?.message || data.message || 'Failed to resend OTP.');
        return;
      }

      setInfo('A new OTP has been sent. Please use the latest OTP. The previous OTP is no longer valid.');
      setCooldown(Number(data.data?.cooldownSeconds) || 30);
    } catch {
      setError('Network error while resending OTP.');
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };

  const handleVerifyOtp = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (isSubmittingRef.current || loading) return;

    const cleanOtp = otp.trim();
    if (!cleanOtp) {
      setError('Please enter the 6-digit OTP code.');
      return;
    }

    isSubmittingRef.current = true;
    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: sentPhone || phone.trim(), code: cleanOtp }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error?.message || data.message || 'Admin login failed.');
        return;
      }

      router.replace('/admin');
      router.refresh();
    } catch {
      setError('Network error while verifying OTP.');
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };

  const handleChangePhone = () => {
    if (loading) return;
    setOtpSent(false);
    setSentPhone('');
    setOtp('');
    setError(null);
    setInfo(null);
    setCooldown(0);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-3">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Admin Operations Portal</h1>
            <p className="text-sm text-slate-400 mt-1">Sign in with your authorized admin phone number.</p>
          </div>
        </div>

        <form
          onSubmit={otpSent ? handleVerifyOtp : handleSendOtp}
          className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl"
        >
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Admin Phone</label>
            <div className="relative">
              <Smartphone className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="tel"
                value={otpSent ? sentPhone : phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91XXXXXXXXXX"
                required
                disabled={otpSent || loading}
                className="w-full bg-slate-950 border border-slate-700 rounded-2xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 disabled:opacity-60"
              />
            </div>
          </div>

          {otpSent && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">OTP Code</label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  inputMode="numeric"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="6-digit OTP"
                  required
                  disabled={loading}
                  className="w-full bg-slate-950 border border-slate-700 rounded-2xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 tracking-widest disabled:opacity-60"
                />
              </div>
            </div>
          )}

          {error && (
            <div className="text-xs font-semibold text-rose-300 bg-rose-950/50 border border-rose-900 rounded-xl px-3 py-2">
              {error}
            </div>
          )}

          {info && (
            <div className="text-xs font-semibold text-emerald-300 bg-emerald-950/40 border border-emerald-900 rounded-xl px-3 py-2">
              {info}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-extrabold text-sm py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            {loading
              ? otpSent
                ? 'Verifying OTP...'
                : 'Sending OTP...'
              : otpSent
              ? 'Verify & Enter Dashboard'
              : 'Send Admin OTP'}
          </button>

          {otpSent && (
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={handleChangePhone}
                disabled={loading}
                className="text-xs font-bold text-slate-400 hover:text-white py-1 disabled:opacity-50 cursor-pointer"
              >
                Change phone number
              </button>

              <button
                type="button"
                onClick={handleResendOtp}
                disabled={loading || cooldown > 0}
                className="text-xs font-bold text-emerald-400 hover:text-emerald-300 disabled:text-slate-600 py-1 flex items-center gap-1 cursor-pointer"
              >
                <RotateCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend OTP'}
              </button>
            </div>
          )}
        </form>

        <p className="text-center text-xs text-slate-500">
          <Link href="/" className="text-emerald-400 hover:text-emerald-300 font-semibold">
            Back to customer homepage
          </Link>
        </p>
      </div>
    </div>
  );
}
