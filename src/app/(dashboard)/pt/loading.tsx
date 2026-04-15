import { SkeletonList } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="p-4 pb-28 max-w-5xl mx-auto space-y-4">
      <div className="h-6 w-28 bg-jai-border/60 rounded animate-pulse" />
      <div className="h-[44px] bg-jai-card border border-jai-border rounded-lg animate-pulse" />
      <SkeletonList count={5} cols={2} />
    </div>
  );
}
