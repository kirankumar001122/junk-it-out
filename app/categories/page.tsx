'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Search,
  Plus,
  Minus,
  CheckCircle2,
  FileText,
  Recycle,
  Cpu,
  Box,
  Wine,
  Sofa,
} from 'lucide-react';

import {
  addToPickupCart,
  readPickupCart,
  updatePickupCartQuantity,
  removeFromPickupCart,
  pickupCartEvent,
  PickupCartItem,
} from '@/lib/pickupCart';

const icons = [
  FileText,
  Recycle,
  Box,
  Cpu,
  Wine,
  Sofa,
];

const categoryImages: Record<string, string> = {
  'E-Waste': '/categories/e-waste.png',
  'Household Dry Waste': '/categories/household-waste.png',
  'Paper & Cardboard': '/categories/paper-cardboard.jpg',
  'Plastic Waste': '/categories/plastic-waste.jpg',
};

const allowedCategoryNames = [
  'E-Waste',
  'Household Dry Waste',
  'Paper & Cardboard',
  'Plastic Waste',
] as const;


export default function CategoriesPage() {
  const [categories, setCategories] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [added, setAdded] = useState('');
  const [cartItems, setCartItems] = useState<PickupCartItem[]>([]);

  useEffect(() => {
    const initial =
      new URLSearchParams(window.location.search).get('q') || '';

    setQuery(initial);

    fetch('/api/waste-categories')
      .then((r) => r.json())
      .then((d) => {
        const data = Array.isArray(d?.data) ? d.data : [];

        const filteredCategories = data.filter((category: any) =>
          allowedCategoryNames.includes(category.name)
        );

        setCategories(filteredCategories);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const refresh = () => {
      setCartItems(readPickupCart());
    };

    refresh();

    window.addEventListener(pickupCartEvent, refresh);

    return () => {
      window.removeEventListener(pickupCartEvent, refresh);
    };
  }, []);

  const results = useMemo(() => {
    const search = query.trim().toLowerCase();

    return categories.filter((category) => {
      if (!allowedCategoryNames.includes(category.name)) {
        return false;
      }

      if (!search) {
        return true;
      }

      return `${category.name} ${category.description || ''}`
        .toLowerCase()
        .includes(search);
    });
  }, [categories, query]);

  return (
    <main className="mx-auto min-h-[80vh] max-w-6xl px-4 py-10 sm:px-6">

      {/* HEADER */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">
          Accepted Materials
        </p>

        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Waste Category Catalogue
        </h1>

        <p className="mt-1 text-xs text-slate-600 sm:text-sm">
          Explore rates per kg, search items, and add them directly to your
          Pickup Cart.
        </p>
      </div>

      {/* SEARCH */}
      <label className="relative mt-6 block max-w-lg">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search paper, plastic, household, e-waste..."
          className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-xs font-medium text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 placeholder:text-slate-400 sm:text-sm"
        />
      </label>

      {/* ADDED MESSAGE */}
      {added && (
        <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{added}</span>
        </div>
      )}

      {/* CATEGORY GRID */}
      <section className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
        {results.map((category, index) => {
          const IconComp = icons[index % icons.length];

          const cartItem = cartItems.find(
            (i) => i.categoryId === category.id
          );

          const quantity = cartItem ? cartItem.quantity : 0;

          return (
            <article
              key={category.id}
              className="flex min-h-[420px] flex-col rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
            >
              {/* IMAGE */}
              <div className="mb-4 h-32 w-full overflow-hidden rounded-xl bg-emerald-50">
                {categoryImages[category.name] ? (
                  <img
                    src={categoryImages[category.name]}
                    alt={category.name}
                    className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <IconComp className="h-8 w-8 text-emerald-600" />
                  </div>
                )}
              </div>

              {/* CONTENT */}
              <div className="flex-1">

                {category.name === 'Household Dry Waste' ? (
                  <>
                    <h2 className="text-base font-bold text-slate-900">
                      Household Junk
                    </h2>

                    <p className="mt-2 text-xs leading-relaxed text-slate-600">
                      Old furniture, mattresses, appliances, and general
                      household clutter cleared out fast.
                    </p>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
                        <h3 className="text-xs font-bold text-emerald-700">
                          Wet Waste
                        </h3>

                        <p className="mt-1 text-[10px] leading-relaxed text-slate-600">
                          Food scraps, peels, leftover food, etc.
                        </p>
                      </div>

                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
                        <h3 className="text-xs font-bold text-emerald-700">
                          Dry Waste
                        </h3>

                        <p className="mt-1 text-[10px] leading-relaxed text-slate-600">
                          Paper, plastic, glass, metal, etc.
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="text-sm font-bold text-slate-900">
                      {category.name}
                    </h2>

                    <p className="mt-1 min-h-8 text-xs leading-relaxed text-slate-500">
                      {category.description ||
                        'Standard waste collection category.'}
                    </p>
                  </>
                )}

                {/* PRICE */}
                <p className="mt-3 text-xs font-bold text-emerald-700">
                  ₹{category.pricePerKg}{' '}
                  <span className="text-[10px] font-normal text-slate-500">
                    / kg
                  </span>

                  {category.type !== 'RECYCLABLE_BUY' && (
                    <span className="ml-2 text-[10px] font-medium text-slate-400">
                      (Service charge)
                    </span>
                  )}
                </p>
              </div>

              {/* ACTIONS */}
              <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3">

                {quantity === 0 ? (
                  <button
                    onClick={() => {
                      addToPickupCart(category.id);

                      setAdded(
                        `${category.name} added to Pickup Cart (1 kg)`
                      );

                      setTimeout(() => setAdded(''), 2500);
                    }}
                    className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-bold text-white transition-colors hover:bg-emerald-600"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    ADD
                  </button>
                ) : (
                  <div className="flex h-10 flex-1 items-center justify-between rounded-lg border border-emerald-300 bg-emerald-50/80 px-1">

                    <button
                      onClick={() => {
                        if (quantity <= 1) {
                          removeFromPickupCart(category.id);
                        } else {
                          updatePickupCartQuantity(
                            category.id,
                            quantity - 1
                          );
                        }
                      }}
                      className="grid h-8 w-8 place-items-center rounded-md bg-white text-slate-700 shadow-sm hover:bg-slate-100"
                      aria-label="Decrease quantity"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>

                    <span className="px-2 text-xs font-extrabold text-emerald-950">
                      {quantity} kg
                    </span>

                    <button
                      onClick={() =>
                        updatePickupCartQuantity(
                          category.id,
                          quantity + 1
                        )
                      }
                      className="grid h-8 w-8 place-items-center rounded-md bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
                      aria-label="Increase quantity"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>

                  </div>
                )}

                <Link
                  href={`/book?category=${encodeURIComponent(
                    category.id
                  )}`}
                  className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Book
                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Link>

              </div>
            </article>
          );
        })}
      </section>

      {/* NO RESULTS */}
      {results.length === 0 && (
        <div className="mt-10 rounded-xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-xs font-medium text-slate-500">
            No matching waste category found for "{query}".
          </p>
        </div>
      )}
    </main>
  );
}