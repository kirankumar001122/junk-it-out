import Link from 'next/link';
import { FileText, ShieldCheck, Scale, Banknote, RefreshCw, AlertTriangle, ArrowRight } from 'lucide-react';

export const metadata = {
  title: 'Terms & Conditions — Junk It Out Doorstep Waste Pickup',
  description: 'Official Terms & Conditions governing Junk It Out doorstep scrap pickup, weighing, Razorpay payments, customer payouts, and cancellation policies in Bengaluru.',
};

export default function TermsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-10">
      {/* HEADER */}
      <div className="space-y-3 text-center sm:text-left border-b border-slate-200 pb-8">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
          <FileText className="w-3.5 h-3.5" />
          Legal Agreement
        </span>
        <h1 className="text-3xl sm:text-4xl font-black text-slate-950 tracking-tight">
          Terms & Conditions
        </h1>
        <p className="text-xs text-slate-500 font-semibold">
          Last updated: September 11, 2026 • Junk It Out Technologies Pvt. Ltd.
        </p>
      </div>

      {/* CONTENT SECTIONS */}
      <div className="space-y-8 text-sm text-slate-700 leading-relaxed">
        {/* Section 1 */}
        <section className="space-y-3 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-black text-slate-950 flex items-center gap-2">
            <span className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-800 text-xs flex items-center justify-center font-bold">1</span>
            Service Overview & Account Registration
          </h2>
          <p>
            Junk It Out provides an on-demand doorstep waste pickup, scrap collection, and recycling platform across approved service boundaries in Bengaluru.
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-600 font-medium">
            <li>Customer access is authenticated via verified Mobile Phone One-Time Password (OTP). You are responsible for maintaining confidentiality of your device and login session.</li>
            <li>Doorstep pickups are scheduled either as <strong>ASAP (20–30 Minutes ETA)</strong> or scheduled 1-hour time slots based on agent availability.</li>
          </ul>
        </section>

        {/* Section 2 */}
        <section className="space-y-3 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-black text-slate-950 flex items-center gap-2">
            <span className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-800 text-xs flex items-center justify-center font-bold">2</span>
            Doorstep Weighing & Final Valuation
          </h2>
          <p>
            All rates listed in the official Junk It Out Price List are per-kilogram estimates.
          </p>
          <ul className="list-disc pl-5 space-y-2 text-xs text-slate-600 font-medium">
            <li>
              <strong>Digital Scale Measurement:</strong> Upon arrival, our assigned agent conducts physical weighing using calibrated digital scales in the presence of the customer.
            </li>
            <li>
              <strong>Final Amount Calculation:</strong> The final payable amount is computed automatically by the application based on the actual verified weight recorded during pickup.
            </li>
            <li>
              <strong>Contamination & Sorting:</strong> Heavily contaminated, unwashed, wet, or hazardous waste may be re-categorized or rejected at the agent’s discretion.
            </li>
          </ul>
        </section>

        {/* Section 3 */}
        <section className="space-y-3 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-black text-slate-950 flex items-center gap-2">
            <span className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-800 text-xs flex items-center justify-center font-bold">3</span>
            Financial Direction & Payment Terms
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 space-y-2">
              <h3 className="font-extrabold text-xs text-emerald-950 uppercase tracking-wider flex items-center gap-1.5">
                <Banknote className="w-4 h-4 text-emerald-600" />
                Case A: Junk It Out Pays Customer (Scrap Payout)
              </h3>
              <p className="text-xs text-emerald-900 leading-relaxed">
                When recyclable value exceeds any applicable doorstep service fee (`JUNKITOUT_PAYS`), Junk It Out transfers the net scrap payout directly to the customer’s UPI ID/bank account upon completion.
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
              <h3 className="font-extrabold text-xs text-slate-950 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-slate-600" />
                Case B: Customer Pays Service Charge (Razorpay)
              </h3>
              <p className="text-xs text-slate-700 leading-relaxed">
                For heavy bulky debris, un-recyclable junk removal, or orders where service fee exceeds scrap value (`CUSTOMER_PAYS`), the customer completes payment securely via the Razorpay Checkout gateway.
              </p>
            </div>
          </div>
        </section>

        {/* Section 4 */}
        <section className="space-y-3 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-black text-slate-950 flex items-center gap-2">
            <span className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-800 text-xs flex items-center justify-center font-bold">4</span>
            Cancellations, Delays & Dispute Resolution
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-xs text-slate-600 font-medium">
            <li>
              <strong>Cancellations:</strong> Customers may cancel a booking free of charge prior to agent arrival at the location.
            </li>
            <li>
              <strong>Unavoidable Delays:</strong> Pickup ETAs (20–30 mins) are targets based on traffic conditions in Bengaluru. Unexpected rain, heavy traffic, or road closures may occasionally cause delays.
            </li>
            <li>
              <strong>Weight Disputes:</strong> If you dispute a recorded weight, you may request instant re-weighing on the spot before signing off or submit a formal dispute via the Customer Support section.
            </li>
          </ul>
        </section>

        {/* Section 5 */}
        <section className="space-y-3 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-black text-slate-950 flex items-center gap-2">
            <span className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-800 text-xs flex items-center justify-center font-bold">5</span>
            Prohibited Waste & Limitation of Liability
          </h2>
          <p className="text-xs text-slate-600">
            Junk It Out strictly prohibits biomedical waste, explosive materials, illegal contraband, chemical hazards, and toxic bio-fluids. We reserve the right to decline service for non-compliant waste.
          </p>
        </section>
      </div>

      {/* FOOTER NAV */}
      <div className="pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-bold text-slate-600">
        <Link href="/privacy-policy" className="hover:text-emerald-700">Read Privacy Policy →</Link>
        <Link href="/faq" className="hover:text-emerald-700">Frequently Asked Questions →</Link>
      </div>
    </div>
  );
}
