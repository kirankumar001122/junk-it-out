import Link from 'next/link';
import { ShieldCheck, Lock, Eye, Database, Server, UserCheck, ArrowRight } from 'lucide-react';

export const metadata = {
  title: 'Privacy Policy — Junk It Out Doorstep Waste Pickup',
  description: 'Learn how Junk It Out collects, uses, and safeguards customer phone numbers, pickup locations, waste photos, and payment information in Bengaluru.',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-10">
      {/* HEADER */}
      <div className="space-y-3 text-center sm:text-left border-b border-slate-200 pb-8">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
          <ShieldCheck className="w-3.5 h-3.5" />
          Data Protection Policy
        </span>
        <h1 className="text-3xl sm:text-4xl font-black text-slate-950 tracking-tight">
          Privacy Policy
        </h1>
        <p className="text-xs text-slate-500 font-semibold">
          Last updated: September 11, 2026 • Junk It Out Technologies Pvt. Ltd.
        </p>
      </div>

      {/* SECTIONS */}
      <div className="space-y-8 text-sm text-slate-700 leading-relaxed">
        {/* Section 1 */}
        <section className="space-y-3 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-black text-slate-950 flex items-center gap-2">
            <span className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-800 text-xs flex items-center justify-center font-bold">1</span>
            Information We Collect
          </h2>
          <p>
            To provide doorstep scrap pickups and waste logistics in Bengaluru, Junk It Out collects the following categories of information:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-600 font-medium">
            <li><strong>Mobile Phone Number & Name:</strong> Collected during Mobile OTP login to verify your account identity.</li>
            <li><strong>Location & Address Details:</strong> GPS coordinates, house/flat number, street name, pincode, and pickup instructions to dispatch local pickup agents.</li>
            <li><strong>Booking & Waste Information:</strong> Selected waste categories, estimated weight, scale proof photos, and order transaction history.</li>
            <li><strong>Session & Technical Data:</strong> Encrypted authentication tokens (`jio_token`), device IP address, and browser session headers for security auditing.</li>
          </ul>
        </section>

        {/* Section 2 */}
        <section className="space-y-3 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-black text-slate-950 flex items-center gap-2">
            <span className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-800 text-xs flex items-center justify-center font-bold">2</span>
            How We Use Your Information
          </h2>
          <p>
            Your information is used strictly to fulfill doorstep waste pickups and maintain service quality:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-600 font-medium">
            <li>Validating geofence coverage and calculating 20–30 minute pickup ETAs.</li>
            <li>Enabling assigned pickup agents to navigate to your doorstep and contact you via phone call.</li>
            <li>Computing verified scrap valuations and processing payments/payouts.</li>
            <li>Sending SMS / WhatsApp pickup status notifications.</li>
          </ul>
        </section>

        {/* Section 3 */}
        <section className="space-y-3 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-black text-slate-950 flex items-center gap-2">
            <span className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-800 text-xs flex items-center justify-center font-bold">3</span>
            Third-Party Service Integrations
          </h2>
          <p>
            We partner with trusted third-party infrastructure providers to deliver our operations:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs">
              <span className="font-extrabold text-slate-900 block">🗺️ Google Maps Platform</span>
              <span className="text-slate-600 font-medium">Used for location autocomplete, reverse geocoding, and map boundaries.</span>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs">
              <span className="font-extrabold text-slate-900 block">💳 Razorpay Payment Gateway</span>
              <span className="text-slate-600 font-medium">Processes customer payments securely over PCI-DSS compliant infrastructure.</span>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs">
              <span className="font-extrabold text-slate-900 block">💬 SMS & WhatsApp Gateway</span>
              <span className="text-slate-600 font-medium">Delivers OTP verification codes and real-time pickup tracking alerts.</span>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs">
              <span className="font-extrabold text-slate-900 block">☁️ Secure Storage Infrastructure</span>
              <span className="text-slate-600 font-medium">Private media storage for waste photo proof and scale verification.</span>
            </div>
          </div>
        </section>

        {/* Section 4 */}
        <section className="space-y-3 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-black text-slate-950 flex items-center gap-2">
            <span className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-800 text-xs flex items-center justify-center font-bold">4</span>
            Data Security & Retention
          </h2>
          <p className="text-xs text-slate-600 font-medium">
            All data transmissions are encrypted using HTTPS / TLS 1.3 protocol. JWT tokens are stored in HTTP-Only, SameSite cookies to prevent unauthorized access. Personal data and order records are retained for active service operations, accounting compliance, and audit log tracking.
          </p>
        </section>

        {/* Section 5 */}
        <section className="space-y-3 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-black text-slate-950 flex items-center gap-2">
            <span className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-800 text-xs flex items-center justify-center font-bold">5</span>
            Your Rights & Deletion Requests
          </h2>
          <p className="text-xs text-slate-600 font-medium">
            You have the right to inspect, update, or request deletion of your account profile and saved addresses at any time. To request complete account deletion, please email our support team at <a href="mailto:info@junkitout.in" className="text-emerald-700 font-bold underline">info@junkitout.in</a>.
          </p>
        </section>
      </div>

      {/* FOOTER NAV */}
      <div className="pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-bold text-slate-600">
        <Link href="/terms" className="hover:text-emerald-700">Read Terms & Conditions →</Link>
        <Link href="/faq" className="hover:text-emerald-700">Frequently Asked Questions →</Link>
      </div>
    </div>
  );
}
