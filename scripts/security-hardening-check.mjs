import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/migrations/20260924070652_security_hardening.sql", import.meta.url), "utf8");
assert.match(sql, /revoke execute on function public\.notify_coach_on_class_assignment\(\) from public, anon, authenticated;/i);
assert.match(sql, /revoke execute on function public\.notify_lead_coach_assignment\(\) from public, anon, authenticated;/i);
assert.match(sql, /alter function public\.firstreply_invoice_status_forward\(\) set search_path = public, pg_temp;/i);
assert.doesNotMatch(sql, /jmt_is_admin|jmt_is_staff|leados_current_user/i);
console.log("✅ security-hardening-check: 4 assertions passed");
