'use client';

import React from 'react';

export default function DpiitCertificateGraphic({ className = '' }: { className?: string }) {
  return (
    <div className={`relative w-full max-w-[540px] mx-auto select-none ${className}`}>
      {/* Ambient shadow glow behind certificate */}
      <div className="absolute -inset-2 bg-gradient-to-tr from-emerald-500/20 via-blue-500/10 to-teal-500/20 rounded-3xl blur-xl" />

      {/* Main Certificate Framed Card */}
      <div className="relative bg-white rounded-2xl border-4 border-slate-200/90 shadow-2xl p-4 sm:p-6 overflow-hidden">
        {/* Decorative Ornate Border */}
        <div className="border-2 border-blue-900/80 rounded-lg p-3 sm:p-5 relative bg-[radial-gradient(#f8fafc_1px,transparent_1px)] [background-size:16px_16px]">
          
          {/* Top Header Row */}
          <div className="flex items-start justify-between border-b border-amber-900/20 pb-3 gap-2">
            <div>
              <span className="text-[9px] sm:text-[10px] font-bold text-blue-900 uppercase block tracking-wider">CERTIFICATE NO:</span>
              <span className="text-[11px] sm:text-xs font-black text-slate-800 tracking-wider">DIPP265455</span>
            </div>

            {/* Emblem of India Graphic representation */}
            <div className="text-center flex flex-col items-center">
              <div className="w-7 h-9 text-amber-800 flex items-center justify-center font-serif text-lg font-black leading-none">
                🏛️
              </div>
              <span className="text-[8px] font-bold text-slate-700 uppercase tracking-tight">Government of India</span>
              <span className="text-[7px] text-slate-500 block -mt-0.5">Ministry of Commerce & Industry</span>
              <span className="text-[6px] text-slate-500 block -mt-0.5">Department for Promotion of Industry and Internal Trade</span>
            </div>

            {/* Startup India Logo */}
            <div className="text-right">
              <div className="inline-flex items-center gap-1 bg-slate-900 text-white px-2 py-0.5 rounded text-[9px] font-black tracking-wider">
                DPIIT
              </div>
              <span className="text-[9px] font-black text-emerald-600 block mt-0.5">#startupindia</span>
            </div>
          </div>

          {/* Certificate Title */}
          <div className="text-center my-4 space-y-1">
            <h4 className="text-xs sm:text-sm font-bold text-amber-700 uppercase tracking-widest font-serif">
              ✦ Department for Promotion of Industry and Internal Trade ✦
            </h4>
            <h3 className="text-lg sm:text-2xl font-black text-blue-900 uppercase tracking-wider font-serif border-b-2 border-amber-400 inline-block px-4 pb-1">
              CERTIFICATE OF RECOGNITION
            </h3>
          </div>

          {/* Body Text */}
          <div className="text-center text-[10px] sm:text-xs text-slate-700 font-serif leading-relaxed px-2 space-y-2">
            <p>
              This is to certify that <strong className="text-blue-950 font-black tracking-wide">JUNK IT OUT TECHNOLOGIES PRIVATE LIMITED</strong> incorporated as a <em>Private Limited Company</em> on <strong className="text-slate-900">30-03-2026</strong>, is recognized as a startup by the Department for Promotion of Industry and Internal Trade.
            </p>
            <p className="text-[9px] sm:text-[10px] text-slate-600">
              The startup is working in <strong>'Waste Management'</strong> Industry and <strong>'Others'</strong> sector as self-certified by them.
            </p>
            <p className="text-[8px] text-amber-800 italic">
              This certificate shall only be valid for the Entity up to <strong>Ten years</strong> from the date of its incorporation.
            </p>
          </div>

          {/* Golden Laurel Wreath & QR Code */}
          <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between px-2">
            <div className="text-left">
              <span className="text-[8px] text-slate-400 font-bold block uppercase">Date of Issue</span>
              <span className="text-[10px] font-extrabold text-slate-800">03-06-2026</span>
            </div>

            {/* Laurel & QR */}
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-300 flex items-center justify-center p-1 relative shadow-inner">
                {/* QR Code SVG representation */}
                <div className="w-full h-full bg-slate-900 rounded grid grid-cols-4 gap-0.5 p-1">
                  <div className="bg-white rounded-xs" />
                  <div className="bg-slate-900" />
                  <div className="bg-white rounded-xs" />
                  <div className="bg-white" />
                  <div className="bg-slate-900" />
                  <div className="bg-white" />
                  <div className="bg-slate-900" />
                  <div className="bg-white" />
                  <div className="bg-white rounded-xs" />
                  <div className="bg-slate-900" />
                  <div className="bg-white rounded-xs" />
                  <div className="bg-slate-900" />
                  <div className="bg-white" />
                  <div className="bg-white" />
                  <div className="bg-slate-900" />
                  <div className="bg-white" />
                </div>
              </div>
              <span className="text-[7px] text-amber-900 font-bold uppercase mt-0.5">Scan to Verify</span>
            </div>

            <div className="text-right">
              <span className="text-[8px] text-slate-400 font-bold block uppercase">Valid Upto</span>
              <span className="text-[10px] font-extrabold text-slate-800">29-03-2036</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
