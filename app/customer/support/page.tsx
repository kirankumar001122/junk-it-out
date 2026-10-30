'use client';

import { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, RefreshCw, Send, HelpCircle } from 'lucide-react';

export default function CustomerSupportPage() {
  const [complaints, setComplaints] = useState<any[]>([]);
  const [userOrders, setUserOrders] = useState<any[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [category, setCategory] = useState('WEIGHT_DISPUTE');
  const [description, setDescription] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchComplaints = async () => {
    try {
      const res = await fetch('/api/complaints');
      const data = await res.json();
      if (data.success) setComplaints(data.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserOrders = async () => {
    try {
      const res = await fetch('/api/orders');
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setUserOrders(data.data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchComplaints();
    fetchUserOrders();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || submitting) return;

    setSubmitting(true);
    setError(null);
    setSubmitted(false);

    try {
      const payload: any = {
        category,
        description: description.trim(),
      };
      if (selectedOrderId) {
        payload.orderId = selectedOrderId;
      }

      const res = await fetch('/api/complaints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSubmitted(true);
        setDescription('');
        setSelectedOrderId('');
        fetchComplaints();
      } else {
        setError(data.message || 'Failed to submit support ticket.');
      }
    } catch (err: any) {
      setError(err.message || 'Network error occurred while submitting ticket.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Customer Support & Disputes</h1>
        <p className="text-xs text-slate-500">Need help with a pickup? Report issues directly to our South Bengaluru operations desk.</p>
      </div>

      {/* NEW TICKET FORM */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-emerald-600" />
          Report an Issue or Submit Support Ticket
        </h3>

        {submitted && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs font-bold flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span>Complaint ticket submitted successfully. Operations team will investigate immediately.</span>
          </div>
        )}

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-bold flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
            <button type="button" onClick={() => setError(null)} className="text-rose-600 font-extrabold text-sm">×</button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Issue Category:</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-800"
              >
                <option value="WEIGHT_DISPUTE">Wrong Weight Measured</option>
                <option value="PAYMENT_ISSUE">Payment / Valuation Mismatch</option>
                <option value="AGENT_BEHAVIOR">Agent Behavior Issue</option>
                <option value="PICKUP_DELAY">Pickup Delay (Exceeded 30 mins)</option>
                <option value="WASTE_NOT_COLLECTED">Waste Not Collected</option>
                <option value="General Inquiry">General Inquiry / Other</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Associated Pickup Order (Optional):</label>
              <select
                value={selectedOrderId}
                onChange={(e) => setSelectedOrderId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-800"
              >
                <option value="">General Support (No Order Selected)</option>
                {userOrders.map((ord) => (
                  <option key={ord.id} value={ord.id}>
                    Order #{ord.orderNumber} ({new Date(ord.createdAt).toLocaleDateString('en-IN')})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Description:</label>
            <textarea
              rows={3}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide specific details about your issue..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            ></textarea>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-500 text-white font-bold text-xs py-3.5 rounded-2xl shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
          >
            <Send className={`w-4 h-4 text-emerald-400 ${submitting ? 'animate-spin' : ''}`} />
            {submitting ? 'SUBMITTING TICKET...' : 'SUBMIT SUPPORT TICKET'}
          </button>
        </form>
      </div>

      {/* TICKETS LIST */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <h3 className="text-sm font-extrabold text-slate-900">Your Support Tickets</h3>

        {loading ? (
          <div className="p-6 text-center text-slate-500 text-xs">
            <RefreshCw className="w-5 h-5 text-emerald-600 animate-spin mx-auto mb-2" />
            Loading tickets...
          </div>
        ) : complaints.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-4">No support tickets filed.</p>
        ) : (
          <div className="space-y-3">
            {complaints.map((c) => (
              <div key={c.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">{c.category.replace(/_/g, ' ')}</span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                      c.status === 'OPEN'
                        ? 'bg-amber-100 text-amber-800'
                        : c.status === 'RESOLVED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {c.status}
                  </span>
                </div>
                <p className="text-slate-600">{c.description}</p>
                <span className="text-[10px] text-slate-400 block font-mono">
                  Filed on {new Date(c.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
