'use client';

import { useEffect, useState } from 'react';

export default function AdminSettlementsPage() {
  const [settlements, setSettlements] = useState<any[]>([]);
  const [error, setError] = useState('');

  const loadSettlements = async () => {
    const response = await fetch('/api/admin/settlements');
    const data = await response.json();
    if (data.success) setSettlements(data.data);
    else setError(data.message || 'Unable to load settlements.');
  };

  useEffect(() => { loadSettlements(); }, []);

  const updateStatus = async (id: string, status: string) => {
    const response = await fetch('/api/admin/settlements', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    const data = await response.json();
    if (data.success) loadSettlements();
    else setError(data.message || 'Unable to update settlement.');
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <span className="text-xs font-bold text-emerald-700 uppercase">Scrap Settlement Ledger</span>
        <h1 className="text-2xl font-black text-slate-900 mt-1">Customer Settlements</h1>
        <p className="text-xs text-slate-500">Backend-calculated recyclable value. No customer Razorpay charges are created here.</p>
      </div>
      {error && <p className="p-3 rounded-xl bg-rose-50 text-rose-700 text-xs font-bold">{error}</p>}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm overflow-x-auto">
        {settlements.length === 0 ? (
          <p className="text-sm text-slate-500">No settlement records are available.</p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px]">
              <tr><th className="p-3">Order</th><th className="p-3">Customer</th><th className="p-3">Weight</th><th className="p-3">Amount</th><th className="p-3">Status</th><th className="p-3">Action</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {settlements.map((settlement) => (
                <tr key={settlement.id}>
                  <td className="p-3 font-mono font-bold">{settlement.order.orderNumber}</td>
                  <td className="p-3 font-bold">{settlement.customer.user.name}</td>
                  <td className="p-3">{settlement.totalWeightKg} kg</td>
                  <td className="p-3 font-black text-emerald-700">₹{settlement.amount.toFixed(2)}</td>
                  <td className="p-3 font-bold">{settlement.status}</td>
                  <td className="p-3">
                    {settlement.status === 'PENDING' && <button onClick={() => updateStatus(settlement.id, 'APPROVED')} className="px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-800 font-bold">Approve</button>}
                    {settlement.status === 'APPROVED' && <button onClick={() => updateStatus(settlement.id, 'READY_FOR_PAYOUT')} className="px-3 py-1.5 rounded-lg bg-amber-100 text-amber-800 font-bold">Ready for payout</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
