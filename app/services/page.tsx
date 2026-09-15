'use client';

import Link from 'next/link';
import {
  Truck,
  Recycle,
  Armchair,
  Monitor,
  Building2,
  Scale,
  Clock,
  ArrowRight,
  ShieldCheck,
  Zap,
} from 'lucide-react';

export default function ServicesPage() {
  const servicesList = [
    {
      title: 'Doorstep Recyclable Scrap Collection',
      tag: 'WE PAY YOU',
      icon: Recycle,
      desc: 'Top market rates paid directly for dry plastic bottles, paper, cardboard boxes, newspaper, aluminum cans, and scrap metals.',
      features: [
        'Instant doorstep cash or UPI payout',
        'Digital scale weight verification',
        'Transparent per-kg price chart',
      ],
      cta: 'Schedule Scrap Pickup',
      color: 'border-emerald-200 bg-emerald-50/50',
    },
    {
      title: 'Bulky Junk & Furniture Removal',
      tag: 'HEAVY REMOVAL',
      icon: Armchair,
      desc: 'Full-service handling and removal of heavy old sofas, wooden beds, mattresses, steel almirahs, and bulky household waste.',
      features: [
        'Two-man heavy lifting team',
        'Staircase & elevator safe handling',
        'Eco-disposal & timber recycling',
      ],
      cta: 'Book Heavy Removal',
      color: 'border-amber-200 bg-amber-50/50',
    },
    {
      title: 'Certified E-Waste & Appliance Disposal',
      tag: 'ECO SAFE',
      icon: Monitor,
      desc: 'Safe, environmentally certified recycling for old laptops, monitors, smartphones, refrigerators, washing machines, and electronics.',
      features: [
        'Data security & disk destruction assurance',
        'Hazardous component extraction',
        'Official green recycling certificate',
      ],
      cta: 'Book E-Waste Pickup',
      color: 'border-purple-200 bg-purple-50/50',
    },
    {
      title: 'Commercial & Office Junk Solutions',
      tag: 'ENTERPRISE',
      icon: Building2,
      desc: 'Customized waste management contracts for IT parks, retail stores, cafes, construction sites, and corporate offices.',
      features: [
        'Scheduled recurring pickups',
        'GST invoicing & compliance reporting',
        'Bulk volume discounts',
      ],
      cta: 'Contact Commercial Team',
      color: 'border-blue-200 bg-blue-50/50',
    },
  ];

  return (
    <div className="w-full bg-slate-50 pb-20 space-y-16">
      {/* Services Header */}
      <section className="bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 text-white py-16 px-6 sm:px-12 text-center">
        <div className="max-w-4xl mx-auto space-y-4">
          <span className="bg-emerald-500/20 text-emerald-400 text-xs font-extrabold px-4 py-1.5 rounded-full uppercase tracking-wider border border-emerald-500/30">
            Our Services
          </span>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight">
            Complete On-Demand <br />
            <span className="text-emerald-400">Waste & Scrap Solutions</span>
          </h1>
          <p className="text-slate-300 text-base sm:text-lg max-w-2xl mx-auto font-light leading-relaxed">
            From household scrap to heavy furniture and e-waste, Junk It Out provides fast 20–30 minute doorstep pickup with transparent digital pricing.
          </p>
        </div>
      </section>

      {/* Services Grid */}
      <section className="max-w-7xl mx-auto px-6 sm:px-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {servicesList.map((srv, idx) => {
            const Icon = srv.icon;
            return (
              <div
                key={idx}
                className={`p-8 rounded-3xl border ${srv.color} shadow-sm space-y-6 flex flex-col justify-between hover:shadow-md transition-shadow`}
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-14 h-14 rounded-2xl bg-white shadow-md flex items-center justify-center text-emerald-700">
                      <Icon className="w-7 h-7" />
                    </div>
                    <span className="text-xs font-black uppercase tracking-wider bg-slate-900 text-white px-3 py-1 rounded-full">
                      {srv.tag}
                    </span>
                  </div>

                  <h3 className="text-2xl font-black text-slate-900">{srv.title}</h3>
                  <p className="text-slate-600 text-sm leading-relaxed">{srv.desc}</p>

                  <div className="space-y-2 pt-2 border-t border-slate-200/60">
                    {srv.features.map((feat, fIdx) => (
                      <div key={fIdx} className="flex items-center gap-2 text-xs font-bold text-slate-700">
                        <Zap className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-4">
                  <Link
                    href="/book"
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm py-4 rounded-2xl flex items-center justify-center gap-2 transition-transform hover:scale-[1.02]"
                  >
                    {srv.cta}
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA Box */}
      <section className="max-w-7xl mx-auto px-6 sm:px-12">
        <div className="bg-slate-900 rounded-3xl p-8 sm:p-12 text-center text-white space-y-6 shadow-xl">
          <h2 className="text-3xl font-black">Need a Custom Waste Disposal Quote?</h2>
          <p className="text-slate-300 text-sm max-w-xl mx-auto">
            Our agent fleet operates 7 days a week across  Bengaluru city. Contact us or schedule your pickup online.
          </p>
          <Link
            href="/book"
            className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-base px-8 py-4 rounded-2xl transition-transform hover:scale-105"
          >
            Book Doorstep Pickup Now
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>
    </div>
  );
}
