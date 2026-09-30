'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Phone, Mail, MapPin, ShieldCheck, Award } from 'lucide-react';

export default function Footer() {
  const pathname = usePathname();

  if (pathname.startsWith('/admin') || pathname.startsWith('/agent')) return null;

  return (
    <footer className="bg-slate-900 text-slate-300 pt-12 pb-8 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">

          {/* Brand Col */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700/80 p-0.5 flex items-center justify-center overflow-hidden shrink-0">
                <img
                  src="/logo.png"
                  alt="Junk It Out Logo"
                  className="w-full h-full object-contain p-0.5"
                />
              </div>

              <span className="text-lg font-bold tracking-tight text-white">
                JUNK IT{' '}
                <span className="text-emerald-400 font-extrabold">OUT</span>
              </span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Fast, reliable doorstep waste pickup platform across Bengaluru.
              We collect, weigh, pay for recyclables, and process scrap
              responsibly.
            </p>

            {/* DPIIT Recognition Badge */}
            <div className="flex items-center gap-2.5 text-xs text-slate-300 bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
              <Award className="w-4 h-4 shrink-0 text-emerald-400" />

              <div>
                <span className="font-semibold block text-white text-xs">
                  DPIIT Registered Startup
                </span>

                <span className="text-[10px] text-slate-400">
                  Cert No: DIPP265455 • Govt. of India
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 text-xs text-slate-400 bg-slate-800/40 p-2.5 rounded-xl border border-slate-800">
              <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />

              <span>Verified doorstep pickups across Bengaluru.</span>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-slate-200 font-bold text-xs uppercase tracking-wider mb-4">
              Quick Links
            </h3>

            <ul className="space-y-2 text-xs text-slate-400 font-medium">
              <li>
                <Link href="/book" className="hover:text-emerald-400 transition-colors">
                  Book a Pickup
                </Link>
              </li>

              <li>
                <Link href="/pricing" className="hover:text-emerald-400 transition-colors">
                  Price List / Rates
                </Link>
              </li>

              <li>
                <Link href="/categories" className="hover:text-emerald-400 transition-colors">
                  Waste Categories
                </Link>
              </li>

              <li>
                <Link href="/service-areas" className="hover:text-emerald-400 transition-colors">
                  Service Areas
                </Link>
              </li>

              <li>
                <Link href="/faq" className="hover:text-emerald-400 transition-colors">
                  FAQ
                </Link>
              </li>

              <li>
                <Link href="/about" className="hover:text-emerald-400 transition-colors">
                  About Us
                </Link>
              </li>

              <li>
                <Link href="/contact" className="hover:text-emerald-400 transition-colors">
                  Contact Us
                </Link>
              </li>

              <li>
                <Link href="/agent" className="hover:text-emerald-400 transition-colors">
                  Pickup Agent Portal
                </Link>
              </li>
            </ul>
          </div>

          {/* Bengaluru Service Zones */}
          <div>
            <h3 className="text-slate-200 font-bold text-xs uppercase tracking-wider mb-4">
              Bengaluru Service Zones
            </h3>

            <ul className="space-y-2 text-xs text-slate-400 font-medium">
              <li className="flex items-center gap-1.5">
                <span className="text-emerald-400">✓</span>
                JP Nagar
              </li>

              <li className="flex items-center gap-1.5">
                <span className="text-emerald-400">✓</span>
                BTM Layout
              </li>
            </ul>
          </div>

          {/* Contact & Support */}
          <div>
            <h3 className="text-slate-200 font-bold text-xs uppercase tracking-wider mb-4">
              Contact & Support
            </h3>

            <div className="space-y-3 text-xs text-slate-400 font-medium">
              <div className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>Munnekollala, Bengaluru, Karnataka 560037</span>
              </div>

              <div className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>+91 7676272709 / +91 9591883174</span>
              </div>

              <div className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>info@junkitout.in</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-4">
          <p>© 2026 Junk It Out Technologies Pvt. Ltd. All rights reserved.</p>

          <div className="flex items-center gap-5">
            <Link href="/privacy-policy" className="hover:text-slate-200 transition-colors">
              Privacy Policy
            </Link>

            <Link href="/terms" className="hover:text-slate-200 transition-colors">
              Terms & Conditions
            </Link>

            <Link href="/faq" className="hover:text-slate-200 transition-colors">
              FAQ
            </Link>

            <Link href="/accepted-waste" className="hover:text-slate-200 transition-colors">
              Waste Policy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
