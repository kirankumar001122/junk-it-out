'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Phone, Mail, MapPin, ShieldCheck, Award, ExternalLink } from 'lucide-react';
import LogoMark from '@/components/LogoMark';
import BrandWordmark from '@/components/BrandWordmark';

export default function Footer() {
  const pathname = usePathname();

  if (pathname.startsWith('/admin') || pathname.startsWith('/agent')) return null;

  return (
    <footer className="border-t border-emerald-900/40 bg-[#071b16] pb-8 pt-14 text-slate-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">

          {/* Brand Col */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <LogoMark className="h-9 w-9" />
              <BrandWordmark className="text-lg [&_.text-slate-950]:text-white [&_.text-emerald-600]:text-emerald-400" />
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Fast, reliable doorstep waste pickup platform across Bengaluru.
              We collect, weigh, and recycle household materials
              responsibly with transparent pricing.
            </p>

            {/* DPIIT Certificate */}
            <div className="flex items-center gap-2.5 text-xs text-slate-300 bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
              <Award className="w-4 h-4 shrink-0 text-emerald-400" />

              <div>
                <a
                  href="https://recognition-be.startupindia.gov.in/s3/download/document/RECOGNITION_CERTIFICATE/11968c82-3e09-4c6d-8edd-7a39a4bf6698.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-white transition-colors hover:text-emerald-300"
                  aria-label="Open DPIIT certificate DIPP265455"
                >
                  DIPP265455
                  <ExternalLink className="h-3 w-3 text-emerald-400" aria-hidden="true" />
                </a>
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
                <Link href="/customer/support" className="hover:text-emerald-400 transition-colors">
                  Customer Support
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
                <span>Koramangala, Bengaluru, Karnataka 560034</span>
              </div>

              <div className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>+91 7676272709 / +91 9591883174</span>
              </div>

              <div className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>support@junkitout.in</span>
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
