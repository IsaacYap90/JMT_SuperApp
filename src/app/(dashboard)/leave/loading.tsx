import { SkeletonList } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="p-4 pb-28 max-w-5xl mx-auto space-y-4">
      <div className="h-6 w-24 bg-jai-border/60 rounded animate-pulse" />
      <SkeletonList count={4} cols={2} />
    </div>
  );
}
