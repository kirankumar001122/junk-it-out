'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Calendar, Truck, Clock, Scale, CheckCircle2, ArrowRight } from 'lucide-react';

export default function HowItWorksAnimated() {
  const [activeStep, setActiveStep] = useState(0);
  const sectionRef = useRef<HTMLDivElement>(null);

  const steps = [
    {
      num: '01',
      title: 'BOOK',
      subtitle: 'Schedule Pickup',
      desc: 'Select your South Bengaluru locality & waste types in under 10 seconds.',
      icon: Calendar,
      badge: 'FAST BOOKING',
    },
    {
      num: '02',
      title: 'AGENT',
      subtitle: 'Instant Dispatch',
      desc: 'Our system assigns the nearest verified Junk It Out agent fleet auto/van.',
      icon: Truck,
      badge: 'AUTO MATCH',
    },
    {
      num: '03',
      title: 'ARRIVAL',
      subtitle: '20-30 Min Doorstep',
      desc: 'Live GPS tracking as our agent arrives right at your doorstep on time.',
      icon: Clock,
      badge: 'STRICT SLA',
    },
    {
      num: '04',
      title: 'WEIGH',
      subtitle: 'Digital Scale Check',
      desc: 'Transparent doorstep weighing with live scale photo verification & receipt.',
      icon: Scale,
      badge: '100% ACCURATE',
    },
    {
      num: '05',
      title: 'COMPLETE',
      subtitle: 'Instant Cash / UPI',
      desc: 'Receive your top per-kg payout directly to your UPI or cash instantly.',
      icon: CheckCircle2,
      badge: 'WE PAY YOU',
    },
  ];

  useEffect(() => {
    const handleScroll = () => {
      if (!sectionRef.current) return;
      const rect = sectionRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      
      // Calculate how far into the section the user has scrolled (0 to 1)
      const progress = Math.min(Math.max((windowHeight * 0.7 - rect.top) / rect.height, 0), 1);
      const stepIndex = Math.min(Math.floor(progress * steps.length), steps.length - 1);
      setActiveStep(stepIndex);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Initial check
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <section ref={sectionRef} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto space-y-3">
        <span className="text-xs font-extrabold text-emerald-700 uppercase tracking-widest bg-emerald-50 px-4 py-1.5 rounded-full border border-emerald-200">
          Seamless 5-Step Process
        </span>
        <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
          How Junk It Out Works
        </h2>
        <p className="text-sm text-slate-600 font-normal">
          From doorstep booking to instant cash payout in 5 simple, transparent steps.
        </p>
      </div>

      {/* Progress Line & Step Cards */}
      <div className="relative pt-4">
        {/* Horizontal Desktop Connecting Progress Line */}
        <div className="hidden lg:block absolute top-20 left-[10%] right-[10%] h-1 bg-slate-200 rounded-full overflow-hidden z-0">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-green-600 transition-all duration-700 ease-out"
            style={{ width: `${(activeStep / (steps.length - 1)) * 100}%` }}
          />
        </div>

        {/* Steps Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 relative z-10">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            const isPassed = idx <= activeStep;
            const isCurrent = idx === activeStep;

            return (
              <div
                key={idx}
                onClick={() => setActiveStep(idx)}
                className={`p-6 rounded-3xl border transition-all duration-500 cursor-pointer flex flex-col justify-between space-y-4 hover-lift ${
                  isCurrent
                    ? 'bg-white border-emerald-500 shadow-xl ring-2 ring-emerald-500/20 translate-y-[-4px]'
                    : isPassed
                    ? 'bg-white border-emerald-200 shadow-md'
                    : 'bg-slate-50/80 border-slate-200 opacity-70'
                }`}
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-black px-2.5 py-1 rounded-full uppercase tracking-wider transition-colors ${
                        isPassed ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      STEP {step.num}
                    </span>
                    <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                      {step.badge}
                    </span>
                  </div>

                  <div
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 ${
                      isCurrent
                        ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 scale-110'
                        : isPassed
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    <Icon className="w-7 h-7" />
                  </div>

                  <div>
                    <h3 className="font-black text-slate-900 text-lg tracking-tight">{step.title}</h3>
                    <p className="text-xs font-bold text-emerald-600 mb-1">{step.subtitle}</p>
                    <p className="text-xs text-slate-600 leading-relaxed font-normal">{step.desc}</p>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between text-[11px] font-bold text-slate-400">
                  <span>{isPassed ? '✓ Active Step' : 'Upcoming'}</span>
                  {idx < steps.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-slate-300 hidden lg:block" />}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
