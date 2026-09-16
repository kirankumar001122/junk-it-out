'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Search, Plus, Minus, CheckCircle2, FileText, Recycle, Cpu, Box, Wine, Sofa } from 'lucide-react';
import { addToPickupCart, readPickupCart, updatePickupCartQuantity, removeFromPickupCart, pickupCartEvent, PickupCartItem } from '@/lib/pickupCart';

const icons = [FileText, Recycle, Box, Cpu, Wine, Sofa];

export default function CategoriesPage() {
  const [categories, setCategories] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [added, setAdded] = useState('');
  const [cartItems, setCartItems] = useState<PickupCartItem[]>([]);

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get('q') || '';
    setQuery(initial);
    fetch('/api/waste-categories')
      .then((r) => r.json())
      .then((d) => setCategories(d.success ? d.data : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const refresh = () => setCartItems(readPickupCart());
    refresh();
    window.addEventListener(pickupCartEvent, refresh);
    return () => window.removeEventListener(pickupCartEvent, refresh);
  }, []);

  const results = useMemo(
    () =>
      categories.filter((c) =>
        `${c.name} ${c.description}`.toLowerCase().includes(query.toLowerCase())
      ),
    [categories, query]
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 min-h-[80vh]">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Accepted Materials</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Waste Category Catalogue
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-slate-600">
          Explore rates per kg, search items, and add them directly to your Pickup Cart.
        </p>
      </div>

      <label className="relative mt-6 block max-w-lg">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search paper, plastic, metal, e-waste..."
          className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-xs sm:text-sm font-medium text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 placeholder:text-slate-400"
        />
      </label>

      {added && (
        <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-800 animate-scale-in">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{added}</span>
        </div>
      )}

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((category, index) => {
          const IconComp = icons[index % icons.length];
          const cartItem = cartItems.find((i) => i.categoryId === category.id);
          const quantity = cartItem ? cartItem.quantity : 0;

          return (
            <article
              key={category.id}
              className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm flex flex-col justify-between hover:border-slate-300 transition-all"
            >
              <div>
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-50 text-emerald-600 mb-3">
                  <IconComp className="h-5 w-5" />
                </div>
                <h2 className="text-sm font-bold text-slate-900">{category.name}</h2>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed min-h-8">
                  {category.description || 'Standard waste collection category.'}
                </p>
                <p className="mt-2 text-xs font-bold text-emerald-700">
                  ₹{category.pricePerKg} <span className="text-[10px] font-normal text-slate-500">/ kg</span>
                  <span className="ml-2 text-[10px] font-medium text-slate-400">
                    ({category.type === 'RECYCLABLE_BUY' ? 'We pay you' : 'Service charge'})
                  </span>
                </p>
              </div>

              <div className="mt-4 flex gap-2 pt-3 border-t border-slate-100 items-center justify-between">
                {quantity === 0 ? (
                  <button
                    onClick={() => {
                      addToPickupCart(category.id);
                      setAdded(`${category.name} added to Pickup Cart (1 kg)`);
                      setTimeout(() => setAdded(''), 2500);
                    }}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-600 transition-colors cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    ADD
                  </button>
                ) : (
                  <div className="flex flex-1 items-center justify-between rounded-lg border border-emerald-300 bg-emerald-50/80 px-1 py-0.5">
                    <button
                      onClick={() => {
                        if (quantity <= 1) {
                          removeFromPickupCart(category.id);
                        } else {
                          updatePickupCartQuantity(category.id, quantity - 1);
                        }
                      }}
                      className="grid h-7 w-7 place-items-center rounded-md bg-white text-slate-700 shadow-xs hover:bg-slate-100 transition-colors cursor-pointer"
                      aria-label="Decrease quantity"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="text-xs font-extrabold text-emerald-950 px-2">{quantity} kg</span>
                    <button
                      onClick={() => updatePickupCartQuantity(category.id, quantity + 1)}
                      className="grid h-7 w-7 place-items-center rounded-md bg-emerald-600 text-white shadow-xs hover:bg-emerald-700 transition-colors cursor-pointer"
                      aria-label="Increase quantity"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                <Link
                  href={`/book?category=${encodeURIComponent(category.id)}`}
                  className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shrink-0"
                >
                  Book <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </div>
            </article>
          );
        })}
      </section>

      {results.length === 0 && (
        <div className="mt-10 rounded-xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-xs font-medium text-slate-500">No matching waste category found for "{query}".</p>
        </div>
      )}
    </main>
  );
}
