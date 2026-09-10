'use client';

import React from 'react';

export function TableRowSkeleton() {
  return (
    <tr className="animate-pulse">
      <td className="p-3"><div className="h-4 w-24 bg-slate-200 rounded-md shimmer-loader" /></td>
      <td className="p-3"><div className="h-4 w-32 bg-slate-200 rounded-md shimmer-loader" /></td>
      <td className="p-3"><div className="h-4 w-20 bg-slate-200 rounded-md shimmer-loader" /></td>
      <td className="p-3"><div className="h-5 w-16 bg-slate-200 rounded-full shimmer-loader" /></td>
      <td className="p-3"><div className="h-4 w-28 bg-slate-200 rounded-md shimmer-loader" /></td>
      <td className="p-3"><div className="h-4 w-16 bg-slate-200 rounded-md shimmer-loader" /></td>
      <td className="p-3"><div className="h-7 w-14 bg-slate-200 rounded-lg shimmer-loader" /></td>
    </tr>
  );
}

export function CardSkeleton() {
  return (
    <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-sm space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="w-10 h-10 rounded-xl bg-slate-200 shimmer-loader" />
        <div className="w-16 h-5 rounded-full bg-slate-200 shimmer-loader" />
      </div>
      <div className="h-6 w-3/4 bg-slate-200 rounded-lg shimmer-loader" />
      <div className="h-4 w-full bg-slate-200 rounded-md shimmer-loader" />
      <div className="h-4 w-2/3 bg-slate-200 rounded-md shimmer-loader" />
    </div>
  );
}

export function MapSkeleton() {
  return (
    <div className="w-full h-full rounded-2xl bg-slate-100 flex flex-col items-center justify-center space-y-3 p-8 border border-slate-200 relative overflow-hidden">
      <div className="absolute inset-0 shimmer-loader opacity-50" />
      <div className="w-12 h-12 rounded-full bg-emerald-200/80 flex items-center justify-center text-emerald-800 font-black text-xl z-10 animate-bounce">
        📍
      </div>
      <span className="text-xs font-extrabold text-slate-600 z-10">Loading South Bengaluru Live Map...</span>
    </div>
  );
}
