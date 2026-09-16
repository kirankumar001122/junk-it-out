'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Clock,
  MapPin,
  CheckCircle,
  Truck,
  PhoneCall,
  Scale,
  CreditCard,
  AlertCircle,
  ArrowLeft,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import InteractiveMap from '@/components/InteractiveMap';
import { getSecurePhotoUrl } from '@/lib/utils/photoUrl';
import { adminFetch } from '@/lib/api';

export default function AdminOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchOrderDetails = async () => {
    setErrorMsg(null);
    try {
      const res = await adminFetch(`/api/orders/${id}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setOrder(data.data);
      } else {
        setErrorMsg(data.message || `Unable to load order details for #${id}`);
      }
    } catch (e) {
      console.error(e);
      setErrorMsg('Network connection error while fetching order details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchOrderDetails();
  }, [id]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3">
        <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin" />
        <p className="text-xs font-bold text-slate-500">Loading Order Details...</p>
      </div>
    );
  }

  if (errorMsg || !order) {
    return (
      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm max-w-lg mx-auto text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
        <h2 className="text-lg font-bold text-slate-900">Order Not Found</h2>
        <p className="text-xs text-slate-500">{errorMsg || 'Order details could not be retrieved.'}</p>
        <Link
          href="/orders"
          className="inline-flex items-center gap-2 bg-slate-900 text-white font-bold text-xs px-5 py-2.5 rounded-xl"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Orders
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <Link
            href="/orders"
            className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase">
              Order #{order.orderNumber}
            </span>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">
              Pickup Order Details
            </h1>
            <p className="text-xs text-slate-500">Full audit log & live agent tracking info</p>
          </div>
        </div>

        <span
          className={`px-4 py-1.5 rounded-full text-xs font-extrabold uppercase self-start sm:self-auto ${
            order.status === 'SETTLEMENT_COMPLETED' || order.status === 'PICKUP_COMPLETED'
              ? 'bg-emerald-100 text-emerald-800'
              : order.status === 'CANCELLED'
              ? 'bg-rose-100 text-rose-800'
              : 'bg-amber-100 text-amber-800'
          }`}
        >
          {order.status.replace(/_/g, ' ')}
        </span>
      </div>

      {/* DETAILS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT 2 COLUMNS: CUSTOMER & ADDRESS & ITEMS */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">Customer Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-400 font-bold block">Name</span>
                <span className="font-extrabold text-slate-900 text-sm">{order.customer?.user?.name || 'Customer'}</span>
              </div>
              <div>
                <span className="text-slate-400 font-bold block">Phone</span>
                <span className="font-extrabold text-slate-900 text-sm">{order.customer?.user?.phone}</span>
              </div>
              <div className="sm:col-span-2">
                <span className="text-slate-400 font-bold block">Address</span>
                <span className="font-bold text-slate-800">
                  {order.address?.houseNo}, {order.address?.street}, {order.address?.area} - {order.address?.pincode}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">Pickup Items</h2>
            <div className="space-y-2">
              {order.items?.map((item: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100 text-xs">
                  <div>
                    <span className="font-bold text-slate-900 block">{item.category?.name || 'Waste Category'}</span>
                    <span className="text-slate-400">{item.weightKg ? `${item.weightKg} kg` : 'Est. 5 kg'}</span>
                  </div>
                  <span className="font-extrabold text-slate-900">₹{item.totalPrice || item.ratePerKg * 5}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: FINANCIAL SUMMARY & AGENT */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">Payment Breakdown</h2>
            <div className="space-y-2 text-xs font-semibold">
              <div className="flex justify-between text-slate-600">
                <span>Base Service Fee</span>
                <span>₹{order.basePickupCharge || 69}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Discount / Coupon</span>
                <span className="text-emerald-600">-₹{order.discountAmount || 0}</span>
              </div>
              <div className="border-t border-slate-100 pt-2 flex justify-between text-sm font-extrabold text-slate-900">
                <span>Net Payable</span>
                <span>₹{order.finalAmount || order.estimatedTotal}</span>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">Assigned Agent</h2>
            {order.agent ? (
              <div className="space-y-2 text-xs">
                <p className="font-extrabold text-slate-900 text-sm">{order.agent.user?.name}</p>
                <p className="text-slate-500 font-medium">Vehicle: {order.agent.vehicleNumber} ({order.agent.vehicleType})</p>
                <p className="text-slate-500 font-medium">Phone: {order.agent.user?.phone}</p>
              </div>
            ) : (
              <p className="text-xs font-bold text-amber-600">No agent assigned yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
