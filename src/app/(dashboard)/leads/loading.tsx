import { SkeletonList } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="p-4 pb-28 max-w-5xl mx-auto space-y-4">
      <div className="h-6 w-20 bg-jai-border/60 rounded animate-pulse" />
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-jai-card border border-jai-border rounded-lg p-2.5 h-[60px] animate-pulse" />
        ))}
      </div>
      <div className="h-[44px] bg-jai-card border border-jai-border rounded-lg animate-pulse" />
      <SkeletonList count={6} cols={2} withStrip />
    </div>
  );
}
