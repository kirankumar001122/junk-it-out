'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Star, CheckCircle2, MessageSquareQuote, ArrowRight, ShieldCheck } from 'lucide-react';

interface ReviewItem {
  id: string;
  rating: number;
  comment?: string;
  createdAt: string;
  customer?: {
    user?: {
      name?: string;
    };
  };
}

export default function CustomerReviews() {
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/reviews?public=true')
      .then((r) => r.json())
      .then((d) => {
        if (d.success && Array.isArray(d.data)) {
          setReviews(d.data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="h-48 w-full animate-pulse rounded-3xl bg-slate-100 border border-slate-200" />
      </section>
    );
  }

  const avgRating =
    reviews.length > 0
      ? (reviews.reduce((acc, r) => acc + (r.rating || 5), 0) / reviews.length).toFixed(1)
      : null;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-6 sm:space-y-8">
      {/* HEADER */}
      <div className="text-center max-w-2xl mx-auto space-y-3">
        <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
          <ShieldCheck className="w-3.5 h-3.5" />
          Verified Customer Reviews
        </span>
        <h2 className="text-2xl sm:text-3xl font-black text-slate-950 tracking-tight">
          Real Feedback from Bengaluru Homes
        </h2>
        <p className="text-xs sm:text-sm text-slate-600 font-medium">
          Ratings and feedback collected directly from completed doorstep waste pickups in Bengaluru.
        </p>
      </div>

      {/* REVIEWS GRID OR EMPTY STATE */}
      {reviews.length > 0 ? (
        <div className="space-y-6">
          {/* STATS BADGE */}
          <div className="flex items-center justify-center gap-2 bg-emerald-50 border border-emerald-200 py-2.5 px-4 rounded-2xl w-fit mx-auto text-xs font-bold text-emerald-900">
            <span className="flex items-center gap-1 text-amber-500 font-black text-sm">
              <Star className="w-4 h-4 fill-current text-amber-400" />
              {avgRating}
            </span>
            <span>• Based on {reviews.length} verified completed {reviews.length === 1 ? 'pickup' : 'pickups'}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {reviews.map((rev) => {
              const name = rev.customer?.user?.name || 'Verified Customer';
              return (
                <div
                  key={rev.id}
                  className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-sm space-y-3 flex flex-col justify-between hover:shadow-md transition-shadow"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-1 text-amber-400">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`w-4 h-4 ${star <= rev.rating ? 'fill-current text-amber-400' : 'text-slate-200'}`}
                        />
                      ))}
                    </div>
                    {rev.comment ? (
                      <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-medium">
                        "{rev.comment}"
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400 italic">No written comment provided.</p>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="font-extrabold text-slate-900">{name}</span>
                    </div>
                    <span className="text-slate-400 font-mono text-[10px]">
                      {new Date(rev.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm text-center max-w-xl mx-auto space-y-4">
          <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-2xl grid place-items-center mx-auto">
            <MessageSquareQuote className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h3 className="font-extrabold text-slate-950 text-base">Verified Customer Reviews</h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-md mx-auto">
              Reviews are collected directly from verified customers upon completing a doorstep waste pickup. As new pickups are completed, genuine customer ratings and comments will appear here.
            </p>
          </div>
          <div className="pt-2">
            <Link
              href="/book?cart=1"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-950 text-white font-bold text-xs hover:bg-emerald-700 transition-colors shadow-sm"
            >
              Book a Doorstep Pickup <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}

