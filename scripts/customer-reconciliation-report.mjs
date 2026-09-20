// Read-only reconciliation report across public.leads, public.trial_bookings
// and jai.leads. It prints aggregate counts only — never customer PII.
// Run with: node --env-file=.env.local --import ./scripts/ts-resolve.mjs scripts/customer-reconciliation-report.mjs

import { createClient } from "@supabase/supabase-js";
import { normalizeCustomerEmail, normalizeCustomerPhone } from "../src/lib/customer-identity.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(2);
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const pub = createClient(url, key, options);
const jai = createClient(url, key, { ...options, db: { schema: "jai" } });

async function fetchAll(client, table, columns) {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client.from(table).select(columns).range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}

const [leadRows, trialRows, jaiRows] = await Promise.all([
  fetchAll(pub, "leads", "id, phone, email"),
  fetchAll(pub, "trial_bookings", "id, phone, calendly_details"),
  fetchAll(jai, "leads", "contact_number"),
]);

const records = [
  ...leadRows.map((row) => ({ ref: `lead:${row.id}`, source: "public.leads", phone: normalizeCustomerPhone(row.phone), email: normalizeCustomerEmail(row.email) })),
  ...trialRows.map((row) => ({ ref: `trial:${row.id}`, source: "public.trial_bookings", phone: normalizeCustomerPhone(row.phone), email: normalizeCustomerEmail(row.calendly_details?.email) })),
  ...jaiRows.map((row) => ({ ref: `jai:${row.contact_number}`, source: "jai.leads", phone: normalizeCustomerPhone(row.contact_number), email: null })),
];

const byIdentifier = new Map();
for (const record of records) {
  for (const [kind, value] of [["phone", record.phone], ["email", record.email]]) {
    if (!value) continue;
    const identifier = `${kind}:${value}`;
    const bucket = byIdentifier.get(identifier) || [];
    bucket.push(record);
    byIdentifier.set(identifier, bucket);
  }
}

const parent = new Map(records.map((r) => [r.ref, r.ref]));
function find(ref) {
  const p = parent.get(ref);
  if (p === ref) return ref;
  const root = find(p);
  parent.set(ref, root);
  return root;
}
function union(a, b) {
  const ra = find(a);
  const rb = find(b);
  if (ra !== rb) parent.set(rb, ra);
}
const sourceNames = ["public.leads", "public.trial_bookings", "jai.leads"];
const isAmbiguousBucket = (bucket) => {
  const perSource = new Map();
  for (const record of bucket) perSource.set(record.source, (perSource.get(record.source) || 0) + 1);
  return [...perSource.values()].some((count) => count > 1);
};

// Exact does not automatically mean safe: one family number or duplicated form
// submission can identify several rows in a source. Only unique-within-source
// identifiers participate in safe clusters; ambiguous ones are reported below.
for (const bucket of byIdentifier.values()) {
  if (isAmbiguousBucket(bucket)) continue;
  for (let i = 1; i < bucket.length; i++) union(bucket[0].ref, bucket[i].ref);
}

const sourceStats = Object.fromEntries(sourceNames.map((source) => {
  const subset = records.filter((r) => r.source === source);
  return [source, { rows: subset.length, validPhone: subset.filter((r) => r.phone).length, validEmail: subset.filter((r) => r.email).length }];
}));

const clusterSources = new Map();
for (const record of records) {
  const root = find(record.ref);
  const group = clusterSources.get(root) || new Set();
  group.add(record.source);
  clusterSources.set(root, group);
}

const matchedRows = Object.fromEntries(sourceNames.map((source) => [source, 0]));
for (const record of records) {
  if ((clusterSources.get(find(record.ref))?.size || 0) > 1) matchedRows[record.source]++;
}

const pairs = {};
for (let i = 0; i < sourceNames.length; i++) {
  for (let j = i + 1; j < sourceNames.length; j++) {
    const a = sourceNames[i];
    const b = sourceNames[j];
    pairs[`${a} <-> ${b}`] = [...clusterSources.values()].filter((sources) => sources.has(a) && sources.has(b)).length;
  }
}

const ambiguousIdentifiers = [...byIdentifier.values()].filter(isAmbiguousBucket).length;
const crossSourceClusters = [...clusterSources.values()].filter((sources) => sources.size > 1).length;

console.log("Customer reconciliation (read-only, aggregate; no PII)\n");
for (const source of sourceNames) {
  const stat = sourceStats[source];
  console.log(`${source}: ${stat.rows} rows; ${stat.validPhone} valid phones; ${stat.validEmail} valid emails; ${matchedRows[source]} matched across sources; ${stat.rows - matchedRows[source]} unmatched`);
}
console.log("\nCross-source identity clusters:");
for (const [pair, count] of Object.entries(pairs)) console.log(`- ${pair}: ${count}`);
console.log(`\nSafe cross-source exact-match clusters: ${crossSourceClusters}`);
console.log(`Ambiguous identifiers (duplicate within a source): ${ambiguousIdentifiers}`);
console.log("No records were written or changed.");
