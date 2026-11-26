export default function AppLoading() {
  return (
    <div className="flex-1 space-y-6 p-4 sm:p-8">
      <div className="skeleton h-8 w-48 rounded-lg" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-24 rounded-2xl" style={{ animationDelay: `${i * 80}ms` }} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-40 rounded-2xl" style={{ animationDelay: `${i * 80}ms` }} />
        ))}
      </div>
    </div>
  );
}
