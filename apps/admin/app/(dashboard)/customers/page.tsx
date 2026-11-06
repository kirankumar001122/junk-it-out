'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  UserCheck,
  RefreshCw,
  Search,
  Users,
  Package,
  Calendar,
  Eye,
  ChevronLeft,
  ChevronRight,
  Filter,
  ArrowUpDown,
  ShieldCheck,
  MapPin,
  Clock,
  Award,
} from 'lucide-react';
import { adminFetch } from '@/lib/api';

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE_ORDERS' | 'NEW_CUSTOMERS'>('ALL');
  const [sortBy, setSortBy] = useState<'recent' | 'orders' | 'name'>('recent');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Selected customer details modal
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);

  const isFetchingRef = useRef(false);

  const loadCustomers = async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setLoading(true);
    try {
      const res = await adminFetch('/api/admin/customers');
      const data = await res.json();
      if (data.success) {
        setCustomers(data.data || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  // Filter and sort customers
  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return customers
      .filter((c) => {
        // Status / Pickup activity filter
        if (statusFilter === 'ACTIVE_ORDERS' && (c.totalOrders || 0) <= 0) return false;
        if (statusFilter === 'NEW_CUSTOMERS' && (c.totalOrders || 0) > 0) return false;

        // Search query
        if (!q) return true;
        return (
          (c.name && c.name.toLowerCase().includes(q)) ||
          (c.phone && c.phone.includes(q)) ||
          (c.primaryArea && c.primaryArea.toLowerCase().includes(q)) ||
          (c.email && c.email.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        if (sortBy === 'recent') {
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        }
        if (sortBy === 'orders') {
          return (b.totalOrders || 0) - (a.totalOrders || 0);
        }
        if (sortBy === 'name') {
          return (a.name || '').localeCompare(b.name || '');
        }
        return 0;
      });
  }, [customers, searchTerm, statusFilter, sortBy]);

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const paginatedCustomers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  // Aggregate metrics
  const totalCompletedPickups = customers.reduce((acc, c) => acc + (Number(c.totalOrders) || 0), 0);
  const repeatCustomersCount = customers.filter((c) => (c.totalOrders || 0) > 1).length;

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase">
            User Directory
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">Registered Customers</h1>
          <p className="text-xs text-slate-500">Customer account directory and booking history metrics.</p>
        </div>

        <button
          onClick={loadCustomers}
          className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 self-start sm:self-auto cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* METRIC PILLS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase text-slate-400">Total Registered</p>
            <p className="text-xl font-black text-slate-900">{customers.length} Accounts</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold">
            <Users className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase text-slate-400">Completed Pickups</p>
            <p className="text-xl font-black text-emerald-700">{totalCompletedPickups} Pickups</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
            <Package className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase text-slate-400">Repeat Customers</p>
            <p className="text-xl font-black text-blue-700">{repeatCustomersCount} Loyal</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
            <Award className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase text-slate-400">Hub Coverage</p>
            <p className="text-xl font-black text-purple-700">South Bengaluru</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold">
            <MapPin className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search customer by name, phone, email, or area..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          {searchTerm && (
            <button
              onClick={() => {
                setSearchTerm('');
                setCurrentPage(1);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as any);
              setCurrentPage(1);
            }}
            className="w-full sm:w-44 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
          >
            <option value="ALL">All Customers</option>
            <option value="ACTIVE_ORDERS">Has Active Pickups</option>
            <option value="NEW_CUSTOMERS">New / 0 Pickups</option>
          </select>

          <ArrowUpDown className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="w-full sm:w-40 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
          >
            <option value="recent">Sort: Most Recent</option>
            <option value="orders">Sort: Top Pickups</option>
            <option value="name">Sort: Name (A-Z)</option>
          </select>
        </div>
      </div>

      {/* CUSTOMERS TABLE */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden p-6 space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px]">
              <tr>
                <th className="p-3">Customer Name</th>
                <th className="p-3">Phone</th>
                <th className="p-3">Primary Area</th>
                <th className="p-3">Total Orders</th>
                <th className="p-3">Joined Date</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center p-8 text-slate-400 font-semibold">
                    Loading customer directory...
                  </td>
                </tr>
              ) : paginatedCustomers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center p-8 text-slate-400 font-semibold">
                    No customers found matching search.
                  </td>
                </tr>
              ) : (
                paginatedCustomers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3">
                      <button
                        onClick={() => setSelectedCustomer(c)}
                        className="font-bold text-slate-900 hover:text-emerald-700 transition-colors cursor-pointer text-left"
                      >
                        {c.name || 'Customer'}
                      </button>
                    </td>
                    <td className="p-3 font-mono text-slate-600">{c.phone}</td>
                    <td className="p-3 text-slate-700">{c.primaryArea || c.area || c.defaultArea || 'South Bengaluru'}</td>
                    <td className="p-3 font-bold text-emerald-700">
                      {typeof c.totalOrders === 'number' ? c.totalOrders : typeof c.totalOrdersCount === 'number' ? c.totalOrdersCount : 0} Pickups
                    </td>
                    <td className="p-3 text-slate-500">
                      {c.joinedDate || (c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A')}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => setSelectedCustomer(c)}
                        className="bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION BAR */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100 text-xs text-slate-500 font-bold">
          <div>
            Showing page {currentPage} of {totalPages} ({filtered.length} total customers)
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Previous
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1 cursor-pointer"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* CUSTOMER PROFILE DETAILS MODAL */}
      {selectedCustomer && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                  <UserCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">{selectedCustomer.name || 'Customer'}</h3>
                  <p className="text-[11px] text-slate-400 font-semibold">Customer Account Profile</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Primary Phone</span>
                <span className="font-mono font-extrabold text-slate-900">{selectedCustomer.phone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Account Status</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800">
                  {selectedCustomer.status || 'ACTIVE'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Email Address</span>
                <span className="font-semibold text-slate-700">{selectedCustomer.email || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Primary Service Area</span>
                <span className="font-semibold text-slate-700">{selectedCustomer.primaryArea || 'South Bengaluru'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Total Pickups Completed</span>
                <span className="font-bold text-emerald-700">{selectedCustomer.totalOrders || 0} Pickups</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Registered Addresses</span>
                <span className="font-semibold text-slate-700">{selectedCustomer.addressesCount || 1} Locations</span>
              </div>
              <div className="flex justify-between border-t border-slate-200/60 pt-2">
                <span className="text-slate-400 font-bold">Member Since</span>
                <span className="font-semibold text-slate-700">{selectedCustomer.joinedDate || 'N/A'}</span>
              </div>

              {/* PRIVACY & SENSITIVE DATA SAFEGUARD NOTICE */}
              <div className="flex items-center gap-2 text-slate-500 bg-slate-100/80 p-2.5 rounded-xl border border-slate-200 text-[10px]">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Administrative Privacy Safe: Passwords, tokens, and bank details are cryptographically secured and strictly redacted.</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSelectedCustomer(null)}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-2.5 rounded-xl cursor-pointer"
            >
              Close Profile
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
