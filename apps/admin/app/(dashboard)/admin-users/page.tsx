'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  UserCog,
  ShieldCheck,
  RefreshCw,
  Search,
  Plus,
  Eye,
  Pencil,
  Trash2,
  X,
  FileSpreadsheet,
  CheckCircle2,
  Crown,
  Briefcase,
  Users,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Mail,
  Phone,
  Lock,
} from 'lucide-react';

interface AdminUserItem {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  accessLevel: string;
  role: string;
  status: string;
  createdAt?: string;
}

export default function AdminUsersPage() {
  const [admins, setAdmins] = useState<AdminUserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'name' | 'newest' | 'department' | 'role'>('name');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  // Modals
  const [detailsAdmin, setDetailsAdmin] = useState<AdminUserItem | null>(null);
  const [editAdmin, setEditAdmin] = useState<AdminUserItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUserItem | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Add Admin Form
  const [addName, setAddName] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addDepartment, setAddDepartment] = useState('Operations');
  const [addAccessLevel, setAddAccessLevel] = useState('FULL');
  const [addFormError, setAddFormError] = useState<string | null>(null);
  const [submittingAdd, setSubmittingAdd] = useState(false);

  // Edit Admin Form
  const [editDepartment, setEditDepartment] = useState('Operations');
  const [editAccessLevel, setEditAccessLevel] = useState('FULL');
  const [editFormError, setEditFormError] = useState<string | null>(null);
  const [submittingEdit, setSubmittingEdit] = useState(false);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchAdmins = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const res = await fetch('/api/admin/admin-users?page=1&pageSize=100');
      const json = await res.json();

      if (json.success && Array.isArray(json.data)) {
        setAdmins(json.data);
      } else {
        setError(json.message || 'Failed to load administrator accounts');
      }
    } catch (err: any) {
      setError(err.message || 'Network error fetching administrators');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Metrics
  const metrics = useMemo(() => {
    const total = admins.length;
    const superAdmins = admins.filter((a) => a.role === 'SUPER_ADMIN').length;
    const operations = admins.filter((a) => a.department.toLowerCase().includes('operat')).length;
    const active = admins.filter((a) => a.status === 'ACTIVE').length;

    return { total, superAdmins, operations, active };
  }, [admins]);

  // Filtering & Sorting
  const filteredAdmins = useMemo(() => {
    let result = [...admins];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.phone.toLowerCase().includes(q) ||
          a.email.toLowerCase().includes(q) ||
          a.department.toLowerCase().includes(q)
      );
    }

    if (roleFilter !== 'ALL') {
      result = result.filter((a) => a.role === roleFilter);
    }

    if (departmentFilter !== 'ALL') {
      result = result.filter((a) => a.department === departmentFilter);
    }

    result.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'department') return a.department.localeCompare(b.department);
      if (sortBy === 'role') return a.role.localeCompare(b.role);
      return (new Date(b.createdAt || 0).getTime()) - (new Date(a.createdAt || 0).getTime());
    });

    return result;
  }, [admins, searchQuery, roleFilter, departmentFilter, sortBy]);

  // Pagination Slice
  const totalPages = Math.max(1, Math.ceil(filteredAdmins.length / pageSize));
  const paginatedAdmins = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAdmins.slice(start, start + pageSize);
  }, [filteredAdmins, currentPage, pageSize]);

  // Handle Add Admin Submit
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addName.trim() || addName.trim().length < 3) {
      setAddFormError('Administrator name must be at least 3 characters.');
      return;
    }
    const cleanPhone = addPhone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      setAddFormError('Please enter a valid 10-digit mobile number.');
      return;
    }

    try {
      setSubmittingAdd(true);
      setAddFormError(null);

      const res = await fetch('/api/admin/admin-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: addName.trim(),
          phone: cleanPhone,
          email: addEmail.trim() || undefined,
          department: addDepartment,
          accessLevel: addAccessLevel,
        }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        showToast(`Administrator ${addName.trim()} successfully provisioned.`);
        setIsAddModalOpen(false);
        setAddName('');
        setAddPhone('');
        setAddEmail('');
        fetchAdmins(true);
      } else {
        // Specifically format security rejection
        if (res.status === 403) {
          setAddFormError(
            json.message ||
              'Super Admin access required to provision administrators. Your current administrative role has standard operational privileges.'
          );
        } else {
          setAddFormError(json.message || 'Failed to provision administrator');
        }
      }
    } catch (err: any) {
      setAddFormError(err.message || 'Network error');
    } finally {
      setSubmittingAdd(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (admin: AdminUserItem) => {
    setEditAdmin(admin);
    setEditDepartment(admin.department);
    setEditAccessLevel(admin.accessLevel);
    setEditFormError(null);
  };

  // Handle Edit Submit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editAdmin) return;

    try {
      setSubmittingEdit(true);
      setEditFormError(null);

      const res = await fetch('/api/admin/admin-users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editAdmin.id,
          department: editDepartment,
          accessLevel: editAccessLevel,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setAdmins((prev) =>
          prev.map((a) =>
            a.id === editAdmin.id
              ? { ...a, department: editDepartment, accessLevel: editAccessLevel }
              : a
          )
        );
        showToast(`Profile updated for ${editAdmin.name}.`);
        setEditAdmin(null);
      } else {
        setEditFormError(json.message || 'Failed to update administrator');
      }
    } catch (err: any) {
      setEditFormError(err.message || 'Network error');
    } finally {
      setSubmittingEdit(false);
    }
  };

  // Handle Delete Confirm
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;

    try {
      const res = await fetch(`/api/admin/admin-users?id=${deleteTarget.id}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (json.success) {
        setAdmins((prev) => prev.filter((a) => a.id !== deleteTarget.id));
        showToast(`Access removed for ${deleteTarget.name}.`);
        setDeleteTarget(null);
      } else {
        alert(json.message || 'Failed to remove administrator');
      }
    } catch (err: any) {
      alert(err.message || 'Network error');
    }
  };

  // CSV Export
  const handleExportCSV = () => {
    const headers = ['Admin ID,Name,Phone,Email,Department,Role,Access Level,Status'];
    const rows = filteredAdmins.map((a) =>
      [
        `"${a.id}"`,
        `"${a.name}"`,
        `"${a.phone}"`,
        `"${a.email}"`,
        `"${a.department}"`,
        `"${a.role}"`,
        `"${a.accessLevel}"`,
        `"${a.status}"`,
      ].join(',')
    );
    const csvContent = [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `junkitout-admins-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Administrator roster CSV downloaded.');
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
            Access Control & Governance
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">
            Admin Users Roster
          </h1>
          <p className="text-xs text-slate-500">
            Authorized administrative personnel, departmental assignments, and role-based access.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              setIsAddModalOpen(true);
              setAddFormError(null);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Administrator</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => fetchAdmins(true)}
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
              Total Administrators
            </span>
            <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">{metrics.total}</div>
          <div className="text-[11px] font-medium text-slate-500">Authorized system personnel</div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
              Super Admins
            </span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
              <Crown className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-purple-700">{metrics.superAdmins}</div>
          <div className="text-[11px] font-medium text-slate-500">Root governance privilege</div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
              Operations Roster
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Briefcase className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-blue-600">{metrics.operations}</div>
          <div className="text-[11px] font-medium text-slate-500">Field & dispatch control</div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
              Active Access
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-600">{metrics.active}</div>
          <div className="text-[11px] font-medium text-slate-500">Operational administrators</div>
        </div>
      </div>

      {/* Filter and Control Toolbar */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* Search Box */}
          <div className="relative md:col-span-5">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search administrators by name, phone, email or dept..."
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

          {/* Role Filter */}
          <div className="md:col-span-2">
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="ALL">All Roles</option>
              <option value="SUPER_ADMIN">Super Admin</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>

          {/* Department Filter */}
          <div className="md:col-span-2">
            <select
              value={departmentFilter}
              onChange={(e) => {
                setDepartmentFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="ALL">All Departments</option>
              <option value="Operations">Operations</option>
              <option value="Management">Management</option>
              <option value="Finance">Finance</option>
              <option value="Support">Support</option>
            </select>
          </div>

          {/* Sort By */}
          <div className="md:col-span-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="name">Name (A-Z)</option>
              <option value="department">Department</option>
              <option value="role">Role Priority</option>
              <option value="newest">Newest First</option>
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

      {/* Admins Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs font-bold text-slate-400 animate-pulse">
            Loading authorized administrator roster...
          </div>
        ) : error ? (
          <div className="p-8 text-center text-xs text-rose-600 font-bold bg-rose-50 border-b border-rose-100">
            {error}
          </div>
        ) : paginatedAdmins.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
              <UserCog className="w-6 h-6" />
            </div>
            <div className="text-sm font-extrabold text-slate-800">No matching administrators found</div>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Try adjusting your search criteria, role filters, or department options.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-extrabold text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="p-3.5">Administrator</th>
                  <th className="p-3.5">Phone & Email</th>
                  <th className="p-3.5">Department</th>
                  <th className="p-3.5">Role</th>
                  <th className="p-3.5">Access Level</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {paginatedAdmins.map((a) => {
                  const isSuper = a.role === 'SUPER_ADMIN';
                  const isProtectedTestUser = a.phone.includes('8123767934');

                  return (
                    <tr key={a.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Name */}
                      <td className="p-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                              isSuper ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {a.name.slice(0, 1).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900">{a.name}</div>
                            {isProtectedTestUser && (
                              <span className="text-[9px] font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                ACTIVE TEST SESSION
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Phone & Email */}
                      <td className="p-3.5 whitespace-nowrap">
                        <div className="font-mono text-slate-700 font-bold">{a.phone}</div>
                        <div className="text-[11px] text-slate-400">{a.email}</div>
                      </td>

                      {/* Department */}
                      <td className="p-3.5 whitespace-nowrap">
                        <span className="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700 font-bold text-[11px]">
                          {a.department}
                        </span>
                      </td>

                      {/* Role */}
                      <td className="p-3.5 whitespace-nowrap">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide flex items-center gap-1 w-max ${
                            isSuper
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {isSuper && <Crown className="w-3 h-3 text-purple-600" />}
                          {a.role}
                        </span>
                      </td>

                      {/* Access Level */}
                      <td className="p-3.5 whitespace-nowrap">
                        <span className="font-mono font-bold text-slate-700 text-[11px]">
                          {a.accessLevel}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="p-3.5 whitespace-nowrap">
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800">
                          {a.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="p-3.5 whitespace-nowrap text-right space-x-1.5">
                        <button
                          onClick={() => setDetailsAdmin(a)}
                          title="View Administrator Details"
                          className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => openEditModal(a)}
                          title="Edit Administrator"
                          className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-600 transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => setDeleteTarget(a)}
                          disabled={isProtectedTestUser}
                          title={isProtectedTestUser ? 'Protected test session account cannot be removed' : 'Remove Administrator'}
                          className="p-1.5 hover:bg-rose-50 rounded-lg text-rose-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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
            <span className="font-bold text-slate-900">{totalPages}</span> ({filteredAdmins.length} total administrators)
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

      {/* Admin Details Modal */}
      {detailsAdmin && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <h3 className="font-black text-slate-900 text-base">
                  Personnel Profile: {detailsAdmin.name}
                </h3>
              </div>
              <button
                onClick={() => setDetailsAdmin(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 rounded-2xl">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase">Role</span>
                  <div className="font-black text-purple-700 mt-0.5">{detailsAdmin.role}</div>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase">Department</span>
                  <div className="font-bold text-slate-900 mt-0.5">{detailsAdmin.department}</div>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase">Mobile Phone</span>
                  <div className="font-mono font-bold text-slate-900 mt-0.5">{detailsAdmin.phone}</div>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase">Access Level</span>
                  <div className="font-mono font-bold text-slate-900 mt-0.5">{detailsAdmin.accessLevel}</div>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-2xl space-y-1">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase">Official Email</span>
                <div className="font-semibold text-slate-800 break-all">{detailsAdmin.email}</div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-[11px] text-slate-500 font-medium">
                <div>Admin ID: <span className="font-mono text-slate-700 font-bold">{detailsAdmin.id.slice(0, 8)}...</span></div>
                <div>User ID: <span className="font-mono text-slate-700 font-bold">{detailsAdmin.userId.slice(0, 8)}...</span></div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setDetailsAdmin(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Administrator Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-600" />
                <h3 className="font-black text-slate-900 text-base">Provision New Administrator</h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-3 text-xs">
              {addFormError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl flex items-start gap-2.5">
                  <ShieldAlert className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                  <div className="text-[11px] leading-relaxed font-bold">{addFormError}</div>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-extrabold text-slate-400 uppercase mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="e.g. Anand V"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-extrabold text-slate-400 uppercase mb-1">
                  10-Digit Mobile Phone *
                </label>
                <input
                  type="text"
                  maxLength={10}
                  value={addPhone}
                  onChange={(e) => setAddPhone(e.target.value)}
                  placeholder="e.g. 9876543219"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-extrabold text-slate-400 uppercase mb-1">
                  Official Email (Optional)
                </label>
                <input
                  type="email"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  placeholder="e.g. anand@junkitout.in"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-400 uppercase mb-1">
                    Department
                  </label>
                  <select
                    value={addDepartment}
                    onChange={(e) => setAddDepartment(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="Operations">Operations</option>
                    <option value="Management">Management</option>
                    <option value="Finance">Finance</option>
                    <option value="Support">Support</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold text-slate-400 uppercase mb-1">
                    Access Level
                  </label>
                  <select
                    value={addAccessLevel}
                    onChange={(e) => setAddAccessLevel(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="FULL">Full Access</option>
                    <option value="READ_ONLY">Read Only</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAdd}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50"
                >
                  {submittingAdd ? 'Provisioning...' : 'Provision Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Administrator Modal */}
      {editAdmin && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-blue-600" />
                <h3 className="font-black text-slate-900 text-base">
                  Edit Profile: {editAdmin.name}
                </h3>
              </div>
              <button
                onClick={() => setEditAdmin(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-3 text-xs">
              {editFormError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl font-bold">
                  {editFormError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-400 uppercase mb-1">
                    Department
                  </label>
                  <select
                    value={editDepartment}
                    onChange={(e) => setEditDepartment(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="Operations">Operations</option>
                    <option value="Management">Management</option>
                    <option value="Finance">Finance</option>
                    <option value="Support">Support</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold text-slate-400 uppercase mb-1">
                    Access Level
                  </label>
                  <select
                    value={editAccessLevel}
                    onChange={(e) => setEditAccessLevel(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="FULL">Full Access</option>
                    <option value="READ_ONLY">Read Only</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditAdmin(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingEdit}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50"
                >
                  {submittingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="font-black text-slate-900 text-base">Remove Administrator</h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to remove administrator privileges for{' '}
              <span className="font-bold text-slate-900">{deleteTarget.name}</span> ({deleteTarget.phone})?
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
                Remove Access
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
