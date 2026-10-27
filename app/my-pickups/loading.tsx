export default function MyPickupsLoading() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6" aria-label="Loading pickups">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="shimmer-box h-5 w-36 rounded-full" />
          <div className="shimmer-box h-8 w-64 rounded-lg" />
          <div className="shimmer-box h-4 w-72 rounded-lg" />
        </div>
        <div className="shimmer-box h-11 w-40 rounded-xl" />
      </div>
      <div className="shimmer-box h-14 w-full rounded-2xl" />
      <div className="space-y-4">
        {[1, 2, 3].map((item) => (
          <div key={item} className="shimmer-box h-40 w-full rounded-3xl" />
        ))}
      </div>
    </div>
  );
}
