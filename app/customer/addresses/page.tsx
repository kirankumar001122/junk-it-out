'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Home, Briefcase, Lock, X } from 'lucide-react';
import CustomerOtpLogin from '@/components/CustomerOtpLogin';

export default function CustomerAddressesPage() {
  const [addresses, setAddresses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isCustomer, setIsCustomer] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('Home');
  const [newHouse, setNewHouse] = useState('');
  const [newStreet, setNewStreet] = useState('');
  const [newArea, setNewArea] = useState('JP Nagar');
  const [newPincode, setNewPincode] = useState('560078');
  const savingRef = useRef(false);
  const deletingRef = useRef<string | null>(null);

  const fetchAddresses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/customer/addresses', { credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setIsCustomer(false);
        setAddresses([]);
        return;
      }
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Unable to load saved addresses.');
      }
      setIsCustomer(true);
      setAddresses(Array.isArray(data.data) ? data.data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load saved addresses.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAddresses();

    const handleAuthChange = () => {
      void fetchAddresses();
    };
    window.addEventListener('jio_auth_change', handleAuthChange);
    return () => {
      window.removeEventListener('jio_auth_change', handleAuthChange);
    };
  }, [fetchAddresses]);

  useEffect(() => {
    if (!showAddModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) setShowAddModal(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showAddModal, saving]);

  const handleAddAddress = async () => {
    if (savingRef.current) return;
    if (!newHouse.trim() || !newStreet.trim() || !newArea.trim()) {
      setError('House, street, and area are required.');
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/customer/addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          label: newLabel,
          houseNo: newHouse.trim(),
          street: newStreet.trim(),
          area: newArea.trim(),
          pincode: newPincode.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.message || 'Unable to save address.');
      setAddresses((current) => [data.data, ...current]);
      setShowAddModal(false);
      setNewHouse('');
      setNewStreet('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save address.');
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  const handleDeleteAddress = async (id: string) => {
    if (deletingRef.current) return;
    deletingRef.current = id;
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/customer/addresses?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.message || 'Unable to delete address.');
      setAddresses((current) => current.filter((address) => address.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete address.');
    } finally {
      setDeletingId(null);
      deletingRef.current = null;
    }
  };

  if (!loading && !isCustomer) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-6">
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
            <Lock className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-black text-slate-900">Saved Addresses</h1>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Log in with your mobile OTP to view and manage your doorstep pickup addresses in South Bengaluru.
            </p>
          </div>
          <button
            onClick={() => setLoginOpen(true)}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs py-3.5 rounded-2xl shadow-md uppercase tracking-wider transition-colors cursor-pointer"
          >
            LOGIN WITH MOBILE OTP
          </button>
        </div>

        <CustomerOtpLogin
          open={loginOpen}
          onClose={() => setLoginOpen(false)}
          onAuthenticated={() => {
            setLoginOpen(false);
            void fetchAddresses();
          }}
        />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Saved Addresses</h1>
          <p className="text-xs text-slate-500">Manage your Home, Work, and pickup locations in South Bengaluru</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-1.5 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Add Address
        </button>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-4 py-3 text-xs font-bold">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {loading ? (
          <div className="rounded-3xl bg-slate-100 h-28 animate-pulse" />
        ) : addresses.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500">
            No saved addresses yet. Add one for faster booking.
          </div>
        ) : addresses.map((addr) => (
          <div key={addr.id} className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs">
                  {addr.label === 'Home' ? <Home className="w-4 h-4" /> : <Briefcase className="w-4 h-4" />}
                </div>
                <span className="font-extrabold text-slate-900 text-sm">{addr.label}</span>
                {addr.isDefault && (
                  <span className="text-[10px] font-extrabold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                    DEFAULT
                  </span>
                )}
              </div>
              <button
                onClick={() => handleDeleteAddress(addr.id)}
                disabled={deletingId === addr.id}
                className="text-slate-400 hover:text-rose-600 p-1 disabled:opacity-50"
              >
                <Trash2 className={`w-4 h-4 ${deletingId === addr.id ? 'animate-pulse' : ''}`} />
              </button>
            </div>

            <div className="text-xs text-slate-700 space-y-0.5 pl-10">
              <p className="font-bold text-slate-900">{addr.houseNo}</p>
              <p>{addr.street}, {addr.area}, Bengaluru - {addr.pincode}</p>
              {addr.landmark && <p className="text-slate-500 italic">Landmark: {addr.landmark}</p>}
            </div>
          </div>
        ))}
      </div>

      {showAddModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add Saved Address"
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 overflow-y-auto pb-[calc(1rem+env(safe-area-inset-bottom,0px))]"
        >
          {/* Backdrop overlay: blurs background page content only, dismissible on click */}
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
            style={{ WebkitBackdropFilter: 'blur(4px)' }}
            onClick={() => !saving && setShowAddModal(false)}
            aria-hidden="true"
          />

          {/* Modal content: completely sharp, isolated from backdrop filter, scrollable on short mobile viewports */}
          <div
            className="relative z-10 bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl my-auto max-h-[calc(100dvh-2rem)] overflow-y-auto border border-slate-100"
            style={{ transform: 'translateZ(0)' }}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Add Saved Address</h3>
              <button
                type="button"
                onClick={() => !saving && setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Address Label:</label>
                <div className="flex gap-2">
                  {['Home', 'Work', 'Other'].map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setNewLabel(l)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                        newLabel === l ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">House / Flat No:</label>
                <input
                  type="text"
                  value={newHouse}
                  onChange={(e) => setNewHouse(e.target.value)}
                  placeholder="e.g. Flat 204, Royal Palms"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Street & Area:</label>
                <input
                  type="text"
                  value={newStreet}
                  onChange={(e) => setNewStreet(e.target.value)}
                  placeholder="e.g. 15th Cross, JP Nagar 7th Phase"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="w-1/2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-3 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddAddress}
                disabled={saving}
                className="w-1/2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-3 rounded-xl shadow-md disabled:opacity-60 transition-colors cursor-pointer"
              >
                {saving ? 'Saving...' : 'Save Address'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
