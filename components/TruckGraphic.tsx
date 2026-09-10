'use client';

import React from 'react';

export default function TruckGraphic({ className = '' }: { className?: string }) {
  return (
    <div className={`relative w-full select-none ${className}`}>
      {/* Soft integrated ground drop shadow */}
      <div className="absolute -bottom-3 left-[5%] right-[2%] h-8 bg-slate-950/25 blur-lg rounded-full transform scale-y-50 pointer-events-none" />
      <div className="absolute -bottom-1 left-[10%] right-[5%] h-4 bg-emerald-950/30 blur-md rounded-full transform scale-y-40 pointer-events-none" />

      <svg
        viewBox="0 0 950 480"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto drop-shadow-2xl overflow-visible"
      >
        <defs>
          {/* Gradients */}
          <linearGradient id="bodyGreen" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#16a34a" />
            <stop offset="50%" stopColor="#15803d" />
            <stop offset="100%" stopColor="#0a4625" />
          </linearGradient>

          <linearGradient id="cabWhite" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="70%" stopColor="#f1f5f9" />
            <stop offset="100%" stopColor="#cbd5e1" />
          </linearGradient>

          <linearGradient id="windowGlass" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#0369a1" stopOpacity="0.9" />
          </linearGradient>

          <linearGradient id="metalChrome" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#94a3b8" />
            <stop offset="50%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#64748b" />
          </linearGradient>

          <linearGradient id="bumperDark" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#334155" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>

          <radialGradient id="headlightGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fef08a" stopOpacity="1" />
            <stop offset="60%" stopColor="#eab308" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#ca8a04" stopOpacity="0" />
          </radialGradient>

          <linearGradient id="wheelRim" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#e2e8f0" />
            <stop offset="50%" stopColor="#64748b" />
            <stop offset="100%" stopColor="#1e293b" />
          </linearGradient>

          {/* Filters */}
          <filter id="shadowFilter" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="2" dy="8" stdDeviation="6" floodColor="#000" floodOpacity="0.25" />
          </filter>
        </defs>

        {/* --- TRUCK CARGO CONTAINER (MAIN GREEN BODY) --- */}
        <g filter="url(#shadowFilter)">
          {/* Main Cargo Container Box */}
          <path
            d="M 40 80 L 590 80 Q 610 80 610 100 L 610 330 Q 610 340 600 340 L 40 340 Q 30 340 30 330 L 30 90 Q 30 80 40 80 Z"
            fill="url(#bodyGreen)"
            stroke="#166534"
            strokeWidth="3"
          />

          {/* Container Roof Curved Trim */}
          <path
            d="M 30 85 Q 310 65 610 85 L 610 95 Q 310 75 30 95 Z"
            fill="#22c55e"
            opacity="0.8"
          />

          {/* Container Vertical Ribs & Panels */}
          <line x1="140" y1="80" x2="140" y2="340" stroke="#14532d" strokeWidth="3" opacity="0.6" />
          <line x1="250" y1="80" x2="250" y2="340" stroke="#14532d" strokeWidth="3" opacity="0.6" />
          <line x1="360" y1="80" x2="360" y2="340" stroke="#14532d" strokeWidth="3" opacity="0.6" />
          <line x1="470" y1="80" x2="470" y2="340" stroke="#14532d" strokeWidth="3" opacity="0.6" />

          {/* White Accent Stripe Across Cargo Box */}
          <path
            d="M 30 240 L 610 240 L 610 270 L 30 270 Z"
            fill="#ffffff"
            opacity="0.95"
          />

          {/* Green Wave Detail inside White Stripe */}
          <path
            d="M 30 255 Q 180 240 330 255 Q 480 270 610 255 L 610 270 L 30 270 Z"
            fill="#16a34a"
            opacity="0.9"
          />

          {/* Rear Hydraulic Loading Hopper / Compactor Door */}
          <path
            d="M 10 110 L 30 100 L 30 330 L 10 320 Q 0 320 0 300 L 0 130 Q 0 110 10 110 Z"
            fill="#14532d"
            stroke="#052e16"
            strokeWidth="2"
          />
          {/* Hydraulic Arm Accent */}
          <rect x="8" y="140" width="14" height="150" rx="3" fill="url(#metalChrome)" />
          <circle cx="15" cy="160" r="4" fill="#334155" />
          <circle cx="15" cy="270" r="4" fill="#334155" />

          {/* --- BRANDING & LOGOS ON CARGO BODY --- */}

          {/* Official Junk It Out Shield Emblem Logo */}
          <image href="/logo.png" x="92" y="122" width="75" height="75" filter="url(#shadowFilter)" />

          {/* Main Brand Text: JUNK IT OUT */}
          <text
            x="180"
            y="170"
            fill="#ffffff"
            fontSize="42"
            fontWeight="900"
            fontFamily="system-ui, -apple-system, sans-serif"
            letterSpacing="2"
          >
            JUNK IT <tspan fill="#4ade80">OUT</tspan>
            <tspan fontSize="20" dy="-20">™</tspan>
          </text>

          {/* Tagline under Logo */}
          <text
            x="182"
            y="198"
            fill="#bbf7d0"
            fontSize="14"
            fontWeight="800"
            fontFamily="system-ui, -apple-system, sans-serif"
            letterSpacing="3"
          >
            SMART WASTE & RECYCLING FLEET
          </text>

          {/* Badge: 100% ECO FRIENDLY */}
          <rect x="420" y="112" width="165" height="32" rx="16" fill="#ffffff" opacity="0.95" />
          <text
            x="502"
            y="133"
            fill="#15803d"
            fontSize="11"
            fontWeight="900"
            textAnchor="middle"
            fontFamily="system-ui, -apple-system, sans-serif"
            letterSpacing="1"
          >
            🌱 100% ECO FRIENDLY
          </text>

          {/* Vehicle Code & Helpline on Stripe */}
          <text
            x="40"
            y="261"
            fill="#0f172a"
            fontSize="12"
            fontWeight="800"
            fontFamily="system-ui, -apple-system, sans-serif"
          >
            KA-05-JK-1024 • SOUTH BENGALURU DISPATCH
          </text>
          <text
            x="450"
            y="261"
            fill="#ffffff"
            fontSize="12"
            fontWeight="800"
            fontFamily="system-ui, -apple-system, sans-serif"
          >
            CALL: +91 91897 45120
          </text>
        </g>

        {/* --- FRONT CABIN (WHITE & GREEN PREMIUM CAB) --- */}
        <g filter="url(#shadowFilter)">
          {/* Main Cab Outer Shell */}
          <path
            d="M 595 140 L 710 140 Q 750 140 780 180 L 845 250 Q 865 270 865 290 L 865 340 L 595 340 Z"
            fill="url(#cabWhite)"
            stroke="#cbd5e1"
            strokeWidth="2"
          />

          {/* Cab Roof Slope Green Accent Panel */}
          <path
            d="M 595 140 L 710 140 Q 735 140 755 165 L 755 185 L 595 185 Z"
            fill="#16a34a"
          />

          {/* Large Panoramic Windscreen / Side Window */}
          <path
            d="M 620 160 L 705 160 Q 730 160 755 195 L 795 245 Q 800 252 790 252 L 620 252 Z"
            fill="url(#windowGlass)"
            stroke="#0284c7"
            strokeWidth="2"
          />

          {/* Sun Visor / Window Glare Effect */}
          <path
            d="M 620 160 L 705 160 Q 720 160 735 180 L 620 180 Z"
            fill="#ffffff"
            opacity="0.35"
          />
          <path
            d="M 720 190 L 775 245 L 755 245 L 705 190 Z"
            fill="#ffffff"
            opacity="0.25"
          />

          {/* Driver Silhouette in Window */}
          <circle cx="660" cy="205" r="14" fill="#0f172a" opacity="0.75" />
          <path d="M 640 240 Q 660 220 680 240 Z" fill="#0f172a" opacity="0.75" />

          {/* Large Commercial Side Mirror */}
          <rect x="800" y="190" width="14" height="42" rx="4" fill="#1e293b" />
          <path d="M 780 200 L 800 200 M 785 220 L 800 220" stroke="#0f172a" strokeWidth="4" />

          {/* Cab Side Door Outline & Handle */}
          <path
            d="M 610 155 L 790 255 L 790 335 L 610 335 Z"
            fill="none"
            stroke="#94a3b8"
            strokeWidth="2"
            strokeDasharray="4 2"
          />
          <rect x="635" y="265" width="28" height="10" rx="3" fill="url(#metalChrome)" filter="url(#shadowFilter)" />

          {/* Front Engine Hood & Grille Section */}
          <path
            d="M 795 255 L 870 275 Q 890 280 890 300 L 890 340 L 790 340 Z"
            fill="url(#cabWhite)"
          />

          {/* Chrome Front Grille Ribs */}
          <rect x="840" y="285" width="45" height="42" rx="6" fill="#1e293b" />
          <line x1="845" y1="293" x2="880" y2="293" stroke="url(#metalChrome)" strokeWidth="3" />
          <line x1="845" y1="301" x2="880" y2="301" stroke="url(#metalChrome)" strokeWidth="3" />
          <line x1="845" y1="309" x2="880" y2="309" stroke="url(#metalChrome)" strokeWidth="3" />
          <line x1="845" y1="317" x2="880" y2="317" stroke="url(#metalChrome)" strokeWidth="3" />

          {/* JUNK IT OUT Emblem on Hood */}
          <rect x="815" y="270" width="45" height="12" rx="3" fill="#16a34a" />
          <text x="837" y="279" fill="#ffffff" fontSize="7" fontWeight="900" textAnchor="middle">JIO GREEN</text>

          {/* Front Bumper Heavy Duty */}
          <path
            d="M 780 340 L 910 340 Q 925 340 925 355 L 920 375 Q 915 380 895 380 L 590 380 L 590 340 Z"
            fill="url(#bumperDark)"
          />
          {/* Yellow Safety Reflector Strips on Bumper */}
          <rect x="895" y="350" width="15" height="18" rx="2" fill="#eab308" />
          <line x1="898" y1="350" x2="908" y2="368" stroke="#000" strokeWidth="2" />

          {/* Dual LED Headlights with Beam Glow */}
          <circle cx="895" cy="310" r="22" fill="url(#headlightGlow)" />
          <rect x="880" y="300" width="16" height="20" rx="4" fill="#ffffff" stroke="#cbd5e1" strokeWidth="2" />
          <circle cx="888" cy="310" r="6" fill="#fef08a" />

          {/* Light Beam Effect Cone extending forward */}
          <path
            d="M 895 310 L 950 280 L 950 360 Z"
            fill="#fef08a"
            opacity="0.15"
          />
        </g>

        {/* --- HEAVY DUTY WHEELS & TIRES --- */}

        {/* Rear Wheel Pair 1 (Left Rear) */}
        <g filter="url(#shadowFilter)">
          {/* Tire Tread */}
          <circle cx="160" cy="360" r="54" fill="#0f172a" stroke="#334155" strokeWidth="6" />
          {/* Metallic Rim */}
          <circle cx="160" cy="360" r="32" fill="url(#wheelRim)" />
          <circle cx="160" cy="360" r="22" fill="#cbd5e1" />
          {/* Lug Nuts */}
          <circle cx="160" cy="345" r="3.5" fill="#0f172a" />
          <circle cx="173" cy="353" r="3.5" fill="#0f172a" />
          <circle cx="173" cy="367" r="3.5" fill="#0f172a" />
          <circle cx="160" cy="375" r="3.5" fill="#0f172a" />
          <circle cx="147" cy="367" r="3.5" fill="#0f172a" />
          <circle cx="147" cy="353" r="3.5" fill="#0f172a" />
          <circle cx="160" cy="360" r="8" fill="#16a34a" />
        </g>

        {/* Rear Wheel Pair 2 (Middle Rear) */}
        <g filter="url(#shadowFilter)">
          <circle cx="300" cy="360" r="54" fill="#0f172a" stroke="#334155" strokeWidth="6" />
          <circle cx="300" cy="360" r="32" fill="url(#wheelRim)" />
          <circle cx="300" cy="360" r="22" fill="#cbd5e1" />
          <circle cx="300" cy="345" r="3.5" fill="#0f172a" />
          <circle cx="313" cy="353" r="3.5" fill="#0f172a" />
          <circle cx="313" cy="367" r="3.5" fill="#0f172a" />
          <circle cx="300" cy="375" r="3.5" fill="#0f172a" />
          <circle cx="287" cy="367" r="3.5" fill="#0f172a" />
          <circle cx="287" cy="353" r="3.5" fill="#0f172a" />
          <circle cx="300" cy="360" r="8" fill="#16a34a" />
        </g>

        {/* Front Wheel (under Cab) */}
        <g filter="url(#shadowFilter)">
          <circle cx="730" cy="360" r="54" fill="#0f172a" stroke="#334155" strokeWidth="6" />
          <circle cx="730" cy="360" r="32" fill="url(#wheelRim)" />
          <circle cx="730" cy="360" r="22" fill="#cbd5e1" />
          <circle cx="730" cy="345" r="3.5" fill="#0f172a" />
          <circle cx="743" cy="353" r="3.5" fill="#0f172a" />
          <circle cx="743" cy="367" r="3.5" fill="#0f172a" />
          <circle cx="730" cy="375" r="3.5" fill="#0f172a" />
          <circle cx="717" cy="367" r="3.5" fill="#0f172a" />
          <circle cx="717" cy="353" r="3.5" fill="#0f172a" />
          <circle cx="730" cy="360" r="8" fill="#16a34a" />
        </g>

        {/* Underbody Mudflaps */}
        <rect x="80" y="340" width="20" height="40" fill="#1e293b" rx="2" />
        <text x="90" y="375" fill="#ffffff" fontSize="6" fontWeight="900" textAnchor="middle">JIO</text>
        <rect x="360" y="340" width="20" height="40" fill="#1e293b" rx="2" />
        <rect x="790" y="340" width="20" height="40" fill="#1e293b" rx="2" />
      </svg>
    </div>
  );
}
