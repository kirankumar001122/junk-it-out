'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  AlertCircle,
  RefreshCw,
  Search,
  X,
  Eye,
  CheckCircle2,
  Clock,
  HelpCircle,
  FileText,
  Loader2,
  Paperclip,
  ExternalLink,
  MessageSquare,
  ShieldAlert,
} from 'lucide-react';
import EvidenceImagePreview from '@/components/EvidenceImagePreview';

interface ComplaintRecord {
  id: string;
  orderId?: string | null;
  orderNumber?: string;
  customerName?: string;
  customerPhone?: string;
  category?: string;
  description?: string;
  message?: string;
  status: string;
  photoUrl?: string | null;
  resolutionNotes?: string | null;
  createdAt?: string;
}

export default function AdminComplaintsPage() {
  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'DATE_DESC' | 'DATE_ASC' | 'CATEGORY_ASC'>('DATE_DESC');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  // Details / Resolution Modal State
  const [selectedComplaint, setSelectedComplaint] = useState<ComplaintRecord | null>(null);
  const [editStatus, setEditStatus] = useState<string>('OPEN');
  const [editResolutionNotes, setEditResolutionNotes] = useState<string>('');
  const [editCustomerUpdate, setEditCustomerUpdate] = useState<string>('');
  const [editInternalNotes, setEditInternalNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [modalFeedback, setModalFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // Dirty check for unsaved edits in dispute modal
  const isDirty = useMemo(() => {
    if (!selectedComplaint) return false;
    const initialStatus = selectedComplaint.status || 'OPEN';
    const initialNotes = selectedComplaint.resolutionNotes || '';
    return (
      editStatus !== initialStatus ||
      editResolutionNotes !== initialNotes ||
      editCustomerUpdate.trim() !== '' ||
      editInternalNotes.trim() !== ''
    );
  }, [selectedComplaint, editStatus, editResolutionNotes, editCustomerUpdate, editInternalNotes]);

  const loadComplaints = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/admin/complaints');
      const data = await res.json();
      if (data.success) {
        setComplaints(data.data || []);
      } else {
        setErrorMsg(data.message || 'Failed to load complaints.');
      }
    } catch (e: any) {
      console.error('Error fetching complaints:', e);
      setErrorMsg(e.message || 'Network error fetching complaints.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComplaints();
  }, []);

  const handleRequestClose = () => {
    if (submitting) return;
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      setSelectedComplaint(null);
      setShowDiscardConfirm(false);
    }
  };

  const handleConfirmDiscard = () => {
    setShowDiscardConfirm(false);
    setSelectedComplaint(null);
  };

  // Keyboard shortcut: Escape closes modal or discard confirm dialog
  useEffect(() => {
    if (!selectedComplaint) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showDiscardConfirm) {
          setShowDiscardConfirm(false);
        } else {
          handleRequestClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedComplaint, showDiscardConfirm, isDirty, submitting]);

  // Lock body scroll when modal is active
  useEffect(() => {
    if (selectedComplaint) {
      const origOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = origOverflow;
      };
    }
  }, [selectedComplaint]);

  // Summary Metrics
  const metrics = useMemo(() => {
    let openCount = 0;
    let underReviewCount = 0;
    let awaitingCustomerCount = 0;
    let resolvedCount = 0;
    let rejectedCount = 0;

    for (const c of complaints) {
      const st = (c.status || '').toUpperCase();
      if (st === 'OPEN' || st === 'PENDING') {
        openCount++;
      } else if (st === 'UNDER_REVIEW' || st === 'IN_PROGRESS' || st === 'INVESTIGATING') {
        underReviewCount++;
      } else if (st === 'AWAITING_CUSTOMER') {
        awaitingCustomerCount++;
      } else if (st === 'RESOLVED' || st === 'CLOSED') {
        resolvedCount++;
      } else if (st === 'REJECTED' || st === 'DISMISSED') {
        rejectedCount++;
      }
    }

    return {
      total: complaints.length,
      open: openCount,
      underReview: underReviewCount,
      awaitingCustomer: awaitingCustomerCount,
      resolved: resolvedCount,
      rejected: rejectedCount,
    };
  }, [complaints]);

  // Filtering & Sorting
  const filteredComplaints = useMemo(() => {
    return complaints
      .filter((c) => {
        // Status Filter
        if (statusFilter !== 'ALL') {
          const st = (c.status || '').toUpperCase();
          if (statusFilter === 'OPEN' && st !== 'OPEN' && st !== 'PENDING') return false;
          if (statusFilter === 'UNDER_REVIEW' && st !== 'UNDER_REVIEW' && st !== 'IN_PROGRESS' && st !== 'INVESTIGATING') return false;
          if (statusFilter === 'AWAITING_CUSTOMER' && st !== 'AWAITING_CUSTOMER') return false;
          if (statusFilter === 'RESOLVED' && st !== 'RESOLVED' && st !== 'CLOSED') return false;
          if (statusFilter === 'REJECTED' && st !== 'REJECTED' && st !== 'DISMISSED') return false;
        }

        // Category Filter
        if (categoryFilter !== 'ALL' && c.category !== categoryFilter) {
          return false;
        }

        // Search Query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const tId = (c.id || '').toLowerCase();
          const cust = (c.customerName || '').toLowerCase();
          const ph = (c.customerPhone || '').toLowerCase();
          const ord = (c.orderNumber || '').toLowerCase();
          const desc = (c.description || c.message || '').toLowerCase();
          const cat = (c.category || '').toLowerCase();
          return tId.includes(q) || cust.includes(q) || ph.includes(q) || ord.includes(q) || desc.includes(q) || cat.includes(q);
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'CATEGORY_ASC') {
          return (a.category || '').localeCompare(b.category || '');
        }
        if (sortBy === 'DATE_ASC') {
          return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
        }
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });
  }, [complaints, statusFilter, categoryFilter, searchQuery, sortBy]);

  // Pagination Calculations
  const totalItems = filteredComplaints.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginatedComplaints = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredComplaints.slice(start, start + pageSize);
  }, [filteredComplaints, currentPage, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const handleOpenDetails = (complaint: ComplaintRecord) => {
    setSelectedComplaint(complaint);
    setEditStatus(complaint.status || 'OPEN');
    setEditResolutionNotes(complaint.resolutionNotes || '');
    setEditCustomerUpdate('');
    setEditInternalNotes('');
    setModalFeedback(null);
    setShowDiscardConfirm(false);
  };

  const handleSaveResolution = async () => {
    if (!selectedComplaint) return;
    setSubmitting(true);
    setModalFeedback(null);

    try {
      const res = await fetch('/api/admin/complaints', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedComplaint.id,
          status: editStatus,
          resolutionNotes: editResolutionNotes.trim() || undefined,
          customerUpdate: editCustomerUpdate.trim() || undefined,
          internalNotes: editInternalNotes.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setModalFeedback({ type: 'success', text: 'Complaint status and live timeline updated successfully.' });
        setTimeout(() => {
          setSelectedComplaint(null);
          loadComplaints();
        }, 1000);
      } else {
        setModalFeedback({ type: 'error', text: data.message || 'Failed to update complaint.' });
      }
    } catch (err: any) {
      setModalFeedback({ type: 'error', text: err.message || 'Network error updating complaint.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <span className="text-xs font-bold text-amber-700 bg-amber-100 px-3 py-1 rounded-full uppercase tracking-wider">
            Customer Escalations Desk
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-2">Support & Complaints Management</h1>
          <p className="text-xs text-slate-500 mt-1">
            Review and resolve real scrap disputes, weighing discrepancies, agent behavioral notes, and pickup delays.
          </p>
        </div>

        <button
          onClick={loadComplaints}
          disabled={loading}
          className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-4 py-2.5 rounded-xl border border-slate-200 flex items-center gap-2 self-start sm:self-auto disabled:opacity-50 transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Tickets</span>
          <p className="text-xl font-black text-slate-900 mt-1">{metrics.total}</p>
        </div>
        <div className="bg-amber-50/60 p-4 rounded-2xl border border-amber-200 shadow-xs">
          <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">Open / Pending</span>
          <p className="text-xl font-black text-amber-900 mt-1">{metrics.open}</p>
        </div>
        <div className="bg-blue-50/60 p-4 rounded-2xl border border-blue-200 shadow-xs">
          <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wider">Under Review</span>
          <p className="text-xl font-black text-blue-900 mt-1">{metrics.underReview}</p>
        </div>
        <div className="bg-purple-50/60 p-4 rounded-2xl border border-purple-200 shadow-xs">
          <span className="text-[10px] font-bold text-purple-800 uppercase tracking-wider">Awaiting Input</span>
          <p className="text-xl font-black text-purple-900 mt-1">{metrics.awaitingCustomer}</p>
        </div>
        <div className="bg-emerald-50/60 p-4 rounded-2xl border border-emerald-200 shadow-xs">
          <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">Resolved</span>
          <p className="text-xl font-black text-emerald-900 mt-1">{metrics.resolved}</p>
        </div>
        <div className="bg-rose-50/60 p-4 rounded-2xl border border-rose-200 shadow-xs">
          <span className="text-[10px] font-bold text-rose-800 uppercase tracking-wider">Rejected</span>
          <p className="text-xl font-black text-rose-900 mt-1">{metrics.rejected}</p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              placeholder="Search by Ticket ID, Customer, Phone, Order #, or Statement..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-2.5 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 text-xs"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="OPEN">Open (New)</option>
              <option value="UNDER_REVIEW">Under Review</option>
              <option value="AWAITING_CUSTOMER">Awaiting Customer</option>
              <option value="RESOLVED">Resolved</option>
              <option value="REJECTED">Rejected</option>
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="ALL">All Categories</option>
              <option value="WEIGHT_DISPUTE">Weight Dispute</option>
              <option value="PRICING_DISPUTE">Pricing Dispute</option>
              <option value="AGENT_BEHAVIOR">Agent Behavior</option>
              <option value="DELAYED_PICKUP">Delayed Pickup</option>
              <option value="PAYMENT_ISSUE">Payment Issue</option>
              <option value="HUMAN_SUPPORT_ESCALATION">Human Escalation</option>
              <option value="APP_ISSUE">App Issue</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="DATE_DESC">Newest First</option>
              <option value="DATE_ASC">Oldest First</option>
              <option value="CATEGORY_ASC">Category (A-Z)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 font-bold flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-rose-600 hover:text-rose-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Complaints Table & Mobile Cards */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden p-4 sm:p-6 space-y-4">
        {/* Mobile Cards View (viewport < 768px) */}
        <div className="block md:hidden space-y-3">
          {loading ? (
            <div className="text-center p-8 text-slate-400 font-semibold flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
              Loading support tickets...
            </div>
          ) : paginatedComplaints.length === 0 ? (
            <div className="text-center p-8 text-slate-400 font-semibold bg-slate-50 rounded-2xl">
              No support tickets match the active filters.
            </div>
          ) : (
            paginatedComplaints.map((c) => {
              const st = (c.status || 'OPEN').toUpperCase();
              let badgeStyle = 'bg-amber-100 text-amber-800 border-amber-200';
              if (st === 'UNDER_REVIEW' || st === 'IN_PROGRESS' || st === 'INVESTIGATING') {
                badgeStyle = 'bg-blue-100 text-blue-800 border-blue-200';
              } else if (st === 'AWAITING_CUSTOMER') {
                badgeStyle = 'bg-purple-100 text-purple-800 border-purple-200';
              } else if (st === 'RESOLVED' || st === 'CLOSED') {
                badgeStyle = 'bg-emerald-100 text-emerald-800 border-emerald-200';
              } else if (st === 'REJECTED' || st === 'DISMISSED') {
                badgeStyle = 'bg-rose-100 text-rose-800 border-rose-200';
              }

              return (
                <div
                  key={c.id}
                  className="p-4 bg-slate-50 hover:bg-white rounded-2xl border border-slate-200 transition-all space-y-2.5 text-xs shadow-xs"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-mono text-[11px] font-black text-slate-900 bg-white px-2 py-0.5 rounded-lg border border-slate-200 truncate">
                        #{c.id.slice(0, 8)}...
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-slate-200/80 text-slate-700 truncate">
                        {(c.category || 'GENERAL').replace(/_/g, ' ')}
                      </span>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${badgeStyle} shrink-0`}>
                      {st.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-slate-600">
                    <div>
                      <span className="font-bold text-slate-900 block">{c.customerName || 'Customer'}</span>
                      <span className="text-[11px] text-slate-500 font-mono">{c.customerPhone || '—'}</span>
                    </div>
                    {c.orderNumber ? (
                      <span className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-bold text-slate-800 shrink-0">
                        #{c.orderNumber}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-[11px] shrink-0">General Support</span>
                    )}
                  </div>

                  <p className="text-slate-700 line-clamp-2 leading-relaxed bg-white p-2.5 rounded-xl border border-slate-100">
                    {c.description || c.message || 'No description provided.'}
                  </p>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-200/70 text-[11px]">
                    <span className="text-slate-400 font-medium">
                      {c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-IN') : 'N/A'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleOpenDetails(c)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-xl text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>View & Resolve</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop / Tablet Table View (viewport >= 768px) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px]">
              <tr>
                <th className="p-3">Ticket ID & Category</th>
                <th className="p-3">Customer & Contact</th>
                <th className="p-3">Linked Order</th>
                <th className="p-3">Complaint Message</th>
                <th className="p-3">Evidence</th>
                <th className="p-3">Status</th>
                <th className="p-3">Date</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center p-8 text-slate-400 font-semibold">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                      Loading support tickets...
                    </div>
                  </td>
                </tr>
              ) : paginatedComplaints.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center p-8 text-slate-400 font-semibold">
                    No support tickets match the active filters.
                  </td>
                </tr>
              ) : (
                paginatedComplaints.map((c) => {
                  const st = (c.status || 'OPEN').toUpperCase();
                  let badgeStyle = 'bg-amber-100 text-amber-800 border-amber-200';
                  if (st === 'UNDER_REVIEW' || st === 'IN_PROGRESS' || st === 'INVESTIGATING') {
                    badgeStyle = 'bg-blue-100 text-blue-800 border-blue-200';
                  } else if (st === 'AWAITING_CUSTOMER') {
                    badgeStyle = 'bg-purple-100 text-purple-800 border-purple-200';
                  } else if (st === 'RESOLVED' || st === 'CLOSED') {
                    badgeStyle = 'bg-emerald-100 text-emerald-800 border-emerald-200';
                  } else if (st === 'REJECTED' || st === 'DISMISSED') {
                    badgeStyle = 'bg-rose-100 text-rose-800 border-rose-200';
                  }
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3">
                        <span className="font-mono font-bold text-slate-900 block truncate max-w-[140px]">
                          #{c.id.slice(0, 8)}...
                        </span>
                        <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-slate-100 text-slate-700">
                          {(c.category || 'GENERAL').replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="font-bold text-slate-900 block">{c.customerName || 'Customer'}</span>
                        <span className="text-[11px] text-slate-500 font-mono">{c.customerPhone || '—'}</span>
                      </td>
                      <td className="p-3 font-semibold text-slate-800">
                        {c.orderNumber ? (
                          <span className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-bold">
                            #{c.orderNumber}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">General Support</span>
                        )}
                      </td>
                      <td className="p-3 text-slate-600 max-w-xs truncate" title={c.description || c.message || ''}>
                        {c.description || c.message || 'No description provided.'}
                      </td>
                      <td className="p-3">
                        {c.photoUrl ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                            <Paperclip className="w-3 h-3" />
                            Photo attached
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">No attachment</span>
                        )}
                      </td>
                      <td className="p-3">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase border ${badgeStyle}`}>
                          {st.replace(/_/g, ' ')}
                        </span>
                        {c.resolutionNotes && (
                          <span className="block text-[10px] text-slate-500 font-semibold mt-1 truncate max-w-[120px]" title={c.resolutionNotes}>
                            Note: {c.resolutionNotes}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-slate-500 whitespace-nowrap">{c.createdAt || 'N/A'}</td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenDetails(c)}
                          className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold px-3 py-1.5 rounded-xl text-[11px] inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                          title="View Ticket & Update Resolution"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View & Resolve
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100">
          <span className="text-xs font-semibold text-slate-500">
            Showing page {currentPage} of {totalPages} ({totalItems} total complaints)
          </span>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>

            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i + 1}
                  onClick={() => setCurrentPage(i + 1)}
                  className={`text-xs font-bold w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                    currentPage === i + 1
                      ? 'bg-emerald-600 text-white'
                      : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Ticket Details & Resolution Modal */}
      {selectedComplaint && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="dispute-modal-title"
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 transition-opacity"
          onClick={(e) => {
            if (e.target === e.currentTarget && !submitting) {
              handleRequestClose();
            }
          }}
        >
          <div
            className="relative flex flex-col w-full max-w-xl max-h-[min(90vh,780px)] rounded-3xl bg-white shadow-2xl overflow-hidden border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sticky Header with visible Close (X) button */}
            <div className="sticky top-0 bg-white z-10 border-b border-slate-100 p-4 sm:p-5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold text-lg shrink-0">
                  💬
                </div>
                <div className="min-w-0">
                  <h3 id="dispute-modal-title" className="text-base font-extrabold text-slate-900 truncate">
                    Support Ticket Investigation
                  </h3>
                  <p className="text-xs text-slate-500 font-mono truncate">ID: {selectedComplaint.id}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleRequestClose}
                disabled={submitting}
                aria-label="Close dialog"
                className="text-slate-400 hover:text-slate-700 p-2 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Category</span>
                  <span className="text-xs font-black uppercase text-slate-800">
                    {(selectedComplaint.category || 'General').replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Linked Order</span>
                  <span className="text-xs font-black text-slate-900">
                    {selectedComplaint.orderNumber ? `#${selectedComplaint.orderNumber}` : 'General Support'}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Customer Name</span>
                  <span className="text-xs font-black text-slate-900">{selectedComplaint.customerName || 'Customer'}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Customer Phone</span>
                  <span className="text-xs font-mono font-bold text-slate-800">{selectedComplaint.customerPhone || '—'}</span>
                </div>
              </div>

              {/* Complaint Statement */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Customer Statement</span>
                <p className="text-xs text-slate-800 whitespace-pre-wrap leading-relaxed">
                  {selectedComplaint.description || selectedComplaint.message || 'No description provided.'}
                </p>
              </div>

              {/* Evidence Preview if Photo attached */}
              {selectedComplaint.photoUrl && (
                <div className="p-3.5 bg-blue-50/70 rounded-2xl border border-blue-100">
                  <EvidenceImagePreview
                    src={selectedComplaint.photoUrl}
                    alt="Complaint evidence"
                    caption="Photographic Evidence Attached"
                  />
                </div>
              )}

              {/* Status & Resolution Form */}
              <div className="space-y-3 pt-1 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Update Lifecycle Status:</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="OPEN">OPEN (New / Unreviewed)</option>
                    <option value="UNDER_REVIEW">UNDER_REVIEW (Active Investigation)</option>
                    <option value="AWAITING_CUSTOMER">AWAITING_CUSTOMER (Needs Customer Response / Evidence)</option>
                    <option value="RESOLVED">RESOLVED (Approved & Closed)</option>
                    <option value="REJECTED">REJECTED (Dispute Rejected / Dismissed)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Customer-Visible Timeline Update:
                    <span className="text-[11px] font-normal text-emerald-700 ml-1">(Visible on customer live timeline)</span>
                  </label>
                  <textarea
                    rows={2}
                    value={editCustomerUpdate}
                    onChange={(e) => setEditCustomerUpdate(e.target.value)}
                    placeholder={
                      editStatus === 'AWAITING_CUSTOMER'
                        ? "e.g., 'Please upload a photo of the receipt or scale reading so we can adjust the weight.'"
                        : "Optional message logged to customer's live status timeline..."
                    }
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Internal Operations Notes:
                    <span className="text-[11px] font-normal text-amber-700 ml-1">(Private to Admins — Never shown to customer)</span>
                  </label>
                  <textarea
                    rows={2}
                    value={editInternalNotes}
                    onChange={(e) => setEditInternalNotes(e.target.value)}
                    placeholder="Internal agent checks, GPS audit, scale cross-verification notes..."
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Resolution Notes:
                    <span className="text-[11px] font-normal text-slate-500 ml-1">(Final disposition / adjustment details)</span>
                  </label>
                  <textarea
                    rows={2}
                    value={editResolutionNotes}
                    onChange={(e) => setEditResolutionNotes(e.target.value)}
                    placeholder="Document resolution outcome, refund/payout details, or rejection reasoning..."
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {modalFeedback && (
                <div
                  className={`p-3 rounded-xl text-xs font-bold ${
                    modalFeedback.type === 'success'
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border border-rose-200 text-rose-800'
                  }`}
                >
                  {modalFeedback.text}
                </div>
              )}
            </div>

            {/* Sticky Footer with Cancel & Save Resolution actions */}
            <div className="sticky bottom-0 bg-slate-50 border-t border-slate-100 p-4 sm:p-5 flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={handleRequestClose}
                disabled={submitting}
                className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveResolution}
                disabled={submitting}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-50"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {submitting ? 'Saving...' : 'Save Resolution'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unsaved Changes Confirmation Dialog */}
      {showDiscardConfirm && (
        <div
          role="alertdialog"
          aria-modal="true"
          className="fixed inset-0 z-[60] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-3 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2.5 text-amber-600">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <h4 className="text-sm font-extrabold text-slate-900">Unsaved Changes</h4>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              You have modified the dispute status or resolution notes. If you leave now, your changes will be discarded.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDiscardConfirm(false)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Keep Editing
              </button>
              <button
                type="button"
                onClick={handleConfirmDiscard}
                className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
              >
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
