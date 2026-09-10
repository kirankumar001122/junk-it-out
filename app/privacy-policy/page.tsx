export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-6">
      <h1 className="text-3xl font-black text-slate-900">Privacy Policy</h1>
      <p className="text-sm text-slate-600">Last updated: September 7, 2026</p>
      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4 text-xs text-slate-700 leading-relaxed">
        <h2 className="text-base font-bold text-slate-900">1. Information We Collect</h2>
        <p>Junk It Out collects customer pickup location, contact phone number, address details, and photos of waste to facilitate doorstep collection in South Bengaluru.</p>

        <h2 className="text-base font-bold text-slate-900">2. How We Use Information</h2>
        <p>Your location data is strictly used for geofence validation, field agent navigation, and real-time order tracking. We do not sell or expose your personal information to third parties.</p>

        <h2 className="text-base font-bold text-slate-900">3. Security Controls</h2>
        <p>All data transmissions are encrypted via HTTPS. Payment transaction webhooks are cryptographically verified server-side using secret signature keys.</p>
      </div>
    </div>
  );
}
