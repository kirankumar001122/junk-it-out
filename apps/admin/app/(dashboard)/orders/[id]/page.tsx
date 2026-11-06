'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Package,
  Clock,
  User,
  Phone,
  Mail,
  MapPin,
  Truck,
  Scale,
  CreditCard,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Copy,
  Check,
  UserPlus,
  FileText,
  DollarSign,
  History,
  Tag,
  ShieldCheck,
} from 'lucide-react';
import { adminFetch } from '@/lib/api';
import { cachedAdminFetch, invalidateClientCache } from '@/lib/clientCache';

export default function AdminOrderDetailPage({ params }: { params?: { id?: string } | Promise<{ id?: string }> }) {
  const routeParams = useParams();
  const router = useRouter();

  // Resolve ID from hook or prop
  const [resolvedId, setResolvedId] = useState<string>('');

  useEffect(() => {
    if (params) {
      if (params instanceof Promise) {
        params.then((p) => {
          if (p?.id) setResolvedId(decodeURIComponent(p.id).trim());
        });
      } else if (params.id) {
        setResolvedId(decodeURIComponent(params.id).trim());
        return;
      }
    }
    if (routeParams?.id) {
      setResolvedId(decodeURIComponent(routeParams.id as string).trim());
    }
  }, [params, routeParams]);

  const [order, setOrder] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Agent assignment modal state
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const fetchOrderDetail = useCallback(async (idToFetch: string) => {
    if (!idToFetch) return;
    setLoading(true);
    setErrorMsg(null);
    setErrorCode(null);

    try {
      const res = await adminFetch(`/api/orders/${encodeURIComponent(idToFetch)}`);
      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.success) {
        setErrorCode(json.error?.code || (res.status === 404 ? 'ORDER_NOT_FOUND' : 'ERROR'));
        setErrorMsg(json.error?.message || json.message || `Failed to retrieve order #${idToFetch} (HTTP ${res.status}).`);
        setOrder(null);
        return;
      }

      setOrder(json.data);
    } catch (err: any) {
      console.error('Error fetching order detail:', err);
      setErrorMsg(err.message || 'Network error while retrieving order details.');
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (resolvedId) {
      fetchOrderDetail(resolvedId);
    }
  }, [resolvedId, fetchOrderDetail]);

  // Load agents when modal opens
  const openAssignModal = async () => {
    setShowAssignModal(true);
    setAssignError(null);
    try {
      const agentsRes = await cachedAdminFetch('/api/admin/agents');
      if (agentsRes && agentsRes.success && Array.isArray(agentsRes.data)) {
        setAgents(agentsRes.data);
        if (order?.agentId && agentsRes.data.some((a: any) => a.id === order.agentId)) {
          setSelectedAgentId(order.agentId);
        } else {
          const firstAvailable = agentsRes.data.find((a: any) => a.status === 'AVAILABLE');
          setSelectedAgentId(firstAvailable ? firstAvailable.id : (agentsRes.data[0]?.id || ''));
        }
      }
    } catch (e) {
      console.error('Error loading agents:', e);
      setAssignError('Failed to load active field agents.');
    }
  };

  const handleAssignAgent = async () => {
    if (!order?.id || !selectedAgentId) return;
    setAssignLoading(true);
    setAssignError(null);

    try {
      const res = await adminFetch(`/api/orders/${order.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selectedAgentId }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        setShowAssignModal(false);
        invalidateClientCache('/api/admin/agents');
        await fetchOrderDetail(order.id);
      } else {
        setAssignError(data.error?.message || data.message || 'Failed to assign agent to order.');
      }
    } catch (err: any) {
      console.error('Assignment error:', err);
      setAssignError('Network error while assigning field agent.');
    } finally {
      setAssignLoading(false);
    }
  };

  const handleCopyOrderNumber = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Helper status color badges
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PICKUP_COMPLETED':
      case 'SETTLEMENT_COMPLETED':
        return {
          bg: 'bg-emerald-100 text-emerald-800 border-emerald-300',
          icon: <CheckCircle2 className="w-3.5 h-3.5" />,
          label: 'Completed',
        };
      case 'AGENT_ON_WAY':
      case 'AGENT_ARRIVED':
      case 'AGENT_ASSIGNED':
      case 'AGENT_ACCEPTED':
        return {
          bg: 'bg-blue-100 text-blue-800 border-blue-300',
          icon: <Truck className="w-3.5 h-3.5" />,
          label: status.replace(/_/g, ' '),
        };
      case 'WASTE_VERIFICATION':
      case 'WEIGHING':
      case 'COLLECTING':
        return {
          bg: 'bg-purple-100 text-purple-800 border-purple-300',
          icon: <Scale className="w-3.5 h-3.5" />,
          label: status.replace(/_/g, ' '),
        };
      case 'CANCELLED':
        return {
          bg: 'bg-rose-100 text-rose-800 border-rose-300',
          icon: <XCircle className="w-3.5 h-3.5" />,
          label: 'Cancelled',
        };
      case 'BOOKING_RECEIVED':
      default:
        return {
          bg: 'bg-amber-100 text-amber-800 border-amber-300',
          icon: <Clock className="w-3.5 h-3.5" />,
          label: status ? status.replace(/_/g, ' ') : 'Booking Received',
        };
    }
  };

  const formatDateTime = (dateStr?: string | Date) => {
    if (!dateStr) return 'N/A';
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return String(dateStr);
    }
  };

  // Total weight calculations
  const totalEstWeight = useMemo(() => {
    if (!order?.items || !Array.isArray(order.items)) return 0;
    return order.items.reduce((sum: number, it: any) => sum + (Number(it.estimatedWeight) || 0), 0);
  }, [order?.items]);

  const totalActualWeight = useMemo(() => {
    if (order?.settlement?.totalWeightKg) return Number(order.settlement.totalWeightKg);
    if (!order?.items || !Array.isArray(order.items)) return null;
    const hasActual = order.items.some((it: any) => it.actualWeight !== null && it.actualWeight !== undefined);
    if (!hasActual) return null;
    return order.items.reduce((sum: number, it: any) => sum + (Number(it.actualWeight) || 0), 0);
  }, [order?.items, order?.settlement]);

  // Loading Skeleton
  if (loading && !order) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href="/orders"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white px-3 py-2 rounded-xl border border-slate-200"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Orders
          </Link>
          <div className="h-6 w-48 bg-slate-200 rounded-lg animate-pulse" />
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <div className="h-8 w-64 bg-slate-200 rounded-lg animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="h-24 bg-slate-100 rounded-2xl animate-pulse" />
            <div className="h-24 bg-slate-100 rounded-2xl animate-pulse" />
            <div className="h-24 bg-slate-100 rounded-2xl animate-pulse" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm h-64 animate-pulse" />
      </div>
    );
  }

  // Error / Not Found View
  if (errorMsg || !order) {
    return (
      <div className="space-y-6">
        <Link
          href="/orders"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white px-3 py-2 rounded-xl border border-slate-200"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Orders
        </Link>

        <div className="bg-white p-8 rounded-3xl border border-rose-200 shadow-sm text-center max-w-xl mx-auto space-y-4">
          <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-black text-slate-900">
            {errorCode === 'ORDER_NOT_FOUND' ? 'Order Not Found' : 'Unable to Load Order Details'}
          </h2>
          <p className="text-xs text-slate-600">
            {errorMsg || `The requested order identifier "${resolvedId}" could not be located in the operational database.`}
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => fetchOrderDetail(resolvedId)}
              className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-4 py-2.5 rounded-xl border border-slate-200 flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Retry Loading
            </button>
            <Link
              href="/orders"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-md transition-colors"
            >
              Return to Orders Roster
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const statusBadge = getStatusBadge(order.status);
  const isTerminal = ['PICKUP_COMPLETED', 'SETTLEMENT_COMPLETED', 'CANCELLED'].includes(order.status);

  return (
    <div className="space-y-6">
      {/* TOP BREADCRUMB & ACTION BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <Link
            href="/orders"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3.5 py-2 rounded-xl transition-colors self-start"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Orders
          </Link>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-900 font-mono tracking-tight">{order.orderNumber}</h1>
              <button
                onClick={() => handleCopyOrderNumber(order.orderNumber)}
                title="Copy Order Number"
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
              <span className={`inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase px-3 py-1 rounded-full border ${statusBadge.bg}`}>
                {statusBadge.icon}
                {statusBadge.label}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              UUID: <span className="font-mono text-slate-600">{order.id}</span> • Placed: {formatDateTime(order.createdAt)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          {!isTerminal && (
            <button
              onClick={openAssignModal}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-md flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              {order.agent ? 'Reassign Agent' : 'Assign Field Agent'}
            </button>
          )}

          <button
            onClick={() => fetchOrderDetail(resolvedId)}
            disabled={loading}
            className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* 2-COLUMN PARTICIPANT CARDS: CUSTOMER & AGENT */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* CUSTOMER CARD */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <User className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900">Customer Profile</h3>
                <span className="text-[11px] text-slate-400">Booking Client Contact</span>
              </div>
            </div>
            <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg">
              ID: {order.customerId?.slice(0, 8)}...
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between py-1 border-b border-slate-50">
              <span className="text-slate-500 font-medium">Customer Name</span>
              <span className="text-slate-900 font-bold">{order.customer?.user?.name || 'Guest Customer'}</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-slate-50">
              <span className="text-slate-500 font-medium">Primary Mobile</span>
              <a href={`tel:${order.customer?.user?.phone}`} className="text-emerald-700 font-bold hover:underline flex items-center gap-1">
                <Phone className="w-3 h-3" />
                {order.customer?.user?.phone || 'Not provided'}
              </a>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-slate-50">
              <span className="text-slate-500 font-medium">Email Address</span>
              <span className="text-slate-800 font-medium">{order.customer?.user?.email || 'N/A'}</span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-slate-500 font-medium">Pickup Request Type</span>
              <span className="font-extrabold uppercase text-[11px] bg-slate-100 text-slate-800 px-2.5 py-0.5 rounded-md">
                {order.pickupType || 'Standard'} {order.scheduledSlot ? `(${order.scheduledSlot})` : ''}
              </span>
            </div>
          </div>
        </div>

        {/* AGENT CARD */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center">
                <Truck className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900">Assigned Field Agent</h3>
                <span className="text-[11px] text-slate-400">Operations Fleet Dispatch</span>
              </div>
            </div>
            {order.agent ? (
              <span className="text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-lg uppercase">
                {order.agent.status || 'Assigned'}
              </span>
            ) : (
              <span className="text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-lg uppercase">
                Unassigned
              </span>
            )}
          </div>

          {order.agent ? (
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-slate-50">
                <span className="text-slate-500 font-medium">Agent Name</span>
                <span className="text-slate-900 font-bold">{order.agent.user?.name || 'Field Agent'}</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-50">
                <span className="text-slate-500 font-medium">Agent Mobile</span>
                <a href={`tel:${order.agent.user?.phone}`} className="text-blue-700 font-bold hover:underline flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  {order.agent.user?.phone || 'N/A'}
                </a>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-50">
                <span className="text-slate-500 font-medium">Vehicle Details</span>
                <span className="text-slate-800 font-bold">
                  {order.agent.vehicleNumber || 'No plate'} ({order.agent.vehicleType || 'Truck'})
                </span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-slate-500 font-medium">Agent Rating</span>
                <span className="text-amber-600 font-extrabold flex items-center gap-1">
                  ★ {order.agent.rating ? Number(order.agent.rating).toFixed(1) : '5.0'}
                </span>
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center space-y-2">
              <p className="text-xs text-amber-900 font-medium">No field agent has been dispatched to this pickup order yet.</p>
              {!isTerminal && (
                <button
                  onClick={openAssignModal}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition-colors inline-flex items-center gap-1.5"
                >
                  <UserPlus className="w-3.5 h-3.5" /> Dispatch Agent
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* PICKUP ADDRESS & LOCATION */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
          <div className="w-9 h-9 rounded-2xl bg-teal-100 text-teal-700 flex items-center justify-center">
            <MapPin className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-900">Pickup Location & Dispatch Address</h3>
            <span className="text-[11px] text-slate-400">South Bengaluru Service Zone</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="space-y-1.5 bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <span className="text-slate-400 font-bold uppercase text-[10px]">Doorstep Address</span>
            <p className="text-slate-900 font-bold text-sm">
              {[order.address?.houseNo, order.address?.street].filter(Boolean).join(', ') || 'Address street not provided'}
            </p>
            <p className="text-slate-600">
              {[order.address?.area, order.address?.city, order.address?.pincode].filter(Boolean).join(' • ') || 'Area not specified'}
            </p>
          </div>

          <div className="space-y-1.5 bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <span className="text-slate-400 font-bold uppercase text-[10px]">Pickup Instructions & GPS Coordinates</span>
            <p className="text-slate-800 font-medium italic">
              {order.address?.pickupInstructions ? `"${order.address.pickupInstructions}"` : 'No special entry/gate instructions.'}
            </p>
            {order.address?.lat && order.address?.lng && (
              <p className="text-slate-500 font-mono text-[11px] pt-1">
                GPS: {Number(order.address.lat).toFixed(5)}, {Number(order.address.lng).toFixed(5)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* MATERIALS & WEIGHTS TABLE */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
              <Scale className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">Waste Items & Scale Verification</h3>
              <span className="text-[11px] text-slate-400">Material classifications, scrap rates, and weights</span>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="font-bold text-slate-500">
              Est. Weight: <span className="text-slate-900 font-black">{totalEstWeight} kg</span>
            </span>
            {totalActualWeight !== null && (
              <span className="font-bold text-slate-500">
                Verified Scale: <span className="text-emerald-700 font-black">{totalActualWeight} kg</span>
              </span>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px]">
              <tr>
                <th className="p-3">Material Category</th>
                <th className="p-3">Classification</th>
                <th className="p-3 text-right">Est. Weight</th>
                <th className="p-3 text-right">Scale Verified Weight</th>
                <th className="p-3 text-right">Rate / kg</th>
                <th className="p-3 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {order.items && order.items.length > 0 ? (
                order.items.map((it: any) => (
                  <tr key={it.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3">
                      <span className="font-bold text-slate-900 block">{it.category?.name || 'Waste Item'}</span>
                      {it.category?.description && (
                        <span className="text-[10px] text-slate-400 truncate block max-w-xs">{it.category.description}</span>
                      )}
                    </td>
                    <td className="p-3">
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                        {it.category?.type ? it.category.type.replace(/_/g, ' ') : 'Recyclable'}
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-slate-700">{it.estimatedWeight} kg</td>
                    <td className="p-3 text-right font-mono font-bold">
                      {it.actualWeight !== null && it.actualWeight !== undefined ? (
                        <span className="text-emerald-700">{it.actualWeight} kg</span>
                      ) : (
                        <span className="text-slate-400 font-normal italic">Pending scale</span>
                      )}
                    </td>
                    <td className="p-3 text-right font-mono text-slate-700">₹{it.ratePerKg || it.category?.pricePerKg || 0}</td>
                    <td className="p-3 text-right font-mono font-black text-slate-900">
                      ₹{it.subtotal || Math.round((Number(it.actualWeight ?? it.estimatedWeight) || 0) * (Number(it.ratePerKg || it.category?.pricePerKg) || 0))}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-400 font-medium">
                    No individual line items recorded for this order.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2-COLUMN BOTTOM: FINANCIALS & STATUS TIMELINE */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* FINANCIALS CARD */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
            <div className="w-9 h-9 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">Financials & Settlement Summary</h3>
              <span className="text-[11px] text-slate-400">Charges, payouts, discounts, and payment gateway state</span>
            </div>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between py-1 border-b border-slate-50">
              <span className="text-slate-500 font-medium">Financial Direction</span>
              <span className="font-extrabold uppercase text-[11px] bg-slate-100 px-2.5 py-0.5 rounded-md text-slate-800">
                {order.financialDirection === 'CUSTOMER_PAYS' ? 'Customer Pays Platform' : 'Platform Pays Customer (Payout)'}
              </span>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-slate-50">
              <span className="text-slate-500 font-medium">Estimated Scrap Total</span>
              <span className="text-slate-900 font-mono font-bold">₹{order.estimatedTotal || 0}</span>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-slate-50">
              <span className="text-slate-500 font-medium">Actual Weighed Scrap Value</span>
              <span className="text-slate-900 font-mono font-bold">₹{order.actualTotal || 0}</span>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-slate-50">
              <span className="text-slate-500 font-medium">Pickup & Convenience Fee</span>
              <span className="text-slate-900 font-mono font-bold">₹{order.pickupCharge || 0}</span>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-slate-50">
              <span className="text-slate-500 font-medium">Promotional Discount</span>
              <span className="text-emerald-700 font-mono font-bold">-₹{order.discountAmount || 0}</span>
            </div>

            <div className="flex items-center justify-between py-2 border-t border-slate-200 mt-2">
              <span className="text-slate-900 font-black text-sm">Final Net Amount</span>
              <span className="text-xl font-black font-mono text-emerald-700">₹{order.finalAmount ?? order.actualTotal ?? order.estimatedTotal ?? 0}</span>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 flex items-center justify-between mt-3">
              <span className="text-slate-600 font-bold">Payment Status:</span>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                order.paymentStatus === 'CAPTURED'
                  ? 'bg-emerald-100 text-emerald-800'
                  : order.paymentStatus === 'REFUNDED'
                  ? 'bg-slate-200 text-slate-800'
                  : 'bg-amber-100 text-amber-800'
              }`}>
                {order.paymentStatus || 'PENDING'}
              </span>
            </div>

            {order.payments && order.payments.length > 0 && (
              <div className="pt-2">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">Payment Transactions ({order.payments.length})</span>
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {order.payments.map((p: any) => (
                    <div key={p.id} className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-center justify-between text-[11px]">
                      <div>
                        <span className="font-mono font-bold text-slate-800 block">ID: {p.gatewayOrderId || p.id?.slice(0, 8)}</span>
                        <span className="text-slate-400">{formatDateTime(p.createdAt)} • {p.method || 'Online'}</span>
                      </div>
                      <span className="font-mono font-black text-emerald-700">₹{p.amount}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ORDER TIMELINE / STATUS HISTORY */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
            <div className="w-9 h-9 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">Order Audit Timeline</h3>
              <span className="text-[11px] text-slate-400">Chronological lifecycle transitions & audit events</span>
            </div>
          </div>

          <div className="space-y-4 max-h-[360px] overflow-y-auto pr-1">
            {order.statusHistory && order.statusHistory.length > 0 ? (
              order.statusHistory.map((hist: any, idx: number) => (
                <div key={hist.id || idx} className="flex items-start gap-3 relative">
                  {idx < order.statusHistory.length - 1 && (
                    <div className="absolute left-3.5 top-6 bottom-0 w-0.5 bg-slate-200" />
                  )}
                  <div className="w-7 h-7 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0 z-10">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-extrabold uppercase text-[11px] text-slate-900">
                        {hist.newStatus ? hist.newStatus.replace(/_/g, ' ') : 'Status Updated'}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">
                        {formatDateTime(hist.timestamp)}
                      </span>
                    </div>
                    {hist.oldStatus && (
                      <p className="text-[10px] text-slate-500">
                        From: <span className="font-semibold">{hist.oldStatus.replace(/_/g, ' ')}</span>
                      </p>
                    )}
                    {hist.notes && (
                      <p className="text-slate-600 mt-1 font-medium">{hist.notes}</p>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400 text-center py-8">
                No recorded status history transitions for this order.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ASSIGN AGENT MODAL */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-black text-slate-900">Assign Field Agent</h3>
              <button
                onClick={() => setShowAssignModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Assign a registered field agent to pickup order <span className="font-mono font-bold text-slate-800">{order.orderNumber}</span> ({order.address?.area || 'South Bengaluru'}).
            </p>

            {assignError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-800">
                {assignError}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">Select Field Agent</label>
              <select
                value={selectedAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              >
                {agents.length === 0 ? (
                  <option value="">No registered agents available</option>
                ) : (
                  agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name || a.user?.name} ({a.vehicleNumber || 'No Plate'}) — [{a.status}]
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                onClick={() => setShowAssignModal(false)}
                disabled={assignLoading}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignAgent}
                disabled={assignLoading || !selectedAgentId}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-md transition-colors disabled:opacity-50 flex items-center gap-2 cursor-pointer"
              >
                {assignLoading ? 'Assigning...' : 'Confirm Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
