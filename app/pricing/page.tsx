'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, ArrowRight, ShoppingBasket, CheckCircle2, ShieldCheck, Banknote } from 'lucide-react';
import { addToPickupCart } from '@/lib/pickupCart';

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

  const getEmojiForCategory = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes('paper') || n.includes('cardboard')) return '📄';
    if (n.includes('plastic')) return '♻️';
    if (n.includes('metal') || n.includes('scrap')) return '🔩';
    if (n.includes('e-waste') || n.includes('electronic')) return '💻';
    if (n.includes('glass') || n.includes('bottle')) return '🍾';
    if (n.includes('furniture') || n.includes('heavy')) return '🛋️';
    if (n.includes('appliance') || n.includes('fridge')) return '🧊';
    return '📦';
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-10">
      {/* HEADER HERO */}
      <div className="text-center max-w-3xl mx-auto space-y-3">
        <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
          <Banknote className="w-3.5 h-3.5" />
          Transparent Scrap Rates & Pricing
        </span>
        <h1 className="text-3xl sm:text-4xl font-black text-slate-950 tracking-tight">
          Junk It Out Official Price List
        </h1>
        <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
          We pay top rate per kg for recyclable scrap! Rates are determined directly at doorstep weighing with digital scale verification.
        </p>
      </div>

      {/* VALUE PROPOSITION BADGES */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <Banknote className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-extrabold text-sm text-slate-900">We Pay You for Scrap</h3>
            <p className="text-xs text-slate-500 mt-0.5">Recyclables earn instant payout direct to your UPI account.</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-extrabold text-sm text-slate-900">Digital Scale Weighing</h3>
            <p className="text-xs text-slate-500 mt-0.5">Transparent weight measurement in front of you at your doorstep.</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-extrabold text-sm text-slate-900">Guaranteed Live Rates</h3>
            <p className="text-xs text-slate-500 mt-0.5">Same database rates used in final pickup valuation.</p>
          </div>
        </div>
      </div>

      {/* SEARCH BAR */}
      <div className="relative max-w-xl mx-auto">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by waste item (e.g. Paper, Plastic, Iron, Fridge)..."
          className="w-full h-12 pl-12 pr-4 rounded-2xl border border-slate-200 bg-white text-sm font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 shadow-sm transition-all"
        />
      </div>

      {addedItem && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold text-center animate-scale-in">
          ✅ {addedItem}
        </div>
      )}

      {/* PRICE CARDS GRID */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="shimmer-box h-48 rounded-3xl w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredCategories.map((cat) => {
            const isBuy = cat.type === 'RECYCLABLE_BUY';
            return (
              <div
                key={cat.id}
                className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm hover:border-emerald-400 transition-all flex flex-col justify-between space-y-4 group"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-3xl p-2 bg-slate-50 rounded-2xl">{getEmojiForCategory(cat.name)}</span>
                    <span
                      className={`text-[10px] font-black uppercase px-3 py-1 rounded-full border ${
                        isBuy
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                          : 'bg-amber-100 text-amber-900 border-amber-200'
                      }`}
                    >
                      {isBuy ? '💵 We Pay Customer' : '🚚 Doorstep Charge'}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-lg font-black text-slate-950 group-hover:text-emerald-700 transition-colors">
                      {cat.name}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 min-h-[36px] leading-relaxed">{cat.description}</p>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 space-y-4">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-bold text-slate-400">Current Rate</span>
                    <span className="text-2xl font-black text-emerald-600">
                      ₹{cat.pricePerKg}
                      <span className="text-xs font-semibold text-slate-500"> / kg</span>
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        addToPickupCart(cat.id);
                        setAddedItem(`${cat.name} added to your Pickup Cart!`);
                        setTimeout(() => setAddedItem(''), 3000);
                      }}
                      className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs py-3 rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <ShoppingBasket className="w-4 h-4" />
                      Add to Cart
                    </button>

                    <Link
                      href={`/book?category=${encodeURIComponent(cat.id)}`}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-4 py-3 rounded-xl flex items-center justify-center transition-colors"
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
      <div className="bg-slate-900 text-white rounded-3xl p-8 text-center space-y-4 shadow-xl">
        <h2 className="text-2xl font-black">Got bulky scrap or household junk?</h2>
        <p className="text-xs text-slate-300 max-w-md mx-auto">
          Book a doorstep pickup in under 60 seconds. Our verified agent arrives in 20–30 minutes in Bengaluru.
        </p>
        <Link
          href="/book"
          className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs px-8 py-3.5 rounded-2xl uppercase tracking-wider shadow-lg transition-transform hover:scale-105"
        >
          BOOK A PICKUP NOW <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
