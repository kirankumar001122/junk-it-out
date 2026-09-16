'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, ArrowRight, ShoppingBasket, CheckCircle2, ShieldCheck, Banknote, FileText, Recycle, Cpu, Box, Wine, Sofa } from 'lucide-react';
import { addToPickupCart } from '@/lib/pickupCart';

const icons = [FileText, Recycle, Box, Cpu, Wine, Sofa];

export default function PriceListPage() {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [addedItem, setAddedItem] = useState('');

  useEffect(() => {
    fetch('/api/waste-categories')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setCategories(d.data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filteredCategories = useMemo(() => {
    return categories.filter((c) =>
      `${c.name} ${c.description}`.toLowerCase().includes(query.toLowerCase())
    );
  }, [categories, query]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-8 min-h-[85vh]">
      {/* HEADER HERO */}
      <div className="text-center max-w-3xl mx-auto space-y-2">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200/80">
          <Banknote className="w-3.5 h-3.5" />
          Transparent Scrap Rates & Pricing
        </span>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
          Official Scrap Price List
        </h1>
        <p className="text-slate-600 text-xs sm:text-sm leading-relaxed max-w-xl mx-auto">
          We pay top rate per kg for recyclable scrap. Rates are determined directly at doorstep weighing with digital scale verification.
        </p>
      </div>

      {/* VALUE PROPOSITION BADGES */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-sm flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
            <Banknote className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-xs text-slate-900">Direct Scrap Payouts</h3>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">Recyclables earn instant payout direct to your UPI account.</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-sm flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-xs text-slate-900">Digital Scale Weighing</h3>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">Transparent weight measurement at your doorstep.</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-sm flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-xs text-slate-900">Guaranteed Live Rates</h3>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">Same database rates used in final pickup valuation.</p>
          </div>
        </div>
      </div>

      {/* SEARCH BAR */}
      <div className="relative max-w-lg mx-auto">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by waste item (Paper, Plastic, Metal, E-Waste)..."
          className="w-full h-10 pl-10 pr-4 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 shadow-sm transition-all"
        />
      </div>

      {addedItem && (
        <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold text-center animate-scale-in max-w-lg mx-auto flex items-center justify-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{addedItem}</span>
        </div>
      )}

      {/* PRICE CARDS GRID */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="shimmer-box h-44 rounded-xl w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCategories.map((cat, idx) => {
            const isBuy = cat.type === 'RECYCLABLE_BUY';
            const IconComp = icons[idx % icons.length];
            return (
              <div
                key={cat.id}
                className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-sm hover:border-slate-300 transition-all flex flex-col justify-between space-y-3 group"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
                      <IconComp className="h-4.5 w-4.5" />
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded border ${
                        isBuy
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
                          : 'bg-amber-50 text-amber-800 border-amber-200/80'
                      }`}
                    >
                      {isBuy ? 'We Pay Customer' : 'Service Charge'}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
                      {cat.name}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5 min-h-[32px] leading-relaxed">
                      {cat.description || 'Doorstep collection category.'}
                    </p>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 space-y-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-semibold text-slate-500">Rate</span>
                    <span className="text-xl font-extrabold text-emerald-700">
                      ₹{cat.pricePerKg}
                      <span className="text-xs font-normal text-slate-500"> / kg</span>
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        addToPickupCart(cat.id);
                        setAddedItem(`${cat.name} added to your Pickup Cart`);
                        setTimeout(() => setAddedItem(''), 2500);
                      }}
                      className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs py-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <ShoppingBasket className="w-3.5 h-3.5 text-emerald-400" />
                      Add to Cart
                    </button>

                    <Link
                      href={`/book?category=${encodeURIComponent(cat.id)}`}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-3 py-2 rounded-lg flex items-center justify-center transition-colors"
                    >
                      Book <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* FOOTER CTA */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 text-center space-y-3 shadow-md border border-slate-800">
        <h2 className="text-xl font-bold">Have recyclable scrap or items to clear?</h2>
        <p className="text-xs text-slate-300 max-w-md mx-auto">
          Book a doorstep pickup across Bengaluru. Our verified agent arrives at your scheduled location.
        </p>
        <div className="pt-1">
          <Link
            href="/book"
            className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs px-6 py-2.5 rounded-xl transition-colors"
          >
            Book a Pickup Now <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
