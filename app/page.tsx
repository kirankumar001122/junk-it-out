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
import { addToPickupCart, readPickupCart, updatePickupCartQuantity, removeFromPickupCart, pickupCartEvent, PickupCartItem } from '@/lib/pickupCart';
import CustomerReviews from '@/components/CustomerReviews';

const categoryIcons = [FileText, Package, Recycle, Box, Cpu, Wine, Sofa, Sparkles];

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

  const featured = useMemo(() => categories.slice(0, 10), [categories]);

  const addCategory = (category: any) => {
    addToPickupCart(category.id);
    setNotice(`${category.name} added to your Pickup Cart (1 kg)`);
    window.setTimeout(() => setNotice(''), 2200);
  };

  return (
    <div className="min-h-screen bg-slate-50/60 pb-20">
      {/* Toast Notification */}
      {notice && (
        <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-xl flex items-center gap-2 animate-fade-in-up border border-slate-800">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-slate-900 border-b border-slate-800">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(16,185,129,0.15),rgba(255,255,255,0))]" />
        
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-14 sm:px-6 md:grid-cols-[1.1fr_.9fr] md:py-24 items-center">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400">
              <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
              <span>Doorstep Pickup Across Bengaluru</span>
            </div>
            
            <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl leading-[1.1]">
              Turn scrap & waste <br className="hidden sm:inline" />
              <span className="text-emerald-400">into instant value.</span>
            </h1>
            
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-300 sm:text-base">
              Select items, schedule doorstep pickup in Bengaluru, and track your request live from collection to settlement.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/book?cart=1"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 text-sm font-bold text-slate-950 transition-all hover:bg-emerald-400 active:scale-95 shadow-lg shadow-emerald-500/20"
              >
                <ShoppingBasket className="h-4.5 w-4.5" />
                <span>Book a Pickup</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
              
              <a
                href="#categories"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/60 px-6 text-sm font-semibold text-slate-200 hover:bg-slate-800 hover:border-slate-600 transition-all"
              >
                Explore Categories
              </a>
            </div>

            <div className="mt-10 grid grid-cols-3 gap-3 pt-6 border-t border-slate-800/80 text-xs">
              <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3 text-slate-300">
                <Clock3 className="mb-1.5 h-4 w-4 text-emerald-400" />
                <strong className="block text-white font-semibold">Fast Scheduling</strong>
                <span className="text-[11px] text-slate-400">ASAP or chosen slots</span>
              </div>
              
              <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3 text-slate-300">
                <BadgeIndianRupee className="mb-1.5 h-4 w-4 text-emerald-400" />
                <strong className="block text-white font-semibold">Upfront Rates</strong>
                <span className="text-[11px] text-slate-400">Fair value per kg</span>
              </div>
              
              <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3 text-slate-300">
                <Recycle className="mb-1.5 h-4 w-4 text-emerald-400" />
                <strong className="block text-white font-semibold">Responsible</strong>
                <span className="text-[11px] text-slate-400">Eco-friendly processing</span>
              </div>
            </div>
          </div>

          {/* Clean Interactive Process Preview */}
          <div className="relative hidden md:flex items-center justify-center">
            <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl relative overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Simple 3-Step Pickup</span>
                </div>
                <Truck className="h-5 w-5 text-emerald-400" />
              </div>

              <div className="mt-5 space-y-3">
                <div className="flex items-center gap-3.5 rounded-xl border border-slate-800/80 bg-slate-900/80 p-3.5 text-xs text-slate-200">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 font-bold text-xs border border-emerald-500/20">1</span>
                  <span className="font-semibold text-slate-200">Add recyclables to Pickup Cart</span>
                </div>

                <div className="flex items-center gap-3.5 rounded-xl border border-slate-800/80 bg-slate-900/80 p-3.5 text-xs text-slate-200">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 font-bold text-xs border border-emerald-500/20">2</span>
                  <span className="font-semibold text-slate-200">Set doorstep location & time</span>
                </div>

                <div className="flex items-center gap-3.5 rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-3.5 text-xs text-white">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-slate-950 font-bold text-xs">3</span>
                  <span className="font-bold text-emerald-300">Track assigned agent live</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl space-y-12 px-4 py-12 sm:px-6">
        
        {/* Waste Categories Horizontal Slider / Grid */}
        <section id="categories" className="scroll-mt-20">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Accepted Materials</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Add waste items to your cart
              </h2>
            </div>
            <Link href="/categories" className="shrink-0 text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1">
              <span>View all</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="flex snap-x gap-3 overflow-x-auto pb-4 pt-1 [scrollbar-width:none]">
            {loading
              ? Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="h-44 w-36 shrink-0 animate-pulse rounded-2xl bg-slate-200" />
                ))
              : featured.map((category, index) => {
                  const IconComp = categoryIcons[index % categoryIcons.length];
                  const cartItem = cartItems.find((i) => i.categoryId === category.id);
                  const quantity = cartItem ? cartItem.quantity : 0;

                  return (
                    <article
                      key={category.id}
                      className="w-36 shrink-0 snap-start rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-sm transition-all hover:border-emerald-400 hover:shadow-md sm:w-44 flex flex-col justify-between"
                    >
                      <Link href={`/book?category=${encodeURIComponent(category.id)}`} className="block">
                        <div className="grid h-16 place-items-center rounded-lg bg-emerald-50/80 text-emerald-700 mb-3">
                          <IconComp className="h-7 w-7 text-emerald-600" />
                        </div>
                        <h3 className="line-clamp-2 min-h-9 text-xs font-bold leading-tight text-slate-900">
                          {category.name}
                        </h3>
                        <p className="mt-1 text-xs font-extrabold text-emerald-700">
                          ₹{category.pricePerKg} <span className="text-[10px] font-normal text-slate-500">/ kg</span>
                        </p>
                      </Link>

                      {quantity === 0 ? (
                        <button
                          onClick={() => addCategory(category)}
                          className="mt-3 inline-flex w-full items-center justify-center gap-1 rounded-lg bg-slate-900 py-1.5 text-xs font-bold text-white transition-colors hover:bg-emerald-600 active:scale-95 cursor-pointer"
                        >
                          <Plus className="h-3.5 w-3.5" /> ADD
                        </button>
                      ) : (
                        <div className="mt-3 flex items-center justify-between rounded-lg border border-emerald-300 bg-emerald-50/80 px-1 py-0.5">
                          <button
                            onClick={() => {
                              if (quantity <= 1) {
                                removeFromPickupCart(category.id);
                              } else {
                                updatePickupCartQuantity(category.id, quantity - 1);
                              }
                            }}
                            className="grid h-6 w-6 place-items-center rounded-md bg-white text-slate-700 shadow-xs hover:bg-slate-100 transition-colors cursor-pointer"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="text-xs font-extrabold text-emerald-950 px-1">{quantity} kg</span>
                          <button
                            onClick={() => updatePickupCartQuantity(category.id, quantity + 1)}
                            className="grid h-6 w-6 place-items-center rounded-md bg-emerald-600 text-white shadow-xs hover:bg-emerald-700 transition-colors cursor-pointer"
                            aria-label="Increase quantity"
                          >
                            <Plus className="h-3 w-3" />
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
            <div key={title} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700 mb-3">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="font-bold text-slate-900 text-sm">{title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">{copy}</p>
            </div>
          ))}
        </section>

        {/* Customer Reviews Section */}
        <CustomerReviews />

        {/* Action Banner */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 sm:p-8 text-white flex flex-col md:flex-row md:items-center md:justify-between gap-6 shadow-md">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 mb-2">
              <ShieldCheck className="h-4 w-4" />
              <span>Track Your Requests</span>
            </div>
            <h2 className="text-xl font-bold text-white sm:text-2xl">Already scheduled a pickup?</h2>
            <p className="mt-1 text-xs sm:text-sm text-slate-300 max-w-xl">
              Check live status updates, assigned agent details, receipts, and request history.
            </p>
          </div>
          
          <Link
            href="/customer/orders"
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 text-xs font-bold text-slate-950 hover:bg-emerald-400 transition-colors"
          >
            <span>My Pickups</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </section>

      </main>
    </div>
  );
}
