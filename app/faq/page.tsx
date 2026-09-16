import Link from 'next/link';
import { HelpCircle, ChevronDown, ArrowRight, Phone, MessageSquare, ShieldCheck, Scale, Banknote } from 'lucide-react';

export const metadata = {
  title: 'Frequently Asked Questions (FAQ) — Junk It Out Doorstep Scrap Pickup',
  description: 'Answers to common questions about Junk It Out doorstep waste pickup in Bengaluru, scrap pricing, digital scale weighing, Razorpay payments, payouts, and service areas.',
};

const FAQ_ITEMS = [
  {
    q: 'How does Junk It Out doorstep pickup work?',
    a: 'Simply select your location in Bengaluru, pick your waste categories (paper, plastic, metal, e-waste, furniture, etc.), add photos if available, and submit your booking. A verified agent arrives in 20–30 minutes or at your scheduled slot, weighs items on a digital scale, and calculates your instant net amount.',
  },
  {
    q: 'How are waste prices calculated? Are rates guaranteed?',
    a: 'Rates are calculated per-kilogram based on the official Junk It Out live database price list. Prices are transparently applied at doorstep weighing. You can check current live rates anytime on our Price List page.',
  },
  {
    q: 'How does doorstep weighing work?',
    a: 'Our agent brings a calibrated portable digital scale to your doorstep. Each waste category is weighed separately in front of you, and actual weights are logged directly into the agent app to compute the final receipt.',
  },
  {
    q: 'What is the difference between "We Pay You" and "Customer Pays"?',
    a: 'For high-value recyclable scrap like paper, plastic, metals, and e-waste (`JUNKITOUT_PAYS`), we pay you instant cash/UPI. For bulky non-recyclable debris or heavy furniture clearance (`CUSTOMER_PAYS`), a doorstep service fee applies.',
  },
  {
    q: 'How do customer payments work via Razorpay?',
    a: 'When an order requires a customer service charge (`CUSTOMER_PAYS`), payment is completed securely through the integrated Razorpay Standard Checkout popup using UPI, Debit/Credit Cards, or Netbanking.',
  },
  {
    q: 'When and how do I receive money for my recyclables?',
    a: 'Once doorstep weighing is complete for recyclable scrap (`JUNKITOUT_PAYS`), the agent verifies the total and your payout is transferred directly to your UPI ID or bank account immediately.',
  },
  {
    q: 'Can I cancel or reschedule my pickup?',
    a: 'Yes! You can cancel or modify your pickup free of charge before the agent arrives at your doorstep through the "My Pickups" section on our website.',
  },
  {
    q: 'What service areas does Junk It Out cover in Bengaluru?',
    a: 'We cover major Bengaluru zones including JP Nagar, Jayanagar, Electronic City, Koramangala, HSR Layout, Whitefield, Indiranagar, Yelahanka, Hebbal, Rajajinagar, Malleshwaram, and MG Road.',
  },
  {
    q: 'What waste materials are NOT accepted?',
    a: 'We do NOT accept hazardous chemicals, biomedical waste, explosives, radioactive substances, wet kitchen food waste, or illegal contraband.',
  },
  {
    q: 'What if I disagree with the weight or rate recorded during pickup?',
    a: 'You can request the agent to re-weigh the item immediately on the spot. If unresolved, you can raise a dispute via Customer Support in your profile dashboard for instant investigation.',
  },
];

export default function FAQPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-8 min-h-[85vh]">
      {/* HEADER */}
      <div className="text-center max-w-2xl mx-auto space-y-2">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200/80">
          <HelpCircle className="w-3.5 h-3.5" />
          Help & Support Center
        </span>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
          Frequently Asked Questions
        </h1>
        <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
          Everything you need to know about doorstep waste pickups, scrap pricing, weighing, and instant payouts in Bengaluru.
        </p>
      </div>

      {/* FAQ LIST */}
      <div className="space-y-3">
        {FAQ_ITEMS.map((item, idx) => (
          <details
            key={idx}
            className="group bg-white rounded-xl p-4 sm:p-5 border border-slate-200/90 shadow-sm transition-all open:border-emerald-300 open:shadow-md"
          >
            <summary className="flex items-center justify-between font-bold text-xs sm:text-sm text-slate-900 cursor-pointer list-none select-none">
              <span>{item.q}</span>
              <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 group-open:bg-emerald-50 group-open:text-emerald-700 flex items-center justify-center shrink-0 transition-transform group-open:rotate-180">
                <ChevronDown className="w-3.5 h-3.5" />
              </span>
            </summary>
            <p className="text-xs text-slate-600 mt-3 leading-relaxed font-normal pt-3 border-t border-slate-100">
              {item.a}
            </p>
          </details>
        ))}
      </div>

      {/* CONTACT BANNER */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 text-center space-y-3 shadow-md border border-slate-800">
        <h2 className="text-xl font-bold">Still have questions?</h2>
        <p className="text-xs text-slate-300 max-w-md mx-auto">
          Our Bengaluru customer support team is available 8:00 AM – 8:00 PM daily.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
          <Link
            href="/contact"
            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs px-5 py-2.5 rounded-xl inline-flex items-center gap-2 transition-colors"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Contact Customer Care
          </Link>
          <Link
            href="/pricing"
            className="bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl inline-flex items-center gap-2 border border-slate-700 transition-colors"
          >
            View Price List <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
