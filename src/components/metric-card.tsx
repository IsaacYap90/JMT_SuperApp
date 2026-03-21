export function MetricCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
}) {
  return (
    <div className="bg-jai-card border border-jai-border rounded-xl p-4 md:p-6">
      <p className="text-jai-text text-xs md:text-sm">{title}</p>
      <p className="text-2xl md:text-3xl font-bold mt-1">{value}</p>
      {subtitle && <p className="text-jai-text text-xs mt-1">{subtitle}</p>}
    </div>
  );
}
