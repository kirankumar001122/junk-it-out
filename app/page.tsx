'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BadgeIndianRupee,
  Clock3,
  MapPinned,
  Recycle,
  ShieldCheck,
  ShoppingBasket,
  Sparkles,
  Truck,
  Package,
  FileText,
  Cpu,
  Wine,
  Sofa,
  Box,
  CheckCircle2,
  Plus,
  Minus,
} from 'lucide-react';

import {
  addToPickupCart,
  readPickupCart,
  updatePickupCartQuantity,
  removeFromPickupCart,
  pickupCartEvent,
  PickupCartItem,
} from '@/lib/pickupCart';

import CustomerReviews from '@/components/CustomerReviews';

const categoryIcons = [
  FileText,
  Package,
  Recycle,
  Box,
  Cpu,
  Wine,
  Sofa,
  Sparkles,
];

const categoryImages: Record<string, string> = {
  'E-Waste': '/categories/e-waste.png',
  'Household Dry Waste': '/categories/household-waste.png',
  'Paper & Cardboard': '/categories/paper-cardboard.jpg',
  'Plastic Waste': '/categories/plastic-waste.jpg',
};

export default function HomePage() {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [cartItems, setCartItems] = useState<PickupCartItem[]>([]);

  useEffect(() => {
    fetch('/api/waste-categories')
      .then((r) => r.json())
      .then((d) => setCategories(d.success ? d.data : []))
      .catch(() => setCategories([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const refresh = () => setCartItems(readPickupCart());

    refresh();

    window.addEventListener(pickupCartEvent, refresh);

    return () => window.removeEventListener(pickupCartEvent, refresh);
  }, []);

  // Only show the four requested waste categories
  const featured = useMemo(() => {
    const allowedCategories = new Set([
      'E-Waste',
      'Household Dry Waste',
      'Paper & Cardboard',
      'Plastic Waste',
    ]);

    return categories.filter((category) =>
      allowedCategories.has(category.name?.trim())
    );
  }, [categories]);

  const addCategory = (category: any) => {
    addToPickupCart(category.id);

    setNotice(
      `${category.name} added to your Pickup Cart (1 kg)`
    );

    window.setTimeout(() => setNotice(''), 2200);
  };

  return (
    <div className="min-h-screen bg-slate-50/60 pb-20">

      {/* Toast Notification */}
      {notice && (
        <div className="fixed bottom-20 left-1/2 z-50 flex -translate-x-1/2 animate-fade-in-up items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-xl">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{notice}</span>
        </div>
      )}

      {/* Hero Section */}
      <section
        className="relative overflow-hidden border-b border-slate-800 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: "url('/images/junk_it_out.png')",
        }}
      >
        {/* Dark overlay for readability */}
        <div className="absolute inset-0 bg-slate-950/60" />

        {/* Green glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(16,185,129,0.18),rgba(255,255,255,0))]" />

        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-14 sm:px-6 md:grid-cols-[1.1fr_.9fr] md:py-24">

          <div className="max-w-2xl">

            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400">
              <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
              <span>Doorstep Pickup Across Bengaluru</span>
            </div>

            <h1 className="text-3xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-6xl">
              Turn scrap &amp; waste <br className="hidden sm:inline" />
              <span className="text-emerald-400">
                into instant value.
              </span>
            </h1>

            <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-300 sm:text-base">
              Select items, schedule doorstep pickup in Bengaluru, and
              track your request live from collection to settlement.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">

              <Link
                href="/book?cart=1"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/20 transition-all hover:bg-emerald-400 active:scale-95"
              >
                <ShoppingBasket className="h-4.5 w-4.5" />
                <span>Book a Pickup</span>
                <ArrowRight className="h-4 w-4" />
              </Link>

              <a
                href="#categories"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/60 px-6 text-sm font-semibold text-slate-200 transition-all hover:border-slate-600 hover:bg-slate-800"
              >
                Explore Categories
              </a>

            </div>

            <div className="mt-10 grid grid-cols-3 gap-3 border-t border-slate-800/80 pt-6 text-xs">

              <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3 text-slate-300">
                <Clock3 className="mb-1.5 h-4 w-4 text-emerald-400" />

                <strong className="block font-semibold text-white">
                  Fast Scheduling
                </strong>

                <span className="text-[11px] text-slate-400">
                  ASAP or chosen slots
                </span>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3 text-slate-300">
                <BadgeIndianRupee className="mb-1.5 h-4 w-4 text-emerald-400" />

                <strong className="block font-semibold text-white">
                  Upfront Rates
                </strong>

                <span className="text-[11px] text-slate-400">
                  Fair value per kg
                </span>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3 text-slate-300">
                <Recycle className="mb-1.5 h-4 w-4 text-emerald-400" />

                <strong className="block font-semibold text-white">
                  Responsible
                </strong>

                <span className="text-[11px] text-slate-400">
                  Eco-friendly processing
                </span>
              </div>

            </div>
          </div>

          {/* Clean Interactive Process Preview */}
          <div className="relative hidden items-center justify-center md:flex">

            <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl">

              <div className="flex items-center justify-between border-b border-slate-800 pb-4">

                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />

                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Simple 3-Step Pickup
                  </span>
                </div>

                <Truck className="h-5 w-5 text-emerald-400" />

              </div>

              <div className="mt-5 space-y-3">

                <div className="flex items-center gap-3.5 rounded-xl border border-slate-800/80 bg-slate-900/80 p-3.5 text-xs text-slate-200">

                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-xs font-bold text-emerald-400">
                    1
                  </span>

                  <span className="font-semibold text-slate-200">
                    Add recyclables to Pickup Cart
                  </span>

                </div>

                <div className="flex items-center gap-3.5 rounded-xl border border-slate-800/80 bg-slate-900/80 p-3.5 text-xs text-slate-200">

                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-xs font-bold text-emerald-400">
                    2
                  </span>

                  <span className="font-semibold text-slate-200">
                    Set doorstep location &amp; time
                  </span>

                </div>

                <div className="flex items-center gap-3.5 rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-3.5 text-xs text-white">

                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-xs font-bold text-slate-950">
                    3
                  </span>

                  <span className="font-bold text-emerald-300">
                    Track assigned agent live
                  </span>

                </div>

              </div>
            </div>
          </div>

        </div>
      </section>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl space-y-12 px-4 py-12 sm:px-6">

        {/* Waste Categories */}
        <section
          id="categories"
          className="scroll-mt-20"
        >

          {/* Section Header */}
          <div className="mb-8 flex items-end justify-between gap-4">

            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                Accepted Materials
              </p>

              <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Add waste items to your cart
              </h2>
            </div>

            <Link
              href="/categories"
              className="flex shrink-0 items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-800"
            >
              <span>View all</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>

          </div>

          {/* Four Category Cards */}
          <div className="grid grid-cols-1 items-start gap-5 sm:grid-cols-2 lg:grid-cols-4">

            {loading
              ? Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-48 w-full animate-pulse rounded-2xl bg-slate-200"
                  />
                ))
              : featured.map((category, index) => {

                  const IconComp =
                    categoryIcons[index % categoryIcons.length];

                  const cartItem = cartItems.find(
                    (i) => i.categoryId === category.id
                  );

                  const quantity = cartItem
                    ? cartItem.quantity
                    : 0;

                  return (
                    <article
                      key={category.id}
                      className="flex h-[360px] w-full flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm transition-all hover:-translate-y-1 hover:border-emerald-400 hover:shadow-md"
                    >

                      <Link
                        href={`/book?category=${encodeURIComponent(
                          category.id
                        )}`}
                        className="block"
                      >

                        {category.name === 'Household Dry Waste' ? (
                          <>
                            <div className="mb-3 overflow-hidden rounded-xl bg-emerald-50">
                              <img
                                src="/categories/household-waste.png"
                                alt="Wet Waste and Dry Waste"
                                className="h-24 w-full object-cover"
                              />
                            </div>

                            <h3 className="text-base font-bold leading-tight text-slate-900">
                              Household Junk
                            </h3>

                            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                              Old furniture, mattresses, appliances, and general
                              household clutter cleared out fast.
                            </p>

                            <div className="mt-3 grid grid-cols-2 gap-2">
                              <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-2.5">
                                <p className="text-xs font-bold text-emerald-700">
                                  Wet Waste
                                </p>
                                <p className="mt-1 text-[10px] leading-relaxed text-slate-600">
                                  Food scraps, peels, leftover food, etc.
                                </p>
                              </div>

                              <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-2.5">
                                <p className="text-xs font-bold text-emerald-700">
                                  Dry Waste
                                </p>
                                <p className="mt-1 text-[10px] leading-relaxed text-slate-600">
                                  Paper, plastic, glass, metal, etc.
                                </p>
                              </div>
                            </div>

                            <p className="mt-3 text-sm font-extrabold text-emerald-700">
                              ₹{category.pricePerKg}{' '}
                              <span className="text-[10px] font-normal text-slate-500">
                                / kg
                              </span>
                            </p>
                          </>
                        ) : (
                          <>
                            {categoryImages[category.name] ? (
                              <div className="mb-3 h-24 w-full overflow-hidden rounded-xl bg-emerald-50">
                                <img
                                  src={categoryImages[category.name]}
                                  alt={category.name}
                                  className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                                />
                              </div>
                            ) : (
                              <div className="mb-3 grid h-24 w-full place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                                <IconComp className="h-8 w-8 text-emerald-600" />
                              </div>
                            )}

                            <h3 className="min-h-10 text-sm font-bold leading-tight text-slate-900">
                              {category.name}
                            </h3>

                            <p className="mt-2 text-sm font-extrabold text-emerald-700">
                              ₹{category.pricePerKg}{' '}
                              <span className="text-xs font-normal text-slate-500">
                                / kg
                              </span>
                            </p>
                          </>
                        )}

                      </Link>

                      {quantity === 0 ? (

                        <button
                          onClick={() => addCategory(category)}
                          className="mt-3 inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-slate-900 text-sm font-bold text-white transition-colors hover:bg-emerald-600 active:scale-95"
                        >
                          <Plus className="h-4 w-4" />
                          ADD
                        </button>

                      ) : (

                        <div className="mt-4 flex h-10 items-center justify-between rounded-lg border border-emerald-300 bg-emerald-50/80 px-1">

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
                            className="grid h-8 w-8 cursor-pointer place-items-center rounded-md bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-100"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="h-4 w-4" />
                          </button>

                          <span className="px-2 text-sm font-extrabold text-emerald-950">
                            {quantity} kg
                          </span>

                          <button
                            onClick={() =>
                              updatePickupCartQuantity(
                                category.id,
                                quantity + 1
                              )
                            }
                            className="grid h-8 w-8 cursor-pointer place-items-center rounded-md bg-emerald-600 text-white shadow-sm transition-colors hover:bg-emerald-700"
                            aria-label="Increase quantity"
                          >
                            <Plus className="h-4 w-4" />
                          </button>

                        </div>

                      )}

                    </article>
                  );
                })}

          </div>
        </section>

        {/* Feature Highlights Grid */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

          {[
            {
              icon: Truck,
              title: 'Doorstep Pickup',
              copy: 'Convenient waste collection directly from your home, office, or store.',
            },
            {
              icon: Clock3,
              title: 'Flexible Scheduling',
              copy: 'Choose immediate pickup or schedule a slot that fits your day.',
            },
            {
              icon: BadgeIndianRupee,
              title: 'Transparent Value',
              copy: 'Clear rates per kg shown upfront with live digital weighing.',
            },
            {
              icon: MapPinned,
              title: 'Live Tracking',
              copy: 'Monitor your pickup status and agent progress in real time.',
            },
          ].map(({ icon: Icon, title, copy }) => (

            <div
              key={title}
              className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm"
            >

              <span className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                <Icon className="h-5 w-5" />
              </span>

              <h3 className="text-sm font-bold text-slate-900">
                {title}
              </h3>

              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                {copy}
              </p>

            </div>

          ))}

        </section>

        {/* Customer Reviews Section */}
        <CustomerReviews />

        {/* Action Banner */}
        <section className="flex flex-col gap-6 rounded-2xl border border-slate-800 bg-slate-900 p-6 text-white shadow-md sm:p-8 md:flex-row md:items-center md:justify-between">

          <div>

            <div className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
              <ShieldCheck className="h-4 w-4" />
              <span>Track Your Requests</span>
            </div>

            <h2 className="text-xl font-bold text-white sm:text-2xl">
              Already scheduled a pickup?
            </h2>

            <p className="mt-1 max-w-xl text-xs text-slate-300 sm:text-sm">
              Check live status updates, assigned agent details,
              receipts, and request history.
            </p>

          </div>

          <Link
            href="/customer/orders"
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 text-xs font-bold text-slate-950 transition-colors hover:bg-emerald-400"
          >
            <span>My Pickups</span>
            <ArrowRight className="h-4 w-4" />
          </Link>

        </section>

      </main>
    </div>
  );
}