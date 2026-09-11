import Link from 'next/link';
import { ShieldCheck, Lock, Eye, Database, Server, UserCheck, ArrowRight, Share2, Clock, Trash2 } from 'lucide-react';

export const metadata = {
  title: 'Privacy Policy — Junk It Out Doorstep Waste Pickup',
  description: 'Learn how Junk It Out collects, uses, retains, and safeguards customer phone numbers, pickup locations, waste photos, and payment information in Bengaluru.',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8 sm:space-y-10 break-words">
      {/* HEADER */}
      <div className="space-y-3 text-center sm:text-left border-b border-slate-200 pb-8">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
          <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" />
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
      <div className="space-y-6 sm:space-y-8 text-sm text-slate-700 leading-relaxed">
        {/* Section 1 */}
        <section className="space-y-3 bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-sm">
          <h2 className="text-base sm:text-lg font-black text-slate-950 flex items-center gap-2">
            <span className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-800 text-xs flex items-center justify-center font-bold flex-shrink-0">1</span>
            Information We Collect
          </h2>
          <p className="text-xs sm:text-sm">
            To provide doorstep scrap pickups and waste logistics in Bengaluru, Junk It Out collects the following categories of information:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-slate-600 font-medium">
            <li><strong>Mobile Phone Number & Name:</strong> Collected during Mobile OTP login to verify your account identity and communicate booking details.</li>
            <li><strong>Location & Address Details:</strong> GPS coordinates, house/flat number, street name, pincode, and pickup instructions to dispatch local pickup agents.</li>
            <li><strong>Booking & Waste Information:</strong> Selected waste categories, estimated weight, scale proof photos, and order transaction history.</li>
            <li><strong>Session & Technical Data:</strong> Encrypted authentication tokens (<code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800 font-mono text-xs">jio_token</code>), device IP address, and browser session headers for security auditing.</li>
          </ul>
        </section>

        {/* Section 2 */}
        <section className="space-y-3 bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-sm">
          <h2 className="text-base sm:text-lg font-black text-slate-950 flex items-center gap-2">
            <span className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-800 text-xs flex items-center justify-center font-bold flex-shrink-0">2</span>
            How We Use Your Information
          </h2>
          <p className="text-xs sm:text-sm">
            Your information is used strictly to fulfill doorstep waste pickups and maintain service quality:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-slate-600 font-medium">
            <li>Validating geofence coverage and calculating estimated pickup times.</li>
            <li>Enabling assigned pickup agents to navigate to your doorstep and contact you via phone call.</li>
            <li>Computing verified scrap valuations and processing payments/payouts.</li>
            <li>Sending SMS pickup status updates and OTP verification alerts.</li>
          </ul>
        </section>

        {/* Section 3 */}
        <section className="space-y-4 bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-sm">
          <h2 className="text-base sm:text-lg font-black text-slate-950 flex items-center gap-2">
            <span className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-800 text-xs flex items-center justify-center font-bold flex-shrink-0">3</span>
            Data Sharing & Third-Party Service Providers
          </h2>
          <p className="text-xs sm:text-sm">
            We do not sell customer personal data. We share relevant data only with authorized infrastructure and service providers necessary to operate our doorstep pickup services:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs sm:text-sm space-y-1">
              <span className="font-extrabold text-slate-900 block flex items-center gap-1.5">
                🗺️ Google Maps Platform
              </span>
              <span className="text-slate-600 font-medium block">
                Used for address autocomplete, reverse geocoding, distance calculation, and pickup geofencing boundaries.
              </span>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs sm:text-sm space-y-1">
              <span className="font-extrabold text-slate-900 block flex items-center gap-1.5">
                💳 Razorpay Payment Gateway
              </span>
              <span className="text-slate-600 font-medium block">
                Processes customer payments and scrap payouts over PCI-DSS compliant secure payment infrastructure.
              </span>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs sm:text-sm space-y-1">
              <span className="font-extrabold text-slate-900 block flex items-center gap-1.5">
                📱 Fast2SMS Gateway
              </span>
              <span className="text-slate-600 font-medium block">
                Delivers one-time password (OTP) verification SMS codes and transactional status updates to your mobile number.
              </span>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs sm:text-sm space-y-1">
              <span className="font-extrabold text-slate-900 block flex items-center gap-1.5">
                ☁️ Vercel & Vercel Blob Storage
              </span>
              <span className="text-slate-600 font-medium block">
                Cloud application hosting infrastructure and secure media storage for waste photo proof and scale verification images.
              </span>
            </div>
          </div>
        </section>

        {/* Section 4 */}
        <section className="space-y-3 bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-sm">
          <h2 className="text-base sm:text-lg font-black text-slate-950 flex items-center gap-2">
            <span className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-800 text-xs flex items-center justify-center font-bold flex-shrink-0">4</span>
            Data Retention Policy
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed">
            Customer personal data, address records, and booking transaction logs are retained only for as long as reasonably necessary to fulfill doorstep pickup operations, resolve customer support or transaction inquiries, maintain system security audit logs, and comply with applicable legal, tax, and accounting requirements.
          </p>
          <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed">
            When customer data is no longer required for active operational or compliance purposes, it is deleted or permanently anonymized. Specific statutory retention periods for financial and accounting transaction logs remain subject to business and legal confirmation under applicable law.
          </p>
        </section>

        {/* Section 5 */}
        <section className="space-y-3 bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-sm">
          <h2 className="text-base sm:text-lg font-black text-slate-950 flex items-center gap-2">
            <span className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-800 text-xs flex items-center justify-center font-bold flex-shrink-0">5</span>
            Data Security Measures
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed">
            All data transmissions are protected using HTTPS / TLS 1.3 encryption. Authentication session tokens (<code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800 font-mono text-xs">jio_token</code>) are issued as HTTP-Only, SameSite cookies to safeguard against cross-site scripting and unauthorized access. Access to customer account data is restricted strictly to authorized operational roles.
          </p>
        </section>

        {/* Section 6 */}
        <section className="space-y-3 bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-sm">
          <h2 className="text-base sm:text-lg font-black text-slate-950 flex items-center gap-2">
            <span className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-800 text-xs flex items-center justify-center font-bold flex-shrink-0">6</span>
            Your Rights & Account Deletion Requests
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed">
            You have the right to inspect, update, or request the deletion of your personal account details and saved addresses at any time.
          </p>
          <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed">
            To submit a data access or complete account deletion request, please contact our privacy support team by email at{' '}
            <a href="mailto:info@junkitout.in" className="text-emerald-700 font-bold underline break-all hover:text-emerald-800">
              info@junkitout.in
            </a>. Upon receipt of your request, we will process the deletion of your personal profile and address data, except where retention is mandated by law for financial audit or dispute resolution records.
          </p>
        </section>
      </div>

      {/* FOOTER NAV */}
      <div className="pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs sm:text-sm font-bold text-slate-600">
        <Link href="/terms" className="hover:text-emerald-700 transition-colors">Read Terms & Conditions →</Link>
        <Link href="/faq" className="hover:text-emerald-700 transition-colors">Frequently Asked Questions →</Link>
      </div>
    </div>
  );
}

