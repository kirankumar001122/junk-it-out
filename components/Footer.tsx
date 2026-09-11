'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Trash2, Phone, Mail, MapPin, ShieldCheck, Award } from 'lucide-react';

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
              <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700/80 p-0.5 flex items-center justify-center overflow-hidden">
                <img src="/logo.png" alt="Junk It Out Logo" className="w-full h-full object-contain drop-shadow" />
              </div>
              <span className="text-xl font-bold tracking-tight text-white">
                JUNK IT <span className="text-emerald-400">OUT</span>
              </span>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed">
              Fast, reliable 20–30 minute doorstep waste pickup platform across Bengaluru. We collect, weigh, pay you for scrap recyclables, and manage waste responsibly.
            </p>
            
            {/* DPIIT Recognition Badge */}
            <div className="flex items-center gap-2 text-xs text-emerald-300 bg-emerald-950/60 p-3 rounded-2xl border border-emerald-800/60">
              <Award className="w-4 h-4 shrink-0 text-emerald-400" />
              <div>
                <span className="font-bold block text-white">🇮🇳 DPIIT Registered Startup</span>
                <span className="text-[10px] text-slate-400">Cert No: DIPP265455 • Govt. of India</span>
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-400 bg-slate-800/50 p-2.5 rounded-xl border border-slate-800">
              <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>Operating across approved Bengaluru service boundaries.</span>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-white font-semibold text-sm mb-4 uppercase tracking-wider">Quick Links</h3>
            <ul className="space-y-2.5 text-sm">
              <li><Link href="/book" className="hover:text-emerald-400 transition-colors">Book a Pickup</Link></li>
              <li><Link href="/pricing" className="hover:text-emerald-400 transition-colors">Price List / Rates</Link></li>
              <li><Link href="/categories" className="hover:text-emerald-400 transition-colors">Waste Categories</Link></li>
              <li><Link href="/service-areas" className="hover:text-emerald-400 transition-colors">Service Areas</Link></li>
              <li><Link href="/faq" className="hover:text-emerald-400 transition-colors">FAQ</Link></li>
              <li><Link href="/about" className="hover:text-emerald-400 transition-colors">About Us</Link></li>
              <li><Link href="/contact" className="hover:text-emerald-400 transition-colors">Contact Us</Link></li>
              <li><Link href="/agent" className="hover:text-emerald-400 transition-colors">Pickup Agent Portal</Link></li>
              <li><Link href="/admin" className="hover:text-emerald-400 transition-colors">Admin Portal</Link></li>
            </ul>
          </div>

          {/* Bengaluru City Zones */}
          <div>
            <h3 className="text-white font-semibold text-sm mb-4 uppercase tracking-wider">Bengaluru City Zones</h3>
            <ul className="space-y-2 text-xs text-slate-400 grid grid-cols-2 gap-x-2">
              <li>✓ JP Nagar & Jayanagar</li>
              <li>✓ Electronic City</li>
              <li>✓ Koramangala & HSR</li>
              <li>✓ Whitefield & ITPL</li>
              <li>✓ Indiranagar</li>
              <li>✓ Yelahanka & Hebbal</li>
              <li>✓ Rajajinagar</li>
              <li>✓ Malleshwaram</li>
              <li>✓ MG Road / Central</li>
              <li>✓ BTM Layout</li>
            </ul>
          </div>

          {/* Contact & Support */}
          <div>
            <h3 className="text-white font-semibold text-sm mb-4 uppercase tracking-wider">Contact & Support</h3>
            <div className="space-y-3 text-sm text-slate-400">
              <div className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>Munnekolala, Bengaluru, Karnataka 560037</span>
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
        <div className="pt-8 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between text-xs text-slate-500 gap-4">
          <p>© 2026 Junk It Out Technologies Pvt. Ltd. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <Link href="/privacy-policy" className="hover:text-slate-300">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-slate-300">Terms & Conditions</Link>
            <Link href="/faq" className="hover:text-slate-300">FAQ</Link>
            <Link href="/accepted-waste" className="hover:text-slate-300">Waste Policy</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
