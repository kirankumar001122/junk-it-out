'use client';

import Link from 'next/link';
import { Leaf, ShieldCheck, Clock, Recycle, Award, Users, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function AboutPage() {
  return (
    <div className="w-full bg-slate-50 pb-20 space-y-16">
      {/* Header Banner */}
      <section className="bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 text-white py-16 px-6 sm:px-12 text-center">
        <div className="max-w-4xl mx-auto space-y-4">
          <span className="bg-emerald-500/20 text-emerald-400 text-xs font-extrabold px-4 py-1.5 rounded-full uppercase tracking-wider border border-emerald-500/30">
            About Junk It Out™
          </span>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight">
            Pioneering Smart, Eco-Friendly <br />
            <span className="text-emerald-400">Waste Management in Bengaluru</span>
          </h1>
          <p className="text-slate-300 text-base sm:text-lg max-w-2xl mx-auto font-light leading-relaxed">
            We build modern on-demand infrastructure to eliminate urban junk, reduce landfill contamination, and pay citizens top rates for recyclable scrap.
          </p>
        </div>
      </section>

      {/* Our Mission & Vision */}
      <section className="max-w-7xl mx-auto px-6 sm:px-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <span className="text-xs font-black text-emerald-700 uppercase tracking-widest bg-emerald-50 px-3 py-1 rounded-full">
              Our Core Mission
            </span>
            <h2 className="text-3xl font-black text-slate-900 tracking-tight">
              Transforming How Cities Handle Junk & Recycling
            </h2>
            <p className="text-slate-600 text-base leading-relaxed">
              Junk It Out was founded with a single mission: to create a seamless, transparent, and ultra-fast doorstep pickup service for household and commercial waste in Bengaluru.
            </p>
            <p className="text-slate-600 text-base leading-relaxed">
              By leveraging geofenced dispatch technology, digital weighing scales, and direct recycling plant partnerships, we guarantee 20–30 minute pickup ETAs across South Bengaluru while ensuring 100% responsible waste diversion.
            </p>

            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span className="font-bold text-slate-800 text-sm">Zero Landfill Goal for All Dry Recyclables</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span className="font-bold text-slate-800 text-sm">Transparent Digital Weighing & Instant Payouts</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span className="font-bold text-slate-800 text-sm">Verified, Background-Checked Field Fleet</span>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-tr from-emerald-800 to-green-600 rounded-3xl p-8 text-white shadow-2xl space-y-6">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-white">
              <Recycle className="w-7 h-7" />
            </div>
            <h3 className="text-2xl font-black">Eco Impact by Numbers</h3>
            <div className="grid grid-cols-2 gap-6 pt-2">
              <div className="bg-white/10 p-4 rounded-2xl border border-white/20">
                <span className="text-3xl font-black text-emerald-300 block">500+</span>
                <span className="text-xs text-slate-200 font-medium">Tons Recycled</span>
              </div>
              <div className="bg-white/10 p-4 rounded-2xl border border-white/20">
                <span className="text-3xl font-black text-emerald-300 block">12,500+</span>
                <span className="text-xs text-slate-200 font-medium">Happy Pickups</span>
              </div>
              <div className="bg-white/10 p-4 rounded-2xl border border-white/20">
                <span className="text-3xl font-black text-emerald-300 block">20-30m</span>
                <span className="text-xs text-slate-200 font-medium">Average ETA</span>
              </div>
              <div className="bg-white/10 p-4 rounded-2xl border border-white/20">
                <span className="text-3xl font-black text-emerald-300 block">100%</span>
                <span className="text-xs text-slate-200 font-medium">Certified Recycling</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Box */}
      <section className="max-w-7xl mx-auto px-6 sm:px-12">
        <div className="bg-slate-900 rounded-3xl p-8 sm:p-12 text-center text-white space-y-6 shadow-xl">
          <h2 className="text-3xl font-black">Ready to Clean Up Your Space?</h2>
          <p className="text-slate-300 text-sm max-w-xl mx-auto">
            Book your doorstep waste pickup in South Bengaluru today and join thousands of eco-conscious residents.
          </p>
          <Link
            href="/book"
            className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-base px-8 py-4 rounded-2xl transition-transform hover:scale-105"
          >
            Book a Pickup Now
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>
    </div>
  );
}
