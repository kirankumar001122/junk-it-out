'use client';

import Link from 'next/link';
import { Leaf, ShieldCheck, Clock, Recycle, Award, Users, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function AboutPage() {
  return (
    <div className="w-full bg-slate-50/60 pb-16 space-y-12">
      {/* Header Banner */}
      <section className="bg-slate-900 text-white py-14 px-6 sm:px-12 text-center border-b border-slate-800">
        <div className="max-w-3xl mx-auto space-y-3">
          <span className="bg-emerald-500/10 text-emerald-400 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider border border-emerald-500/20">
            About Junk It Out
          </span>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white leading-tight">
            Pioneering Smart, Eco-Friendly <br className="hidden sm:inline" />
            <span className="text-emerald-400">Doorstep Recycling in Bengaluru</span>
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm max-w-xl mx-auto font-normal leading-relaxed">
            We build modern on-demand infrastructure to eliminate urban junk, reduce landfill contamination, and pay citizens fair value for scrap recyclables.
          </p>
        </div>
      </section>

      {/* Our Mission & Vision */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
          <div className="space-y-4">
            <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200/80">
              Our Mission
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              Transforming Doorstep Recycling
            </h2>
            <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
              Junk It Out was founded with a single mission: to create a seamless, transparent, and fast doorstep pickup service for household and commercial scrap in Bengaluru.
            </p>
            <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
              By leveraging digital weighing scales, live tracking, and direct recycling plant partnerships, we ensure fast pickup ETAs while maximizing responsible material reuse.
            </p>

            <div className="space-y-2.5 pt-2">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-semibold text-slate-800 text-xs sm:text-sm">Zero Landfill Goal for All Dry Recyclables</span>
              </div>
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-semibold text-slate-800 text-xs sm:text-sm">Transparent Digital Weighing & Upfront Payouts</span>
              </div>
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-semibold text-slate-800 text-xs sm:text-sm">Verified, Background-Checked Field Pickup Fleet</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-md space-y-5 border border-slate-800">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
              <Recycle className="w-5 h-5" />
            </div>
            <h3 className="text-xl font-bold">Sustainability Metrics</h3>
            <div className="grid grid-cols-2 gap-4 pt-1">
              <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/60">
                <span className="text-2xl font-extrabold text-emerald-400 block">500+</span>
                <span className="text-[11px] text-slate-300 font-medium">Tons Recycled</span>
              </div>
              <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/60">
                <span className="text-2xl font-extrabold text-emerald-400 block">12,500+</span>
                <span className="text-[11px] text-slate-300 font-medium">Completed Pickups</span>
              </div>
              <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/60">
                <span className="text-2xl font-extrabold text-emerald-400 block">20–30m</span>
                <span className="text-[11px] text-slate-300 font-medium">Average Response</span>
              </div>
              <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/60">
                <span className="text-2xl font-extrabold text-emerald-400 block">100%</span>
                <span className="text-[11px] text-slate-300 font-medium">Certified Processing</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Box */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="bg-slate-900 rounded-2xl p-6 sm:p-8 text-center text-white space-y-4 shadow-md border border-slate-800">
          <h2 className="text-xl font-bold sm:text-2xl">Ready to Clear Household Scrap & Waste?</h2>
          <p className="text-slate-300 text-xs sm:text-sm max-w-lg mx-auto">
            Book a doorstep pickup in Bengaluru and experience fast, eco-friendly scrap collection.
          </p>
          <div className="pt-1">
            <Link
              href="/book"
              className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs px-6 py-3 rounded-xl transition-all active:scale-95"
            >
              <span>Book a Pickup Now</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
