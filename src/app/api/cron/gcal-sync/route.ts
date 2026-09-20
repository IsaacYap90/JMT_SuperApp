/**
 * Cron: sync all active Google Calendar connections.
 * Runs every 30 minutes (configured in vercel.json).
 * Also supports manual trigger: GET /api/cron/gcal-sync?manual=1
 * (still requires CRON_SECRET auth).
 */

import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { getAllActiveConnections } from "@/lib/gcal/connection";
import { syncCoach, type SyncResult } from "@/lib/gcal/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connections = await getAllActiveConnections();
  if (connections.length === 0) {
    return NextResponse.json({ ok: true, message: "No active connections", synced: 0 });
  }

  const results: Array<{ user_id: string; result?: SyncResult; error?: string }> = [];

  for (const conn of connections) {
    try {
      const result = await syncCoach(conn);
      results.push({ user_id: conn.user_id, result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`gcal-sync cron: user=${conn.user_id} error:`, msg);
      results.push({ user_id: conn.user_id, error: msg });
    }
  }

  const synced = results.filter(r => r.result && r.result.errors.length === 0).length;
  const errored = results.filter(r => r.error || (r.result && r.result.errors.length > 0)).length;

  return NextResponse.json({
    ok: errored === 0,
    synced,
    errored,
    total: connections.length,
    results,
  });
}
