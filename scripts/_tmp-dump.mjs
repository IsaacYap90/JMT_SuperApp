import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { db: { schema: "jai" } });
const { data, error } = await sb.from("conversations").select("contact_number,contact_name,role,message,created_at").order("created_at",{ascending:true}).limit(3000);
if (error) { console.error(error); process.exit(1); }
const byC = new Map();
for (const r of data) { if(!byC.has(r.contact_number)) byC.set(r.contact_number,[]); byC.get(r.contact_number).push(r); }
const arr=[...byC.entries()].map(([k,v])=>({k,n:v.filter(x=>x.role==="user").length,last:v[v.length-1].created_at,v}));
arr.sort((a,b)=>b.last.localeCompare(a.last));
for (const c of arr.slice(0,25)) {
  console.log(`\n==== ${c.k} (${c.v[0].contact_name}) userTurns=${c.n} last=${c.last}`);
  for (const m of c.v) console.log(`  ${m.role==="user"?"C":"J"}: ${m.message.replace(/\n/g," ⏎ ").slice(0,200)}`);
}
