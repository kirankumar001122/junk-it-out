export default function AcceptedWastePage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-6">
      <h1 className="text-3xl font-black text-slate-900">Waste Acceptance & Restriction Policy</h1>
      <p className="text-sm text-slate-600">Please review what materials are accepted by Junk It Out field agents.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-emerald-50 border border-emerald-200 p-6 rounded-3xl space-y-3">
          <h2 className="text-base font-bold text-emerald-900 flex items-center gap-2">
            ✓ Accepted Materials (We Buy / Collect)
          </h2>
          <ul className="text-xs text-emerald-800 space-y-2 list-disc pl-4">
            <li>Plastics (PET bottles, hard containers, polythene, packaging)</li>
            <li>Paper & Cardboard (Cartons, newspapers, office paper)</li>
            <li>Scrap Metals (Iron, steel, copper wire, aluminium, brass)</li>
            <li>E-Waste (Keyboards, monitors, chargers, small electronics)</li>
            <li>Dry Household Scrap & Fabric</li>
            <li>Intact Glass Bottles & Jars</li>
            <li>Old Furniture & Bulky Scrap (Pickup fee applies)</li>
            <li>Large Appliances (Refrigerators, Washing Machines, ACs)</li>
          </ul>
        </div>

        <div className="bg-rose-50 border border-rose-200 p-6 rounded-3xl space-y-3">
          <h2 className="text-base font-bold text-rose-900 flex items-center gap-2">
            ✕ Prohibited & Rejected Materials
          </h2>
          <ul className="text-xs text-rose-800 space-y-2 list-disc pl-4">
            <li>Hazardous chemical or bio-medical waste</li>
            <li>Wet kitchen waste / perishable food waste</li>
            <li>Explosives, flammable liquids, or gas cylinders</li>
            <li>Radioactive or medical sharps</li>
            <li>Construction debris / concrete rubble</li>
            <li>Stolen or illegal goods</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
