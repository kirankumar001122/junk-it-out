'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Bell,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Send,
  Eye,
  Trash2,
  Check,
  X,
  FileSpreadsheet,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  MessageSquare,
  Radio,
  ExternalLink,
} from 'lucide-react';
import { adminFetch } from '@/lib/api';

interface NotificationItem {
  id: string;
  type: string;
  recipient: string;
  content: string;
  status: string;
  provider?: string;
  deliveryStatus?: string;
  deliveryAttempts?: number;
  statusDescription?: string | null;
  orderNumber?: string | null;
  userName?: string | null;
  rawDate?: string;
  sentAt: string;
}

export default function AdminNotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'recipient' | 'type'>('newest');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  // Modals
  const [detailsItem, setDetailsItem] = useState<NotificationItem | null>(null);
  const [isBroadcastOpen, setIsBroadcastOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<NotificationItem | null>(null);

  // Broadcast Form
  const [broadcastRecipient, setBroadcastRecipient] = useState('');
  const [broadcastType, setBroadcastType] = useState('SYSTEM_ALERT');
  const [broadcastContent, setBroadcastContent] = useState('');
  const [broadcastStatus, setBroadcastStatus] = useState('QUEUED');
  const [broadcastError, setBroadcastError] = useState<string | null>(null);
  const [submittingBroadcast, setSubmittingBroadcast] = useState(false);

  // Notification Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchNotifications = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const res = await adminFetch('/api/admin/notifications?page=1&pageSize=25');
      const json = await res.json();

      if (json.success && Array.isArray(json.data)) {
        setNotifications(json.data);
      } else {
        setError(json.message || 'Failed to load notifications');
      }
    } catch (err: any) {
      setError(err.message || 'Network error fetching notifications');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Metrics
  const metrics = useMemo(() => {
    const total = notifications.length;
    const delivered = notifications.filter(
      (n) => n.status === 'SENT' || n.status === 'DELIVERED'
    ).length;
    const queued = notifications.filter(
      (n) => n.status === 'QUEUED' || n.status === 'PENDING'
    ).length;
    const acknowledged = notifications.filter(
      (n) => n.status === 'ACKNOWLEDGED' || n.status === 'RESOLVED'
    ).length;

    return { total, delivered, queued, acknowledged };
  }, [notifications]);

  // Filtering & Sorting
  const filteredNotifications = useMemo(() => {
    let result = [...notifications];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (n) =>
          n.recipient.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q) ||
          (n.orderNumber && n.orderNumber.toLowerCase().includes(q)) ||
          n.type.toLowerCase().includes(q)
      );
    }

    if (statusFilter !== 'ALL') {
      result = result.filter((n) => n.status === statusFilter);
    }

    if (typeFilter !== 'ALL') {
      result = result.filter((n) => n.type === typeFilter);
    }

    result.sort((a, b) => {
      if (sortBy === 'recipient') return a.recipient.localeCompare(b.recipient);
      if (sortBy === 'type') return a.type.localeCompare(b.type);
      if (sortBy === 'oldest') {
        return (new Date(a.rawDate || a.sentAt).getTime() || 0) - (new Date(b.rawDate || b.sentAt).getTime() || 0);
      }
      return (new Date(b.rawDate || b.sentAt).getTime() || 0) - (new Date(a.rawDate || a.sentAt).getTime() || 0);
    });

    return result;
  }, [notifications, searchQuery, statusFilter, typeFilter, sortBy]);

  // Pagination Slice
  const totalPages = Math.max(1, Math.ceil(filteredNotifications.length / pageSize));
  const paginatedNotifications = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredNotifications.slice(start, start + pageSize);
  }, [filteredNotifications, currentPage, pageSize]);

  // Acknowledge Action
  const handleAcknowledge = async (item: NotificationItem) => {
    try {
      const newStatus = item.status === 'ACKNOWLEDGED' ? 'RESOLVED' : 'ACKNOWLEDGED';
      const res = await fetch('/api/admin/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, status: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, status: newStatus } : n))
        );
        showToast(`Alert marked as ${newStatus}`);
      } else {
        alert(data.message || 'Failed to update alert');
      }
    } catch (err: any) {
      alert(err.message || 'Error updating alert status');
    }
  };

  // Submit Broadcast
  const handleBroadcastSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastRecipient.trim()) {
      setBroadcastError('Recipient phone or destination is required.');
      return;
    }
    if (!broadcastContent.trim() || broadcastContent.trim().length < 5) {
      setBroadcastError('Alert message content must be at least 5 characters.');
      return;
    }

    try {
      setSubmittingBroadcast(true);
      setBroadcastError(null);

      const res = await fetch('/api/admin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: broadcastRecipient.trim(),
          type: broadcastType,
          content: broadcastContent.trim(),
          status: broadcastStatus,
          provider: 'ADMIN_CONSOLE',
        }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        showToast('Operational alert broadcast successfully created.');
        setIsBroadcastOpen(false);
        setBroadcastRecipient('');
        setBroadcastContent('');
        fetchNotifications(true);
      } else {
        setBroadcastError(json.message || 'Failed to create alert');
      }
    } catch (err: any) {
      setBroadcastError(err.message || 'Network error');
    } finally {
      setSubmittingBroadcast(false);
    }
  };

  // Delete Action
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/admin/notifications?id=${deleteTarget.id}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (json.success) {
        setNotifications((prev) => prev.filter((n) => n.id !== deleteTarget.id));
        showToast('Alert record dismissed.');
        setDeleteTarget(null);
      } else {
        alert(json.message || 'Failed to dismiss alert');
      }
    } catch (err: any) {
      alert(err.message || 'Error dismissing alert');
    }
  };

  // CSV Export
  const handleExportCSV = () => {
    const headers = ['ID,Type,Recipient,Order Number,Status,Sent At,Content'];
    const rows = filteredNotifications.map((n) =>
      [
        `"${n.id}"`,
        `"${n.type}"`,
        `"${n.recipient}"`,
        `"${n.orderNumber || ''}"`,
        `"${n.status}"`,
        `"${n.sentAt}"`,
        `"${n.content.replace(/"/g, '""')}"`,
      ].join(',')
    );
    const csvContent = [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `junkitout-alerts-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Alerts CSV export downloaded.');
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-slate-700 animate-in fade-in slide-in-from-bottom-4">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <span className="text-xs font-bold">{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase tracking-wider">
            System Alerts & Event Logs
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">
            Notifications & System Alerts
          </h1>
          <p className="text-xs text-slate-500">
            Real-time operational alerts, agent dispatches, payment failures, and WhatsApp logs.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setIsBroadcastOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Broadcast Alert</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => fetchNotifications(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Metric Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
              Total Notifications
            </span>
            <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
              <Bell className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">{metrics.total}</div>
          <div className="text-[11px] font-medium text-slate-500">All recorded operational alerts</div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
              Delivered & Sent
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-600">{metrics.delivered}</div>
          <div className="text-[11px] font-medium text-slate-500">Confirmed gateway deliveries</div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
              Queued / Pending
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-amber-600">{metrics.queued}</div>
          <div className="text-[11px] font-medium text-slate-500">Awaiting dispatch or retry</div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
              Acknowledged / System
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-blue-600">{metrics.acknowledged}</div>
          <div className="text-[11px] font-medium text-slate-500">Resolved or critical alerts</div>
        </div>
      </div>

      {/* Filter and Control Toolbar */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* Search Box */}
          <div className="relative md:col-span-4">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search alerts by recipient, content or order..."
              className="w-full pl-9 pr-9 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Type Filter */}
          <div className="md:col-span-3">
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="ALL">All Channels & Types</option>
              <option value="WHATSAPP">WhatsApp Messages</option>
              <option value="WHATSAPP_DISPATCH_UPDATE">Dispatch Updates</option>
              <option value="AGENT_BOOKING_ASSIGNED">Agent Assignment</option>
              <option value="SYSTEM_ALERT">System Node Alerts</option>
              <option value="PAYMENT_ALERT">Payment & Webhook</option>
              <option value="SECURITY_ALERT">Security & Auth</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="md:col-span-2">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="SENT">Sent</option>
              <option value="QUEUED">Queued</option>
              <option value="ACKNOWLEDGED">Acknowledged</option>
              <option value="RESOLVED">Resolved</option>
              <option value="FAILED">Failed</option>
            </select>
          </div>

          {/* Sort By */}
          <div className="md:col-span-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="recipient">Recipient (A-Z)</option>
              <option value="type">Channel / Type</option>
            </select>
          </div>

          {/* Page Size */}
          <div className="md:col-span-1">
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="w-full px-2 py-2 rounded-xl border border-slate-200 text-xs font-bold bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none text-center"
            >
              <option value={3}>3</option>
              <option value={5}>5</option>
              <option value={10}>10</option>
            </select>
          </div>
        </div>
      </div>

      {/* Alerts Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs font-bold text-slate-400 animate-pulse">
            Loading operational alerts and system logs...
          </div>
        ) : error ? (
          <div className="p-8 text-center text-xs text-rose-600 font-bold bg-rose-50 border-b border-rose-100">
            {error}
          </div>
        ) : paginatedNotifications.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
              <Bell className="w-6 h-6" />
            </div>
            <div className="text-sm font-extrabold text-slate-800">No matching notifications found</div>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Try adjusting your search criteria, type filters, or status options.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-extrabold text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="p-3.5">Channel / Type</th>
                  <th className="p-3.5">Recipient</th>
                  <th className="p-3.5">Message Content</th>
                  <th className="p-3.5">Order</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5">Sent At</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {paginatedNotifications.map((n) => {
                  const isWhatsapp = n.type.includes('WHATSAPP');
                  const isSystem = n.type.includes('SYSTEM');
                  const isPayment = n.type.includes('PAYMENT');
                  const isSecurity = n.type.includes('SECURITY');

                  return (
                    <tr key={n.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Type Badge */}
                      <td className="p-3.5 whitespace-nowrap">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold tracking-wide uppercase ${
                            isWhatsapp
                              ? 'bg-emerald-100 text-emerald-800'
                              : isPayment
                              ? 'bg-rose-100 text-rose-800'
                              : isSecurity
                              ? 'bg-purple-100 text-purple-800'
                              : isSystem
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {n.type}
                        </span>
                      </td>

                      {/* Recipient */}
                      <td className="p-3.5 whitespace-nowrap">
                        <div className="font-bold text-slate-900">{n.recipient}</div>
                        {n.userName && (
                          <div className="text-[10px] text-slate-400 font-medium">{n.userName}</div>
                        )}
                      </td>

                      {/* Content Preview */}
                      <td className="p-3.5 max-w-xs sm:max-w-md truncate text-slate-700">
                        <span title={n.content}>{n.content}</span>
                      </td>

                      {/* Linked Order */}
                      <td className="p-3.5 whitespace-nowrap">
                        {n.orderNumber ? (
                          <span className="font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md font-bold text-[11px]">
                            {n.orderNumber}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-bold">—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="p-3.5 whitespace-nowrap">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                            n.status === 'SENT' || n.status === 'DELIVERED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : n.status === 'ACKNOWLEDGED' || n.status === 'RESOLVED'
                              ? 'bg-blue-100 text-blue-800'
                              : n.status === 'FAILED'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {n.status}
                        </span>
                      </td>

                      {/* Sent At */}
                      <td className="p-3.5 whitespace-nowrap text-slate-500 font-semibold text-[11px]">
                        {n.sentAt}
                      </td>

                      {/* Actions */}
                      <td className="p-3.5 whitespace-nowrap text-right space-x-1.5">
                        <button
                          onClick={() => setDetailsItem(n)}
                          title="View Alert Details"
                          className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleAcknowledge(n)}
                          title={n.status === 'ACKNOWLEDGED' ? 'Mark as Resolved' : 'Acknowledge Alert'}
                          className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-600 transition-colors"
                        >
                          <Check className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => setDeleteTarget(n)}
                          title="Dismiss Alert"
                          className="p-1.5 hover:bg-rose-50 rounded-lg text-rose-600 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-semibold text-slate-600">
          <div>
            Showing page <span className="font-bold text-slate-900">{currentPage}</span> of{' '}
            <span className="font-bold text-slate-900">{totalPages}</span> ({filteredNotifications.length} total alerts)
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 disabled:opacity-40 transition-colors flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 disabled:opacity-40 transition-colors flex items-center gap-1"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Alert Details Modal */}
      {detailsItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-emerald-600" />
                <h3 className="font-black text-slate-900 text-base">
                  Alert Details: {detailsItem.type}
                </h3>
              </div>
              <button
                onClick={() => setDetailsItem(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 rounded-2xl">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase">Recipient</span>
                  <div className="font-black text-slate-900 mt-0.5">{detailsItem.recipient}</div>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase">Current Status</span>
                  <div className="mt-0.5">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-emerald-100 text-emerald-800">
                      {detailsItem.status}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase">Gateway Provider</span>
                  <div className="font-bold text-slate-900 mt-0.5">{detailsItem.provider || 'FAST2SMS'}</div>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase">Linked Order</span>
                  <div className="font-bold text-slate-900 mt-0.5">{detailsItem.orderNumber || 'None'}</div>
                </div>
              </div>

              <div>
                <span className="text-[10px] font-extrabold text-slate-400 uppercase">Message Content</span>
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 font-medium whitespace-pre-wrap mt-1 leading-relaxed">
                  {detailsItem.content}
                </div>
              </div>

              {detailsItem.statusDescription && (
                <div>
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase">Gateway Feedback</span>
                  <p className="text-slate-600 mt-0.5 text-[11px]">{detailsItem.statusDescription}</p>
                </div>
              )}

              <div className="text-[11px] text-slate-400 pt-1 font-semibold">
                Recorded At: {detailsItem.sentAt}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setDetailsItem(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Broadcast Alert Modal */}
      {isBroadcastOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Send className="w-5 h-5 text-emerald-600" />
                <h3 className="font-black text-slate-900 text-base">Dispatch Operational Alert</h3>
              </div>
              <button
                onClick={() => setIsBroadcastOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleBroadcastSubmit} className="space-y-3 text-xs">
              {broadcastError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl font-bold">
                  {broadcastError}
                </div>
              )}

              <div>
                <label className="block text-[10px] font-extrabold text-slate-400 uppercase mb-1">
                  Recipient Destination
                </label>
                <input
                  type="text"
                  value={broadcastRecipient}
                  onChange={(e) => setBroadcastRecipient(e.target.value)}
                  placeholder="e.g. +918123767934 or admin:operations"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-400 uppercase mb-1">
                    Channel / Type
                  </label>
                  <select
                    value={broadcastType}
                    onChange={(e) => setBroadcastType(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="SYSTEM_ALERT">System Alert</option>
                    <option value="WHATSAPP">WhatsApp Notice</option>
                    <option value="PAYMENT_ALERT">Payment Alert</option>
                    <option value="SECURITY_ALERT">Security Alert</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold text-slate-400 uppercase mb-1">
                    Initial Status
                  </label>
                  <select
                    value={broadcastStatus}
                    onChange={(e) => setBroadcastStatus(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="QUEUED">Queued</option>
                    <option value="SENT">Sent Immediately</option>
                    <option value="ACKNOWLEDGED">Acknowledged</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-extrabold text-slate-400 uppercase mb-1">
                  Alert Message Content
                </label>
                <textarea
                  rows={3}
                  value={broadcastContent}
                  onChange={(e) => setBroadcastContent(e.target.value)}
                  placeholder="Enter detailed alert broadcast message..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsBroadcastOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingBroadcast}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50"
                >
                  {submittingBroadcast ? 'Dispatching...' : 'Dispatch Alert'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dismiss / Delete Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="font-black text-slate-900 text-base">Dismiss Operational Alert</h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to dismiss the alert for{' '}
              <span className="font-bold text-slate-900">{deleteTarget.recipient}</span>? This record will be safely removed.
            </p>

            <div className="pt-2 flex justify-end gap-2 border-t border-slate-100 text-xs font-bold">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition-colors"
              >
                Dismiss Alert
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
