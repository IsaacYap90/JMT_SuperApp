import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdmin, type User } from "@/lib/types/database";
import { USER_SELECT } from "@/lib/user-columns";
import { DEMO_MODE } from "@/lib/demo-mask";
import { loadCustomerTimeline } from "@/lib/customers/customer-timeline";
import type { CustomerSource } from "@/lib/customers/customer-resolver";

const SOURCES = new Set<CustomerSource>(["public.leads", "public.trial_bookings", "jai.leads"]);

export default async function CustomerTimelinePage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; id?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await supabase.from("users").select(USER_SELECT).eq("id", user.id).single();
  const profile = data as unknown as User | null;
  if (!profile || !isAdmin(profile.role)) redirect("/");

  const source = params.source as CustomerSource | undefined;
  const sourceKey = params.id?.trim();
  if (!source || !SOURCES.has(source) || !sourceKey) redirect("/leads");

  if (DEMO_MODE) {
    return <div className="max-w-3xl mx-auto"><h1 className="text-2xl font-bold">Customer timeline</h1><p className="mt-4 text-jai-text">Timeline is hidden in filmed-demo mode.</p></div>;
  }

  const result = await loadCustomerTimeline(source, sourceKey);
  if (!result.anchor) {
    return <div className="max-w-3xl mx-auto"><h1 className="text-2xl font-bold">Customer timeline</h1><p className="mt-4 text-red-400">Source record not found.</p></div>;
  }
  const matchedBy = result.resolution?.status === "resolved" ? result.resolution.matchedBy : null;
  const ambiguous = result.resolution?.status === "ambiguous";

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <Link href={source === "public.trial_bookings" ? "/trial-management" : source === "jai.leads" ? "/wa-inbox" : "/leads"} className="text-sm text-jai-blue hover:underline">← Back</Link>
        <h1 className="text-2xl font-bold mt-2">{result.anchor.name || "Customer"}</h1>
        <p className="text-sm text-jai-text mt-1">{matchedBy ? `Matched by exact ${matchedBy}` : "Single-source view"}</p>
      </div>

      {ambiguous && <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">Ambiguous exact match. Records were not merged; only the selected source is shown.</div>}
      {result.resolution?.status === "unmatched" && <div className="rounded-xl border border-jai-border bg-jai-card p-4 text-sm text-jai-text">No exact cross-source match. No records were linked or changed.</div>}

      <ol className="space-y-3">
        {result.events.map((event) => (
          <li key={event.id} className="rounded-xl border border-jai-border bg-jai-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs uppercase tracking-wide text-jai-blue">{event.source}</span>
              <time className="text-xs text-jai-text">{new Date(event.at).toLocaleString("en-SG", { timeZone: "Asia/Singapore" })}</time>
            </div>
            <p className="font-medium mt-2">{event.title}</p>
            {event.detail && <p className="text-sm text-jai-text mt-1 whitespace-pre-wrap break-words">{event.detail}</p>}
          </li>
        ))}
      </ol>
      {result.events.length === 0 && <p className="text-jai-text">No timeline events found.</p>}
    </div>
  );
}
