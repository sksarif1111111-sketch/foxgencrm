export function FoxgenOrderSkeleton() {
  return (
    <div aria-label="Loading FoxGen orders" className="space-y-4 py-4">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="grid grid-cols-3 gap-4 border-b pb-4 sm:grid-cols-5">
          <div className="space-y-2">
            <div className="h-4 animate-pulse rounded bg-muted" />
            <div className="h-3 w-20 animate-pulse rounded bg-muted" />
          </div>
          {Array.from({ length: 4 }, (_, j) => (
            <div key={j} className="h-6 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ))}
    </div>
  );
}
