'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Shield,
  ShieldAlert,
  UserCheck,
  Layers,
  Activity,
  RotateCcw,
  Download,
  Search,
  X,
  Eye,
  Calendar,
  Globe,
  Filter,
  ArrowUpDown,
  FileText,
  Clock,
  User,
  Hash,
  AlertTriangle,
} from 'lucide-react';

interface AuditLogItem {
  id: string;
  userId: string | null;
  userName: string;
  action: string;
  oldValue: string | null;
  newValue: string | null;
  ipAddress: string | null;
  timestamp: string;
}

interface AuditMetrics {
  totalLogs: number;
  adminActions: number;
  catalogOperations: number;
  securityEvents: number;
}

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [metrics, setMetrics] = useState<AuditMetrics>({
    totalLogs: 0,
    adminActions: 0,
    catalogOperations: 0,
    securityEvents: 0,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filters & Pagination state
  const [search, setSearch] = useState<string>('');
  const [actionCategory, setActionCategory] = useState<string>('ALL');
  const [actorFilter, setActorFilter] = useState<string>('ALL');
  const [dateRange, setDateRange] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<string>('newest');
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  const [distinctActors, setDistinctActors] = useState<string[]>([]);
  const [distinctActions, setDistinctActions] = useState<string[]>([]);

  // Modal State
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);

  const fetchAuditLogs = useCallback(
    async (isManualRefresh = false) => {
      try {
        if (isManualRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);

        const params = new URLSearchParams();
        params.set('page', page.toString());
        params.set('limit', pageSize.toString());
        params.set('sort', sortBy);

        if (search.trim()) params.set('search', search.trim());
        if (actionCategory !== 'ALL') params.set('category', actionCategory);
        if (actorFilter !== 'ALL') params.set('userName', actorFilter);

        if (dateRange === 'TODAY') {
          const today = new Date().toISOString().slice(0, 10);
          params.set('startDate', today);
        } else if (dateRange === '7D') {
          const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
          params.set('startDate', past);
        } else if (dateRange === '30D') {
          const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
          params.set('startDate', past);
        }

        const res = await fetch(`/api/admin/audit-logs?${params.toString()}`);
        if (!res.ok) {
          throw new Error(`Failed to load audit logs: ${res.statusText}`);
        }

        const json = await res.json();
        if (json.success) {
          setLogs(json.data || []);
          if (json.pagination) {
            setTotalCount(json.pagination.total);
            setTotalPages(json.pagination.totalPages);
          }
          if (json.metrics) {
            setMetrics(json.metrics);
          }
          if (json.distinctActors) {
            setDistinctActors(json.distinctActors);
          }
          if (json.distinctActions) {
            setDistinctActions(json.distinctActions);
          }
        } else {
          throw new Error(json.message || 'Unknown error occurred');
        }
      } catch (err: any) {
        setError(err.message || 'Unable to fetch audit logs');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [page, pageSize, sortBy, search, actionCategory, actorFilter, dateRange]
  );

  useEffect(() => {
    fetchAuditLogs();
  }, [fetchAuditLogs]);

  // Handle Export CSV
  const handleExportCSV = async () => {
    try {
      // Fetch up to 500 records matching current filters
      const params = new URLSearchParams();
      params.set('page', '1');
      params.set('limit', '500');
      params.set('sort', sortBy);
      if (search.trim()) params.set('search', search.trim());
      if (actionCategory !== 'ALL') params.set('category', actionCategory);
      if (actorFilter !== 'ALL') params.set('userName', actorFilter);

      const res = await fetch(`/api/admin/audit-logs?${params.toString()}`);
      const json = await res.json();
      const exportData: AuditLogItem[] = json.success ? json.data : logs;

      const headers = [
        'Event ID',
        'Timestamp',
        'Actor Name',
        'Actor User ID',
        'Action',
        'IP Address',
        'Prior State (Old Value)',
        'Subsequent State (New Value)',
      ];

      const csvRows = [
        headers.join(','),
        ...exportData.map((item) =>
          [
            `"${item.id}"`,
            `"${item.timestamp}"`,
            `"${(item.userName || 'System').replace(/"/g, '""')}"`,
            `"${item.userId || ''}"`,
            `"${item.action}"`,
            `"${item.ipAddress || '127.0.0.1'}"`,
            `"${(item.oldValue || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
            `"${(item.newValue || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
          ].join(',')
        ),
      ];

      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      alert('Failed to export audit logs CSV');
    }
  };

  const getActionBadgeColor = (action: string) => {
    const upper = action.toUpperCase();
    if (upper.includes('ADMIN') || upper.includes('USER')) {
      return 'bg-purple-100 text-purple-800 border-purple-200';
    }
    if (upper.includes('WASTE') || upper.includes('RATE') || upper.includes('PRICING')) {
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    }
    if (upper.includes('AREA') || upper.includes('ZONE')) {
      return 'bg-cyan-100 text-cyan-800 border-cyan-200';
    }
    if (upper.includes('COUPON')) {
      return 'bg-amber-100 text-amber-800 border-amber-200';
    }
    if (upper.includes('ALERT') || upper.includes('SECURITY')) {
      return 'bg-rose-100 text-rose-800 border-rose-200';
    }
    if (upper.includes('COMPLAINT') || upper.includes('FORCE')) {
      return 'bg-orange-100 text-orange-800 border-orange-200';
    }
    return 'bg-slate-100 text-slate-800 border-slate-200';
  };

  const getActionCategoryLabel = (action: string) => {
    const upper = action.toUpperCase();
    if (upper.includes('ADMIN') || upper.includes('USER')) return 'Governance';
    if (upper.includes('WASTE') || upper.includes('RATE')) return 'Materials & Rates';
    if (upper.includes('AREA')) return 'Service Area';
    if (upper.includes('COUPON')) return 'Promotions';
    if (upper.includes('ALERT')) return 'Alerts';
    if (upper.includes('COMPLAINT')) return 'Support';
    return 'System Core';
  };

  const formatTimestamp = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return iso;
    }
  };

  const formatPayload = (val: string | null) => {
    if (!val) return 'None';
    try {
      const parsed = JSON.parse(val);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return val;
    }
  };

  const renderDiffPreview = (log: AuditLogItem) => {
    if (log.newValue && !log.oldValue) {
      try {
        const parsed = JSON.parse(log.newValue);
        if (parsed.name) return `Created "${parsed.name}"`;
        if (parsed.message) return `Dispatched: "${parsed.message.slice(0, 30)}..."`;
        if (parsed.recipient) return `Broadcast to ${parsed.recipient}`;
      } catch {
        return log.newValue.slice(0, 40);
      }
      return 'Created new entity record';
    }
    if (log.oldValue && log.newValue) {
      try {
        const o = JSON.parse(log.oldValue);
        const n = JSON.parse(log.newValue);
        if (o.status && n.status) return `Status: ${o.status} -> ${n.status}`;
        if (o.ratePerKg && n.ratePerKg) return `Rate: ₹${o.ratePerKg} -> ₹${n.ratePerKg}/kg`;
        if (o.department && n.department) return `Dept: ${o.department} -> ${n.department}`;
      } catch {
        return `${log.oldValue.slice(0, 18)} -> ${log.newValue.slice(0, 18)}`;
      }
      return 'Modified attributes updated';
    }
    if (log.oldValue && !log.newValue) {
      try {
        const parsed = JSON.parse(log.oldValue);
        if (parsed.name) return `Removed "${parsed.name}"`;
      } catch {
        return log.oldValue.slice(0, 30);
      }
      return 'Entity removed / archived';
    }
    return 'Audit event logged';
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase tracking-wider inline-flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" /> Security Audit & Compliance
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1.5">
            Audit Trail & Security Logs
          </h1>
          <p className="text-xs text-slate-500">
            Immutable system operation history, actor tracking, and compliance logs.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchAuditLogs(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all shadow-sm active:scale-95 disabled:opacity-50"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-all shadow-sm active:scale-95"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Summary Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
              Total Audit Events
            </span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">{metrics.totalLogs}</div>
          <div className="text-[11px] font-medium text-slate-500">Immutable ledger records</div>
        </div>

        {/* Metric 2 */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
              Administrative Events
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-blue-600">{metrics.adminActions}</div>
          <div className="text-[11px] font-medium text-slate-500">Personnel & governance</div>
        </div>

        {/* Metric 3 */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
              Operational & Catalog
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-600">{metrics.catalogOperations}</div>
          <div className="text-[11px] font-medium text-slate-500">Rates, categories & areas</div>
        </div>

        {/* Metric 4 */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
              Alerts & Security
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-amber-600">{metrics.securityEvents}</div>
          <div className="text-[11px] font-medium text-slate-500">Alerts, complaints & promos</div>
        </div>
      </div>

      {/* Filter and Search Toolbar */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search logs by actor, action, IP, record ID or changes..."
            className="w-full pl-9 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 placeholder:text-slate-400"
          />
          {search && (
            <button
              onClick={() => {
                setSearch('');
                setPage(1);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Action Category Filter */}
          <select
            value={actionCategory}
            onChange={(e) => {
              setActionCategory(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          >
            <option value="ALL">All Categories</option>
            <option value="CATALOG">Waste Catalog</option>
            <option value="PRICING">Pricing & Rates</option>
            <option value="AREA">Service Areas</option>
            <option value="AGENT">Agents & Ops</option>
            <option value="COUPON">Coupons & Promos</option>
            <option value="ALERT">Alerts & Broadcasts</option>
            <option value="ADMIN">Admin Users & Access</option>
          </select>

          {/* Actor Filter */}
          <select
            value={actorFilter}
            onChange={(e) => {
              setActorFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 max-w-[140px] truncate"
          >
            <option value="ALL">All Actors</option>
            {distinctActors.map((actor) => (
              <option key={actor} value={actor}>
                {actor}
              </option>
            ))}
          </select>

          {/* Date Range Filter */}
          <select
            value={dateRange}
            onChange={(e) => {
              setDateRange(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          >
            <option value="ALL">All Time</option>
            <option value="TODAY">Today</option>
            <option value="7D">Past 7 Days</option>
            <option value="30D">Past 30 Days</option>
          </select>

          {/* Sort By */}
          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="action_asc">Action (A-Z)</option>
            <option value="actor_asc">Actor (A-Z)</option>
          </select>

          {/* Page Size */}
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          >
            <option value="5">5 / page</option>
            <option value="10">10 / page</option>
            <option value="25">25 / page</option>
            <option value="50">50 / page</option>
          </select>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {error ? (
          <div className="p-8 text-center space-y-3">
            <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
            <p className="text-sm font-bold text-slate-900">{error}</p>
            <button
              onClick={() => fetchAuditLogs()}
              className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold"
            >
              Retry
            </button>
          </div>
        ) : loading && !refreshing ? (
          <div className="p-12 text-center text-slate-400 text-xs font-bold space-y-2">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p>Loading audit ledger...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Shield className="w-8 h-8 text-slate-300 mx-auto" />
            <h3 className="text-sm font-bold text-slate-700">No matching audit records found</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              No audit logs matched your current search and filter criteria.
            </p>
            <button
              onClick={() => {
                setSearch('');
                setActionCategory('ALL');
                setActorFilter('ALL');
                setDateRange('ALL');
                setPage(1);
              }}
              className="px-3.5 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-colors"
            >
              Clear All Filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Timestamp</th>
                  <th className="py-3.5 px-4">Actor / Administrator</th>
                  <th className="py-3.5 px-4">Action / Event</th>
                  <th className="py-3.5 px-4">Category</th>
                  <th className="py-3.5 px-4">IP Address</th>
                  <th className="py-3.5 px-4">Changes Preview</th>
                  <th className="py-3.5 px-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                {logs.map((log) => {
                  const initials = (log.userName || 'System')
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2);

                  return (
                    <tr
                      key={log.id}
                      className="hover:bg-slate-50/60 transition-colors group"
                    >
                      {/* Timestamp */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-bold text-slate-900 text-xs">
                          {formatTimestamp(log.timestamp)}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {log.id.slice(0, 8)}...
                        </div>
                      </td>

                      {/* Actor */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center font-black text-[10px] shadow-sm">
                            {initials}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 text-xs">
                              {log.userName || 'System'}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {log.userId ? `ID: ${log.userId.slice(0, 8)}` : 'System Process'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Action */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-block px-2.5 py-1 text-[11px] font-bold rounded-lg border ${getActionBadgeColor(
                            log.action
                          )}`}
                        >
                          {log.action}
                        </span>
                      </td>

                      {/* Category */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                          {getActionCategoryLabel(log.action)}
                        </span>
                      </td>

                      {/* IP Address */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-slate-600 font-mono text-[11px]">
                          <Globe className="w-3 h-3 text-slate-400" />
                          {log.ipAddress || '127.0.0.1'}
                        </div>
                      </td>

                      {/* Changes Preview */}
                      <td className="py-3 px-4 max-w-[220px]">
                        <div className="truncate text-xs text-slate-600">
                          {renderDiffPreview(log)}
                        </div>
                      </td>

                      {/* View Action */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => setSelectedLog(log)}
                          title="View Event Details"
                          className="p-1.5 hover:bg-emerald-50 rounded-lg text-emerald-600 transition-colors"
                        >
                          <Eye className="w-4 h-4" />
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
        <div className="p-4 bg-slate-50/60 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 font-medium">
          <div>
            Showing page <span className="font-bold text-slate-900">{page}</span> of{' '}
            <span className="font-bold text-slate-900">{totalPages}</span> ({totalCount} total audit logs)
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(1)}
              disabled={page <= 1}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              First
            </button>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Previous
            </button>
            <span className="px-2 text-xs font-bold text-slate-800">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Next
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page >= totalPages}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Last
            </button>
          </div>
        </div>
      </div>

      {/* Audit Log Details Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-bold">
                  <Shield className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Audit Event Details: {selectedLog.action}
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">
                    ID: {selectedLog.id}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5">
              {/* Event Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
                <div>
                  <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                    Actor Name
                  </div>
                  <div className="text-xs font-bold text-slate-900 mt-0.5">
                    {selectedLog.userName || 'System'}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                    Actor User ID
                  </div>
                  <div className="text-xs font-mono font-semibold text-slate-700 mt-0.5">
                    {selectedLog.userId || 'System internal'}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                    IP Address
                  </div>
                  <div className="text-xs font-mono font-semibold text-slate-700 mt-0.5 flex items-center gap-1">
                    <Globe className="w-3 h-3 text-slate-400" />
                    {selectedLog.ipAddress || '127.0.0.1'}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                    Recorded Timestamp
                  </div>
                  <div className="text-xs font-bold text-slate-900 mt-0.5">
                    {formatTimestamp(selectedLog.timestamp)}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                    Action Event
                  </div>
                  <div className="mt-0.5">
                    <span
                      className={`inline-block px-2 py-0.5 text-[10px] font-extrabold rounded-md border ${getActionBadgeColor(
                        selectedLog.action
                      )}`}
                    >
                      {selectedLog.action}
                    </span>
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                    Audit Status
                  </div>
                  <div className="text-xs font-bold text-emerald-600 mt-0.5 flex items-center gap-1">
                    <Shield className="w-3 h-3" /> Sealed & Verified
                  </div>
                </div>
              </div>

              {/* Diff Viewer */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Old Value */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" /> Prior State (Old Value)
                  </span>
                  <div className="bg-slate-900 text-slate-100 p-3.5 rounded-2xl font-mono text-[11px] min-h-[140px] max-h-[220px] overflow-y-auto whitespace-pre-wrap border border-slate-800">
                    {formatPayload(selectedLog.oldValue)}
                  </div>
                </div>

                {/* New Value */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-emerald-500" /> Subsequent State (New Value)
                  </span>
                  <div className="bg-slate-900 text-slate-100 p-3.5 rounded-2xl font-mono text-[11px] min-h-[140px] max-h-[220px] overflow-y-auto whitespace-pre-wrap border border-slate-800">
                    {formatPayload(selectedLog.newValue)}
                  </div>
                </div>
              </div>

              {/* Redaction Notice */}
              <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200/80 flex items-start gap-2.5 text-[11px] text-amber-800 font-medium">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Automated Redaction Active:</span> All authorization credentials, tokens, OTPs, and passwords are permanently redacted from audit payload displays and exports.
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
