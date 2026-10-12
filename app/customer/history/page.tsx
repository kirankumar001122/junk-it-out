'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Clock, Package, Smartphone } from 'lucide-react';
import CustomerOtpLogin from '@/components/CustomerOtpLogin';
import { formatPickupAddress } from '@/lib/address';
import { isPickupCompletedStatus, normalizeOrderStatus } from '@/lib/orders/lifecycle';

export default function PickupHistoryPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [unauthenticated, setUnauthenticated] = useState(false);
  const [error, setError] = useState('');
  const [loginOpen, setLoginOpen] = useState(false);

  const fetchHistory = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/orders');
      const data = await response.json();
      if (response.status === 401) {
        setUnauthenticated(true);
        setOrders([]);
      } else if (!response.ok || !data.success) {
        setError(data.message || 'Pickup history could not be loaded.');
      } else {
        setUnauthenticated(false);
        setOrders((data.data || []).filter((order: any) =>
          isPickupCompletedStatus(order.status) || normalizeOrderStatus(order.status) === 'CANCELLED'
        ));
      }
    } catch {
      setError('Network error loading pickup history. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchHistory(); }, []);

  if (unauthenticated && !loading) {
    return <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-5">
      <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-4">
        <Smartphone className="w-10 h-10 text-emerald-600 mx-auto" />
        <h1 className="text-xl font-black text-slate-900">Sign in to View Pickup History</h1>
        <p className="text-sm text-slate-500">Review completed and cancelled pickups and their statuses.</p>
        <button onClick={() => setLoginOpen(true)} className="w-full bg-emerald-600 text-white font-bold text-xs py-3.5 rounded-xl">LOGIN WITH MOBILE OTP</button>
      </div>
      <CustomerOtpLogin open={loginOpen} onClose={() => setLoginOpen(false)} onAuthenticated={() => void fetchHistory()} />
    </div>;
  }

  return <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
    <header className="flex items-center justify-between gap-4">
      <div>
        <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase">Customer Dashboard</span>
        <h1 className="text-2xl font-black text-slate-900 mt-2">Pickup History</h1>
        <p className="text-xs text-slate-500">Completed and cancelled pickups with their final statuses.</p>
      </div>
      <Link href="/my-pickups" className="text-xs font-bold text-emerald-700 hover:underline">My Pickups</Link>
    </header>
    {error && <div role="alert" className="p-4 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl text-sm">{error}</div>}
    {loading ? <div className="shimmer-box h-40 rounded-3xl" /> : orders.length === 0 ? (
      <div className="bg-white rounded-3xl p-10 text-center border border-slate-200 space-y-2">
        <Package className="w-8 h-8 text-slate-400 mx-auto" />
        <h2 className="font-bold text-slate-900">No Past Pickups</h2>
        <p className="text-sm text-slate-500">Completed or cancelled pickups will appear here.</p>
      </div>
    ) : <div className="space-y-3">{orders.map((order) => {
      const completed = isPickupCompletedStatus(order.status);
      const destination = completed ? `/orders/${order.id}/receipt` : `/orders/${order.id}`;
      return <article key={order.id} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-sm font-bold text-slate-900">#{order.orderNumber}</p>
            <p className="text-xs text-slate-500 mt-1">{formatPickupAddress(order.address) || 'Address not available'}</p>
          </div>
          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${completed ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'}`}>
            {String(order.status).replace(/_/g, ' ')}
          </span>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500"><Clock className="w-3.5 h-3.5" />{new Date(order.createdAt).toLocaleDateString()}</span>
          <Link href={destination} className="inline-flex items-center gap-1.5 bg-slate-900 text-white text-xs font-bold px-3 py-2 rounded-lg">
            {completed ? 'View Receipt' : 'View Details'} <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </article>;
    })}</div>}
    <CustomerOtpLogin open={loginOpen} onClose={() => setLoginOpen(false)} onAuthenticated={() => void fetchHistory()} />
  </div>;
}
