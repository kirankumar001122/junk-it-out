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
    <section className="max-w-7xl mx-auto py-6 space-y-6">
      {/* HEADER */}
      <div className="text-center max-w-2xl mx-auto space-y-2">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200/80">
          <ShieldCheck className="w-3.5 h-3.5" />
          Verified Customer Feedback
        </span>
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
          What Bengaluru Homes Say
        </h2>
        <p className="text-xs sm:text-sm text-slate-600">
          Ratings and feedback collected directly from completed doorstep waste pickups.
        </p>
      </div>

      {/* REVIEWS GRID OR EMPTY STATE */}
      {reviews.length > 0 ? (
        <div className="space-y-6">
          {/* STATS BADGE */}
          <div className="flex items-center justify-center gap-2 bg-emerald-50/80 border border-emerald-200/80 py-2 px-3.5 rounded-xl w-fit mx-auto text-xs font-semibold text-emerald-900">
            <span className="flex items-center gap-1 text-amber-500 font-bold text-xs">
              <Star className="w-3.5 h-3.5 fill-current text-amber-400" />
              {avgRating}
            </span>
            <span className="text-slate-600">• Based on {reviews.length} completed {reviews.length === 1 ? 'pickup' : 'pickups'}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {reviews.map((rev) => {
              const name = rev.customer?.user?.name || 'Verified Customer';
              return (
                <div
                  key={rev.id}
                  className="bg-white rounded-xl p-5 border border-slate-200/90 shadow-sm space-y-3 flex flex-col justify-between hover:border-slate-300 transition-all"
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-0.5 text-amber-400">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`w-3.5 h-3.5 ${star <= rev.rating ? 'fill-current text-amber-400' : 'text-slate-200'}`}
                        />
                      ))}
                    </div>
                    {rev.comment ? (
                      <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-normal">
                        "{rev.comment}"
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400 italic">No written comment provided.</p>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="font-bold text-slate-900 text-xs">{name}</span>
                    </div>
                    <span className="text-slate-400 text-[10px]">
                      {new Date(rev.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl p-6 sm:p-8 border border-slate-200 shadow-sm text-center max-w-xl mx-auto space-y-4">
          <div className="w-10 h-10 bg-emerald-50 text-emerald-700 rounded-xl grid place-items-center mx-auto">
            <MessageSquareQuote className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-slate-900 text-sm">Verified Customer Reviews</h3>
            <p className="text-xs text-slate-600 leading-relaxed max-w-md mx-auto">
              Reviews are collected directly from verified customers upon completing a doorstep waste pickup. As new pickups are completed, genuine customer ratings and comments will appear here.
            </p>
          </div>
          <div className="pt-1">
            <Link
              href="/book?cart=1"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white font-semibold text-xs hover:bg-emerald-600 transition-colors shadow-sm"
            >
              Book a Doorstep Pickup <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}

