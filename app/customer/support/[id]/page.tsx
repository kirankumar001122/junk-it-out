'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Clock,
  HelpCircle,
  FileText,
  RefreshCw,
  Send,
  ExternalLink,
  MessageSquare,
  ShieldCheck,
  AlertTriangle,
  Camera,
  XCircle,
} from 'lucide-react';
import EvidenceImagePreview from '@/components/EvidenceImagePreview';

interface TimelineStep {
  id: string;
  status: string;
  title: string;
  description: string;
  timestamp: string;
  actorRole: string;
  evidenceUrl?: string | null;
}

interface DisputeRecord {
  id: string;
  referenceNumber: string;
  orderId?: string | null;
  customerId: string;
  category: string;
  description: string;
  status: string;
  photoUrl?: string | null;
  customerUpdate?: string | null;
  resolutionDetails?: string | null;
  createdAt: string;
  updatedAt: string;
  order?: {
    id: string;
    orderNumber: string;
    status: string;
    scheduledSlot?: string | null;
    finalAmount?: number | null;
    estimatedTotal?: number | null;
    createdAt: string;
    address?: {
      area?: string | null;
      street?: string | null;
      city?: string | null;
      pincode?: string | null;
    } | null;
  } | null;
  timeline: TimelineStep[];
}

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; border: string; icon: any }
> = {
  OPEN: {
    label: 'Open',
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-200',
    icon: Clock,
  },
  UNDER_REVIEW: {
    label: 'Under Review',
    bg: 'bg-blue-50',
    text: 'text-blue-800',
    border: 'border-blue-200',
    icon: RefreshCw,
  },
  AWAITING_CUSTOMER: {
    label: 'Awaiting Your Input',
    bg: 'bg-purple-50',
    text: 'text-purple-800',
    border: 'border-purple-200',
    icon: AlertTriangle,
  },
  RESOLVED: {
    label: 'Resolved',
    bg: 'bg-emerald-50',
    text: 'text-emerald-800',
    border: 'border-emerald-200',
    icon: CheckCircle2,
  },
  REJECTED: {
    label: 'Rejected',
    bg: 'bg-rose-50',
    text: 'text-rose-800',
    border: 'border-rose-200',
    icon: XCircle,
  },
};

export default function DisputeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;

  const [dispute, setDispute] = useState<DisputeRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Customer response form state
  const [responseText, setResponseText] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [responseSuccess, setResponseSuccess] = useState(false);
  const [responseError, setResponseError] = useState<string | null>(null);

  const fetchDispute = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/complaints/${id}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setDispute(data.data);
      } else {
        setError(data.message || 'Unable to load dispute details.');
      }
    } catch {
      setError('Network error loading dispute details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDispute();
  }, [id]);

  const handleCustomerResponse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!responseText.trim() && !evidenceUrl.trim()) return;

    setSubmitting(true);
    setResponseError(null);
    setResponseSuccess(false);

    try {
      const res = await fetch(`/api/complaints/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: responseText.trim(),
          photoUrl: evidenceUrl.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setResponseSuccess(true);
        setResponseText('');
        setEvidenceUrl('');
        await fetchDispute();
      } else {
        setResponseError(data.message || 'Failed to submit response.');
      }
    } catch {
      setResponseError('Network error submitting response. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="customer-page min-h-[60vh] flex flex-col items-center justify-center space-y-3">
        <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin" />
        <p className="text-xs font-bold text-slate-500">Loading dispute status & timeline...</p>
      </div>
    );
  }

  if (error || !dispute) {
    return (
      <div className="customer-page space-y-4">
        <Link
          href="/customer/support"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Customer Support
        </Link>
        <div className="customer-surface p-8 text-center space-y-3">
          <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
          <h2 className="text-base font-extrabold text-slate-900">Dispute Not Found</h2>
          <p className="text-xs text-slate-600 max-w-md mx-auto">
            {error || 'This support ticket could not be found or you do not have permission to view it.'}
          </p>
          <button
            onClick={fetchDispute}
            className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const currentStatusCfg =
    STATUS_CONFIG[dispute.status] || {
      label: dispute.status,
      bg: 'bg-slate-100',
      text: 'text-slate-800',
      border: 'border-slate-200',
      icon: Clock,
    };
  const StatusIcon = currentStatusCfg.icon;

  const isAwaitingCustomer = dispute.status === 'AWAITING_CUSTOMER';

  return (
    <div className="customer-page space-y-6">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/customer/support"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Customer Support
        </Link>
        <button
          onClick={fetchDispute}
          title="Refresh dispute status"
          className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors flex items-center gap-1 text-xs font-bold"
        >
          <RefreshCw className="w-3.5 h-3.5 text-emerald-600" />
          Refresh
        </button>
      </div>

      {/* Header Banner */}
      <div className="customer-surface p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                Ticket Ref
              </span>
              <span className="text-xs font-mono font-black text-slate-900 bg-slate-100 px-2.5 py-0.5 rounded-lg border border-slate-200">
                {dispute.referenceNumber}
              </span>
            </div>
            <h1 className="customer-title mt-1.5 text-xl sm:text-2xl font-black text-slate-900">
              {dispute.category.replace(/_/g, ' ')}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Filed on {new Date(dispute.createdAt).toLocaleString('en-IN', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </p>
          </div>

          <div
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-2xl border ${currentStatusCfg.bg} ${currentStatusCfg.border} ${currentStatusCfg.text}`}
          >
            <StatusIcon className="w-4 h-4 shrink-0" />
            <span className="text-xs font-extrabold uppercase tracking-wide">
              {currentStatusCfg.label}
            </span>
          </div>
        </div>

        {/* 5-Stage Visual Stepper */}
        <div className="pt-2 border-t border-slate-100">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
            Dispute Status Flow
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-center text-[10px] font-bold">
            {['OPEN', 'UNDER_REVIEW', 'AWAITING_CUSTOMER', 'RESOLVED', 'REJECTED'].map((st) => {
              const isCurrent = dispute.status === st;
              const isPast =
                (st === 'OPEN' && dispute.status !== 'OPEN') ||
                (st === 'UNDER_REVIEW' && (dispute.status === 'RESOLVED' || dispute.status === 'REJECTED'));
              return (
                <div
                  key={st}
                  className={`p-2 rounded-xl border transition-all ${
                    isCurrent
                      ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                      : isPast
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-slate-50 text-slate-400 border-slate-100'
                  }`}
                >
                  <span className="block truncate">{st.replace(/_/g, ' ')}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Linked Order Card (if applicable) */}
      {dispute.order && (
        <div className="customer-surface p-5 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-emerald-600" />
              Associated Pickup Booking
            </h2>
            <Link
              href={`/orders/${dispute.order.id}`}
              className="text-xs font-extrabold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
            >
              View Order Tracking
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 text-xs">
            <div>
              <span className="block text-[10px] text-slate-400 font-bold uppercase">Order #</span>
              <span className="font-extrabold text-slate-900">{dispute.order.orderNumber}</span>
            </div>
            <div>
              <span className="block text-[10px] text-slate-400 font-bold uppercase">Pickup Slot</span>
              <span className="font-extrabold text-slate-900">
                {dispute.order.scheduledSlot || 'ASAP (20–30 mins)'}
              </span>
            </div>
            <div>
              <span className="block text-[10px] text-slate-400 font-bold uppercase">Area</span>
              <span className="font-extrabold text-slate-900">
                {dispute.order.address?.area || 'Bengaluru'}
              </span>
            </div>
            <div>
              <span className="block text-[10px] text-slate-400 font-bold uppercase">Order Status</span>
              <span className="font-extrabold text-emerald-700">{dispute.order.status}</span>
            </div>
          </div>
        </div>
      )}

      {/* AWAITING CUSTOMER ACTION BANNER */}
      {isAwaitingCustomer && (
        <div className="customer-surface p-5 sm:p-6 bg-purple-50/70 border border-purple-200 rounded-3xl space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-extrabold text-purple-950">Action Required: Information Requested</h3>
              <p className="text-xs text-purple-900/90 leading-relaxed">
                Our support team is actively reviewing your dispute and has requested additional information or evidence photos.
                Please provide your response below to resume review.
              </p>
            </div>
          </div>

          {responseSuccess && (
            <div className="p-3 bg-emerald-100/80 border border-emerald-300 text-emerald-950 rounded-xl text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              <span>Your response has been submitted! Support operations will review it shortly.</span>
            </div>
          )}

          {responseError && (
            <div className="p-3 bg-rose-100/80 border border-rose-300 text-rose-950 rounded-xl text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-700" />
              <span>{responseError}</span>
            </div>
          )}

          <form onSubmit={handleCustomerResponse} className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-purple-950 mb-1">
                Your Response / Clarification:
              </label>
              <textarea
                rows={3}
                value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
                placeholder="Type your response to support operations..."
                className="w-full bg-white border border-purple-200 rounded-2xl p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-purple-950 mb-1">
                Evidence / Photo Link (Optional):
              </label>
              <input
                type="text"
                value={evidenceUrl}
                onChange={(e) => setEvidenceUrl(e.target.value)}
                placeholder="https://... (or image URL)"
                className="w-full bg-white border border-purple-200 rounded-xl p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || (!responseText.trim() && !evidenceUrl.trim())}
              className="px-5 py-3 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-extrabold text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Submit Customer Response
            </button>
          </form>
        </div>
      )}

      {/* Original Issue Statement & Evidence */}
      <div className="customer-surface p-5 sm:p-6 space-y-3">
        <h2 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <MessageSquare className="w-4 h-4 text-emerald-600" />
          Dispute Description & Evidence
        </h2>
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 text-xs text-slate-800 leading-relaxed whitespace-pre-line">
          {dispute.description || 'No description provided.'}
        </div>
        {dispute.photoUrl && (
          <div className="pt-2">
            <EvidenceImagePreview
              src={dispute.photoUrl}
              alt="Dispute evidence photo"
              caption="Attached Photographic Evidence"
            />
          </div>
        )}
      </div>

      {/* Final Resolution Details (if terminal) */}
      {(dispute.status === 'RESOLVED' || dispute.status === 'REJECTED') && (
        <div
          className={`customer-surface p-5 sm:p-6 rounded-3xl border ${
            dispute.status === 'RESOLVED'
              ? 'bg-emerald-50/70 border-emerald-200'
              : 'bg-rose-50/70 border-rose-200'
          } space-y-2`}
        >
          <div className="flex items-center gap-2">
            {dispute.status === 'RESOLVED' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            ) : (
              <XCircle className="w-5 h-5 text-rose-600" />
            )}
            <h3 className="text-sm font-extrabold text-slate-900">
              {dispute.status === 'RESOLVED' ? 'Resolution Outcome' : 'Rejection Reason'}
            </h3>
          </div>
          <p className="text-xs text-slate-700 leading-relaxed">
            {dispute.resolutionDetails ||
              dispute.customerUpdate ||
              (dispute.status === 'RESOLVED'
                ? 'Your dispute was reviewed and resolved by operations desk.'
                : 'Your dispute was reviewed and determined to not require adjustment.')}
          </p>
        </div>
      )}

      {/* Chronological Status Timeline */}
      <div className="customer-surface p-5 sm:p-6 space-y-4">
        <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
          <Clock className="w-4 h-4 text-emerald-600" />
          Live Chronological Status Timeline
        </h2>

        <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
          {dispute.timeline.map((step, idx) => {
            const stepCfg =
              STATUS_CONFIG[step.status] || {
                label: step.status,
                bg: 'bg-slate-100',
                text: 'text-slate-800',
                border: 'border-slate-200',
                icon: Clock,
              };
            const StepIcon = stepCfg.icon;

            return (
              <div key={step.id || idx} className="relative space-y-1">
                {/* Node icon */}
                <div
                  className={`absolute -left-6 top-0.5 w-5 h-5 rounded-full border-2 border-white flex items-center justify-center text-white ${
                    step.status === 'RESOLVED'
                      ? 'bg-emerald-600'
                      : step.status === 'REJECTED'
                      ? 'bg-rose-600'
                      : step.status === 'AWAITING_CUSTOMER'
                      ? 'bg-purple-600'
                      : step.status === 'UNDER_REVIEW'
                      ? 'bg-blue-600'
                      : 'bg-amber-500'
                  }`}
                >
                  <StepIcon className="w-2.5 h-2.5" />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-900">{step.title}</span>
                  <span className="text-[10px] font-mono text-slate-400">
                    {new Date(step.timestamp).toLocaleString('en-IN', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </span>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
                  {step.description}
                </p>

                {step.evidenceUrl && (
                  <div className="pt-1">
                    <span className="text-[10px] text-slate-400 font-bold block">Evidence attached:</span>
                    <a
                      href={step.evidenceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-emerald-600 font-bold hover:underline truncate block max-w-xs"
                    >
                      {step.evidenceUrl}
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

