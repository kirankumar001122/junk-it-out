'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Home, Briefcase } from 'lucide-react';

export default function CustomerAddressesPage() {
  const [addresses, setAddresses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newLabel, setNewLabel] = useState('Home');
  const [newHouse, setNewHouse] = useState('');
  const [newStreet, setNewStreet] = useState('');
  const [newArea, setNewArea] = useState('JP Nagar');
  const [newPincode, setNewPincode] = useState('560078');
  const savingRef = useRef(false);
  const deletingRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/customer/addresses', { credentials: 'same-origin' })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) throw new Error(data.message || 'Unable to load saved addresses.');
        if (!cancelled) setAddresses(Array.isArray(data.data) ? data.data : []);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load saved addresses.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  return (
    <div className="customer-page space-y-6">
      <div className="customer-page-header">
        <div>
          <p className="customer-eyebrow">Pickup preferences</p>
          <h1 className="customer-title mt-2">Saved addresses</h1>
          <p className="customer-subtitle mt-2">Keep your regular pickup locations ready for a faster booking.</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="customer-action flex items-center gap-1.5 bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700"
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
          <div className="customer-surface p-8 text-center text-xs text-slate-500">
            No saved addresses yet. Add one for faster booking.
          </div>
        ) : addresses.map((addr) => (
          <div key={addr.id} className="customer-surface space-y-3 p-5">
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
                aria-label={`Delete ${addr.label} address`}
                className="grid h-10 w-10 place-items-center rounded-xl text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
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
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900">Add Saved Address</h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Address Label:</label>
                <div className="flex gap-2">
                  {['Home', 'Work', 'Other'].map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setNewLabel(l)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold ${
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
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Street & Area:</label>
                <input
                  type="text"
                  value={newStreet}
                  onChange={(e) => setNewStreet(e.target.value)}
                  placeholder="e.g. 15th Cross, JP Nagar 7th Phase"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowAddModal(false)}
                className="w-1/2 bg-slate-100 text-slate-700 font-bold text-xs py-3 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleAddAddress}
                disabled={saving}
                className="w-1/2 bg-emerald-600 text-white font-bold text-xs py-3 rounded-xl shadow-md disabled:opacity-60"
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
