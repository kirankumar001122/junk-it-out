'use client';

import { useState, useEffect } from 'react';
import { UserCog, Plus, RefreshCw, AlertCircle, ShieldCheck } from 'lucide-react';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newDept, setNewDept] = useState('Operations');

  const loadAdminUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/admin-users');
      const data = await res.json();
      if (data.success) {
        setUsers(data.data);
      } else {
        setError(data.message || 'Failed to fetch admin roster.');
      }
    } catch (e: any) {
      setError(e.message || 'Database error.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminUsers();
  }, []);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newPhone) return;
    try {
      const res = await fetch('/api/admin/admin-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          email: newEmail,
          phone: newPhone,
          department: newDept,
          accessLevel: 'FULL',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNewName('');
        setNewEmail('');
        setNewPhone('');
        setShowAddModal(false);
        loadAdminUsers();
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
        <div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase">
            Access Control
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">Admin Users Roster</h1>
          <p className="text-xs text-slate-500">Manage internal operations accounts, staff permissions, & access levels from DB</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadAdminUsers}
            className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-md flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            ADD ADMIN USER
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-xs font-medium">
            Loading admin users from database...
          </div>
        ) : error ? (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 p-6 rounded-2xl text-center space-y-2">
            <AlertCircle className="w-6 h-6 mx-auto text-rose-600" />
            <p className="text-xs font-bold">{error}</p>
            <button onClick={loadAdminUsers} className="bg-rose-600 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg">
              Retry
            </button>
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <UserCog className="w-10 h-10 mx-auto text-slate-300" />
            <p className="font-bold text-slate-700 text-sm">No admin user accounts found.</p>
            <p className="text-xs text-slate-500">Click "Add Admin User" to create administrative staff accounts.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px]">
                <tr>
                  <th className="p-3">Admin Name</th>
                  <th className="p-3">Email & Phone</th>
                  <th className="p-3">Department</th>
                  <th className="p-3">Access Level</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-extrabold text-slate-900 text-sm">{u.name}</td>
                    <td className="p-3">
                      <span className="font-bold text-slate-900 block">{u.email}</span>
                      <span className="text-[11px] text-slate-500">{u.phone}</span>
                    </td>
                    <td className="p-3 font-bold text-slate-800">{u.department}</td>
                    <td className="p-3">
                      <span className="bg-indigo-50 text-indigo-700 font-bold px-2.5 py-1 rounded-md border border-indigo-200 text-[10px]">
                        {u.accessLevel}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2.5 py-1 rounded-full">
                        {u.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleAddUser} className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-base font-extrabold text-slate-900">Add Admin Account</h3>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">Full Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Rahul Verma"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">Phone Number</label>
              <input
                type="text"
                required
                placeholder="+91 91897 45120"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">Email Address</label>
              <input
                type="email"
                placeholder="rahul@junkitout.in"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">Department</label>
              <select
                value={newDept}
                onChange={(e) => setNewDept(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold"
              >
                <option value="Operations">Operations</option>
                <option value="Finance">Finance</option>
                <option value="Customer Support">Customer Support</option>
                <option value="Tech & Logistics">Tech & Logistics</option>
              </select>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="w-1/2 bg-slate-100 text-slate-700 font-bold text-xs py-3 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="w-1/2 bg-emerald-600 text-white font-bold text-xs py-3 rounded-xl shadow-md"
              >
                Add User
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
