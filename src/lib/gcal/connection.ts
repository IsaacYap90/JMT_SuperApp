/**
 * Manages gcal_connections rows: reading, creating, refreshing tokens,
 * and disconnecting. All token values are encrypted at rest.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt, decrypt } from "./crypto";
import { refreshAccessToken, type TokenResponse } from "./google-calendar";

export interface GCalConnection {
  id: string;
  user_id: string;
  google_calendar_id: string | null;
  google_email: string | null;
  connected_at: string;
  last_synced_at: string | null;
  revoked_at: string | null;
  token_expires_at: string | null;
}

/** Get the active (non-revoked) connection for a user, or null. */
export async function getConnection(userId: string): Promise<GCalConnection | null> {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("gcal_connections")
    .select("id, user_id, google_calendar_id, google_email, connected_at, last_synced_at, revoked_at, token_expires_at")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw new Error(`Failed to read gcal connection: ${error.message}`);
  return data as GCalConnection | null;
}

/** Get all active connections (for cron sync). */
export async function getAllActiveConnections(): Promise<GCalConnection[]> {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("gcal_connections")
    .select("id, user_id, google_calendar_id, google_email, connected_at, last_synced_at, revoked_at, token_expires_at")
    .is("revoked_at", null);
  if (error) throw new Error(`Failed to read active gcal connections: ${error.message}`);
  return (data || []) as GCalConnection[];
}

/** Create a new connection row with encrypted tokens. */
export async function createConnection(params: {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  googleEmail: string | null;
  googleCalendarId: string | null;
}): Promise<string> {
  const sb = createAdminClient();
  // Upsert: if a revoked row exists for this user, we overwrite it (unique constraint on user_id).
  // If an active row exists, we update it (reconnect flow).
  const { data, error } = await sb
    .from("gcal_connections")
    .upsert(
      {
        user_id: params.userId,
        encrypted_access_token: encrypt(params.accessToken),
        encrypted_refresh_token: encrypt(params.refreshToken),
        token_expires_at: new Date(Date.now() + params.expiresIn * 1000).toISOString(),
        google_email: params.googleEmail,
        google_calendar_id: params.googleCalendarId,
        connected_at: new Date().toISOString(),
        revoked_at: null,
        last_synced_at: null,
      },
      { onConflict: "user_id" }
    )
    .select("id")
    .single();
  if (error) throw new Error(`Failed to create gcal connection: ${error.message}`);
  return data.id;
}

/** Update the google_calendar_id after creating the secondary calendar. */
export async function setCalendarId(connectionId: string, calendarId: string): Promise<void> {
  const sb = createAdminClient();
  const { error } = await sb
    .from("gcal_connections")
    .update({ google_calendar_id: calendarId })
    .eq("id", connectionId);
  if (error) throw new Error(`Failed to set calendar ID: ${error.message}`);
}

/** Get a valid access token, refreshing if expired. Returns the decrypted access token. */
export async function getValidAccessToken(connectionId: string): Promise<string> {
  const sb = createAdminClient();
  const { data: row, error } = await sb
    .from("gcal_connections")
    .select("encrypted_access_token, encrypted_refresh_token, token_expires_at")
    .eq("id", connectionId)
    .single();
  if (error) throw new Error(`Failed to read gcal connection ${connectionId}: ${error.message}`);
  if (!row) throw new Error(`Connection ${connectionId} not found`);

  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0;
  // Refresh 5 minutes before expiry for safety margin
  if (Date.now() < expiresAt - 5 * 60 * 1000) {
    return decrypt(row.encrypted_access_token);
  }

  // Token expired or about to — refresh it
  const refreshToken = decrypt(row.encrypted_refresh_token);
  let tokens: TokenResponse;
  try {
    tokens = await refreshAccessToken(refreshToken);
  } catch (err) {
    // If refresh fails (revoked), mark the connection as dead
    console.error(`Token refresh failed for connection ${connectionId}:`, err);
    throw err;
  }

  // Persist the new access token (and refresh token if Google issued a new one)
  const updates: Record<string, string> = {
    encrypted_access_token: encrypt(tokens.access_token),
    token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
  };
  if (tokens.refresh_token) {
    updates.encrypted_refresh_token = encrypt(tokens.refresh_token);
  }
  const { error: updateError } = await sb.from("gcal_connections").update(updates).eq("id", connectionId);
  if (updateError) throw new Error(`Failed to persist refreshed Google token: ${updateError.message}`);

  return tokens.access_token;
}

/**
 * Get the stored google_calendar_id from any existing row for this user
 * (active OR revoked). Used on reconnect to preserve the app-owned calendar
 * instead of creating a duplicate — the calendar.app.created scope cannot
 * list/search calendars, so we must remember what we created.
 */
export async function getExistingCalendarId(userId: string): Promise<string | null> {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("gcal_connections")
    .select("google_calendar_id")
    .eq("user_id", userId)
    .not("google_calendar_id", "is", null)
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to read existing Google calendar: ${error.message}`);
  return data?.google_calendar_id || null;
}

/** Soft-disconnect: set revoked_at. Does NOT delete the Google calendar. */
export async function revokeConnection(userId: string): Promise<void> {
  const sb = createAdminClient();
  const { error } = await sb
    .from("gcal_connections")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("revoked_at", null);
  if (error) throw new Error(`Failed to disconnect Google Calendar: ${error.message}`);
}

/** Update last_synced_at after a successful sync. */
export async function markSynced(connectionId: string): Promise<void> {
  const sb = createAdminClient();
  const { error } = await sb
    .from("gcal_connections")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", connectionId);
  if (error) throw new Error(`Failed to mark Google Calendar sync: ${error.message}`);
}
