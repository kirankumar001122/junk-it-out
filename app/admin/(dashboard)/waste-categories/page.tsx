'use client';

import { useState, useEffect } from 'react';
import { Tag, Edit, Save, Plus } from 'lucide-react';

export default function AdminWasteCategoriesPage() {
  const [categories, setCategories] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newRate, setNewRate] = useState<number>(0);

  const loadCategories = async () => {
    try {
      const res = await fetch('/api/waste-categories');
      const data = await res.json();
      if (data.success) setCategories(data.data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const handleSaveRate = async (id: string) => {
    try {
      const res = await fetch('/api/waste-categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, pricePerKg: newRate }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setEditingId(null);
        loadCategories();
      } else {
        alert(data?.error?.message || 'Failed to update pricing rate.');
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
            Rate Catalog & Scrap Pricing
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">Waste Categories & Rate Manager</h1>
          <p className="text-xs text-slate-500">Update per-kg buying rates and service charges across all waste categories</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px]">
              <tr>
                <th className="p-3">Category Name</th>
                <th className="p-3">Description</th>
                <th className="p-3">Financial Model</th>
                <th className="p-3">Current Rate (₹/kg)</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {categories.map((cat) => (
                <tr key={cat.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-3 font-extrabold text-slate-900 text-sm">{cat.name}</td>
                  <td className="p-3 text-slate-600 max-w-xs leading-relaxed">{cat.description}</td>
                  <td className="p-3">
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                        cat.type === 'RECYCLABLE_BUY'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-orange-100 text-orange-800'
                      }`}
                    >
                      {cat.type === 'RECYCLABLE_BUY' ? 'We Pay Customer' : 'Customer Pays Fee'}
                    </span>
                  </td>
                  <td className="p-3 font-black text-sm text-slate-900">
                    {editingId === cat.id ? (
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={isNaN(newRate) ? '' : newRate}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setNewRate(isNaN(val) ? 0 : val);
                        }}
                        className="w-24 bg-slate-50 border border-slate-300 rounded-lg p-1.5 text-xs font-bold"
                      />
                    ) : cat.pricePerKg === 0 ? (
                      <span className="text-emerald-700 font-extrabold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-xs">FREE</span>
                    ) : (
                      `₹${cat.pricePerKg} / kg`
                    )}
                  </td>
                  <td className="p-3">
                    {editingId === cat.id ? (
                      <button
                        onClick={() => handleSaveRate(cat.id)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs"
                      >
                        Save
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingId(cat.id);
                          setNewRate(cat.pricePerKg);
                        }}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-3 py-1.5 rounded-lg text-xs"
                      >
                        Edit Rate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
