"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getConnection, revokeConnection } from "@/lib/gcal/connection";
import { syncCoach, type SyncResult } from "@/lib/gcal/sync";
import { isGcalConfigured } from "@/lib/gcal/config";

export interface GcalConnectionStatus {
  connected: boolean;
  /** False when Google OAuth env vars are absent/malformed on the server. */
  configured: boolean;
  google_email: string | null;
  connected_at: string | null;
  last_synced_at: string | null;
}

/**
 * Get current user's Google Calendar connection status.
 * Safe to call from a client component — returns no tokens and no env values,
 * only a boolean saying whether the feature is set up server-side.
 */
export async function getGcalStatus(): Promise<GcalConnectionStatus> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const configured = isGcalConfigured();

  // The connections table may not exist yet (migration unapplied). Treat a
  // lookup failure as "not connected" so the setup notice still renders.
  let conn = null;
  try {
    conn = await getConnection(user.id);
  } catch (err) {
    console.error("Failed to read gcal connection:", err);
  }

  if (!conn) {
    return { connected: false, configured, google_email: null, connected_at: null, last_synced_at: null };
  }

  return {
    connected: true,
    configured,
    google_email: conn.google_email,
    connected_at: conn.connected_at,
    last_synced_at: conn.last_synced_at,
  };
}

/**
 * Disconnect Google Calendar. Soft-revokes: sets revoked_at so the secondary
 * calendar and its events remain on Google untouched. Does NOT call Google's
 * revoke endpoint or delete events.
 */
export async function disconnectGcal(): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  try {
    await revokeConnection(user.id);
    return { success: true };
  } catch (err) {
    console.error("Failed to disconnect gcal:", err);
    return { success: false, error: "Database error" };
  }
}

/**
 * Trigger a manual sync for the current user's Google Calendar.
 */
export async function triggerGcalSync(): Promise<{ success: boolean; error?: string; result?: SyncResult }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const conn = await getConnection(user.id);
  if (!conn) return { success: false, error: "Not connected to Google Calendar" };

  try {
    const result = await syncCoach(conn);
    if (result.errors.length > 0) {
      console.error("Gcal sync partial errors:", result.errors);
    }
    return { success: true, result };
  } catch (err) {
    console.error("Manual gcal sync error:", err);
    return { success: false, error: err instanceof Error ? err.message : "Sync failed" };
  }
}
