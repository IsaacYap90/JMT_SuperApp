import Link from "next/link";

export function MetricCard({
  title,
  value,
  subtitle,
  href,
  highlight,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  href?: string;
  highlight?: boolean;
}) {
  const content = (
    <>
      <p className="text-jai-text text-xs md:text-sm">{title}</p>
      <p className={`text-2xl md:text-3xl font-bold mt-1 ${highlight ? "text-red-500" : ""}`}>{value}</p>
      {subtitle && <p className="text-jai-text text-xs mt-1">{subtitle}</p>}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="bg-jai-card border border-jai-border rounded-xl p-4 md:p-6 hover:border-jai-blue/40 transition-colors"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="bg-jai-card border border-jai-border rounded-xl p-4 md:p-6">
      {content}
    </div>
  );
}
