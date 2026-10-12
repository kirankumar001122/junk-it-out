'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin, Plus, Trash2, CheckCircle, Home, Briefcase, Tag } from 'lucide-react';
import { parseAddressCoordinate } from '@/lib/customerAddresses';
import { formatPickupAddress } from '@/lib/address';

export default function CustomerAddressesPage() {
  const [addresses, setAddresses] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newLabel, setNewLabel] = useState('Home');
  const [newHouse, setNewHouse] = useState('');
  const [newStreet, setNewStreet] = useState('');
  const [newArea, setNewArea] = useState('');
  const [newPincode, setNewPincode] = useState('');
  const [newLat, setNewLat] = useState('');
  const [newLng, setNewLng] = useState('');

  const loadAddresses = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/customer/addresses');
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Could not load saved addresses.');
      setAddresses(result.data || []);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Could not load saved addresses.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadAddresses(); }, []);

  const handleAddAddress = async () => {
    const latitude = parseAddressCoordinate(newLat, -90, 90);
    const longitude = parseAddressCoordinate(newLng, -180, 180);
    if (!newHouse.trim() || !newStreet.trim() || !newArea.trim() || !newPincode.trim() || latitude === null || longitude === null) {
      setError('Complete all required address fields and enter the actual map coordinates.');
      return;
    }
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const response = await fetch('/api/customer/addresses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
      label: newLabel,
          houseNo: newHouse, street: newStreet, area: newArea, pincode: newPincode,
          lat: latitude, lng: longitude, isDefault: addresses.length === 0,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Could not save address.');
      setShowAddModal(false);
      setNewHouse(''); setNewStreet(''); setNewArea(''); setNewPincode(''); setNewLat(''); setNewLng('');
      await loadAddresses();
    } catch (err: any) {
      setError(err.message || 'Could not save address.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleDeleteAddress = async (id: string) => {
    if (!window.confirm('Delete this saved address?')) return;
    try {
      const response = await fetch(`/api/customer/addresses/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Could not delete address.');
      await loadAddresses();
    } catch (err: any) { setError(err.message || 'Could not delete address.'); }
  };

  const handleSetDefault = async (id: string) => {
    try {
      const response = await fetch(`/api/customer/addresses/${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isDefault: true }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Could not update address.');
      await loadAddresses();
    } catch (err: any) { setError(err.message || 'Could not update address.'); }
  };

  const handleRename = async (address: any) => {
    const label = window.prompt('Address label', address.label);
    if (!label?.trim()) return;
    try {
      const response = await fetch(`/api/customer/addresses/${encodeURIComponent(address.id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: label.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Could not update address.');
      await loadAddresses();
    } catch (err: any) { setError(err.message || 'Could not update address.'); }
  };

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

      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}

      <div className="space-y-4">
        {loading && <p className="text-sm text-slate-500">Loading saved addresses…</p>}
        {!loading && !addresses.length && <p className="text-sm text-slate-500">No saved addresses yet.</p>}
        {addresses.map((addr) => (
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
              <div className="flex items-center gap-2">
                <button onClick={() => void handleRename(addr)} className="text-xs font-bold text-slate-600">Edit label</button>
                {!addr.isDefault && <button onClick={() => void handleSetDefault(addr.id)} className="text-xs font-bold text-emerald-700">Set default</button>}
                <button onClick={() => void handleDeleteAddress(addr.id)} className="text-slate-400 hover:text-rose-600 p-1" aria-label="Delete address">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="text-xs text-slate-700 space-y-0.5 pl-10">
              <p className="font-bold text-slate-900">{addr.houseNo}</p>
              <p>{formatPickupAddress(addr) || 'Address not available'}</p>
              {addr.landmark && <p className="text-slate-500 italic">Landmark: {addr.landmark}</p>}
            </div>
          </div>
        ))}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
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
                <label className="block text-xs font-bold text-slate-700 mb-1">Street:</label>
                <input
                  type="text"
                  value={newStreet}
                  onChange={(e) => setNewStreet(e.target.value)}
                  placeholder="Street"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs"
                />
              </div>
              <input value={newArea} onChange={(e) => setNewArea(e.target.value)} placeholder="Area" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs" />
              <input value={newPincode} onChange={(e) => setNewPincode(e.target.value)} placeholder="Postcode" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs" />
              <div className="grid grid-cols-2 gap-2">
                <input value={newLat} onChange={(e) => setNewLat(e.target.value)} placeholder="Latitude from map" inputMode="decimal" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs" />
                <input value={newLng} onChange={(e) => setNewLng(e.target.value)} placeholder="Longitude from map" inputMode="decimal" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs" />
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
                className="w-1/2 bg-emerald-600 text-white font-bold text-xs py-3 rounded-xl shadow-md"
              >
                {saving ? 'Saving…' : 'Save Address'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
