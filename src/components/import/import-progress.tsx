export function ImportProgress({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="space-y-4 py-12 text-center">
      <p className="text-lg font-medium">Importing customers...</p>
      <p className="text-sm text-muted-foreground">
        {done.toLocaleString("en-IN")} / {total.toLocaleString("en-IN")}
      </p>
      <div className="mx-auto h-2 w-full max-w-sm overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-brand-500 transition-all"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      <p className="text-xs text-muted-foreground">This won&apos;t take long — feel free to keep this tab open.</p>
    </div>
  );
}
