'use client';

import { useEffect, useState } from 'react';
import { Star, CheckCircle2, MessageSquareQuote } from 'lucide-react';

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
    fetch('/api/reviews')
      .then((r) => r.json())
      .then((d) => {
        if (d.success && Array.isArray(d.data)) {
          setReviews(d.data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center max-w-2xl mx-auto space-y-3 mb-8">
        <span className="text-xs font-extrabold text-emerald-700 bg-emerald-100 px-3.5 py-1 rounded-full uppercase tracking-wider">
          Verified Pickup Reviews
        </span>
        <h2 className="text-3xl font-black text-slate-900 tracking-tight">Customer Feedback</h2>
        <p className="text-xs sm:text-sm text-slate-600">
          Real reviews collected from verified customer pickup completions in Bengaluru.
        </p>
      </div>

      {reviews.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {reviews.map((rev) => {
            const name = rev.customer?.user?.name || 'Verified Customer';
            return (
              <div
                key={rev.id}
                className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-3 flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-1 text-amber-400">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`w-4 h-4 ${star <= rev.rating ? 'fill-current' : 'text-slate-200'}`}
                      />
                    ))}
                  </div>
                  {rev.comment && <p className="text-xs text-slate-700 leading-relaxed font-medium">"{rev.comment}"</p>}
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="font-extrabold text-slate-900">{name}</span>
                  </div>
                  <span className="text-slate-400 font-mono text-[10px]">
                    {new Date(rev.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm text-center max-w-xl mx-auto space-y-3">
          <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-2xl grid place-items-center mx-auto">
            <MessageSquareQuote className="w-6 h-6" />
          </div>
          <h3 className="font-extrabold text-slate-900 text-base">Be the First to Review</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
            Reviews are submitted by verified customers upon completing a doorstep pickup. Book your pickup today to share your feedback!
          </p>
        </div>
      )}
    </section>
  );
}
