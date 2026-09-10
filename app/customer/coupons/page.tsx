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
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Offers & Promo Coupons</h1>
        <p className="text-xs text-slate-500">Apply promotional codes for instant discounts on doorstep pickup charges</p>
      </div>

      <div className="space-y-4">
        {coupons.map((coupon) => (
          <div key={coupon.code} className="bg-white p-5 rounded-3xl border border-emerald-200 shadow-sm space-y-3 relative overflow-hidden">
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
                className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-extrabold text-xs px-4 py-2 rounded-xl border border-emerald-300 flex items-center gap-1.5 transition-colors"
              >
                {copiedCode === coupon.code ? (
                  <>
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                    COPIED
                  </>
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
