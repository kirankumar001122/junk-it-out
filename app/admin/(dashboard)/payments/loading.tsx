import { CreditCard } from 'lucide-react';

export default function PaymentsLoading() {
  return (
    <section className="space-y-6" aria-label="Loading payments" aria-busy="true">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <span className="text-xs font-bold uppercase text-emerald-700">Financial Ledger</span>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">Payments & Customer Settlement</h1>
        <p className="mt-2 flex items-center gap-2 text-xs text-slate-500">
          <CreditCard className="h-4 w-4" /> Opening payment records…
        </p>
      </div>
      <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="h-9 w-80 max-w-full animate-pulse rounded-xl bg-slate-100" />
        <div className="h-56 animate-pulse rounded-2xl bg-slate-50" />
      </div>
    </section>
  );
}
