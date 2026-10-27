'use client';

import { useState } from 'react';
import { Ticket, CheckCircle, Copy } from 'lucide-react';

export default function CustomerCouponsPage() {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const coupons = [
    {
      code: 'WELCOME50',
      discount: '₹50 FLAT OFF',
      desc: 'Applicable on your first doorstep waste pickup in South Bengaluru.',
      minOrder: 'Min pickup order ₹100',
      expiry: 'Valid till 31 Dec 2026',
      active: true,
    },
    {
      code: 'SOUTHBLR20',
      discount: '20% OFF SERVICE FEE',
      desc: 'Special discount for JP Nagar, Jayanagar, HSR, Koramangala & Electronic City residents.',
      minOrder: 'Min pickup order ₹200',
      expiry: 'Valid till 30 Nov 2026',
      active: true,
    },
  ];

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  return (
    <div className="customer-page space-y-6">
      <div>
        <p className="customer-eyebrow">Save on your next pickup</p>
        <h1 className="customer-title mt-2">Offers & coupons</h1>
        <p className="customer-subtitle mt-2">Copy a code and apply it during booking when your pickup qualifies.</p>
      </div>

      <div className="space-y-4">
        {coupons.map((coupon) => (
          <div key={coupon.code} className="customer-surface relative space-y-3 overflow-hidden border-emerald-200 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                  <Ticket className="w-5 h-5" />
                </div>
                <div>
                  <span className="font-extrabold text-slate-900 text-sm block">{coupon.discount}</span>
                  <span className="text-xs font-mono font-bold text-emerald-700">{coupon.code}</span>
                </div>
              </div>

              <button
                onClick={() => handleCopy(coupon.code)}
                aria-label={`Copy coupon code ${coupon.code}`}
                className="customer-action flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-extrabold text-emerald-800 transition-colors hover:bg-emerald-100"
              >
                {copiedCode === coupon.code ? (
                  <span role="status" aria-live="polite" className="inline-flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                    COPIED
                  </span>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    COPY CODE
                  </>
                )}
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">{coupon.desc}</p>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium">
              <span>{coupon.minOrder}</span>
              <span>{coupon.expiry}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
