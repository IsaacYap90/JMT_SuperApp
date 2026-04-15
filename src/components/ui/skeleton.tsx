export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-jai-card border border-jai-border rounded ${className}`}
      aria-hidden
    />
  );
}

export function SkeletonCard({
  lines = 3,
  withStrip = false,
  className = "",
}: {
  lines?: number;
  withStrip?: boolean;
  className?: string;
}) {
  return (
    <div className={`relative bg-jai-card border border-jai-border rounded-xl p-4 overflow-hidden ${className}`}>
      {withStrip && (
        <span className="absolute left-0 top-0 bottom-0 w-1 bg-jai-border animate-pulse" aria-hidden />
      )}
      <div className="animate-pulse space-y-2">
        <div className="h-3.5 w-1/3 bg-jai-border/60 rounded" />
        <div className="h-3 w-1/4 bg-jai-border/40 rounded" />
        {Array.from({ length: Math.max(0, lines - 2) }).map((_, i) => (
          <div key={i} className="h-3 bg-jai-border/30 rounded" style={{ width: `${60 + ((i * 17) % 30)}%` }} />
        ))}
      </div>
    </div>
  );
}

export function SkeletonList({
  count = 4,
  cols = 1,
  withStrip = false,
}: {
  count?: number;
  cols?: 1 | 2 | 3;
  withStrip?: boolean;
}) {
  const gridCls =
    cols === 3 ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"
    : cols === 2 ? "grid grid-cols-1 md:grid-cols-2 gap-3"
    : "space-y-3";
  return (
    <div className={gridCls}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} withStrip={withStrip} />
      ))}
    </div>
  );
}
