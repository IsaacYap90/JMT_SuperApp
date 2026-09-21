/**
 * Google Calendar API client — thin wrapper over REST endpoints.
 * No googleapis SDK (avoids a 30MB dep). Just fetch.
 *
 * Required env:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
 *   GCAL_TOKEN_ENCRYPTION_KEY (for crypto.ts)
 */

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GCAL_BASE = "https://www.googleapis.com/calendar/v3";

// Least-privilege scope: calendar.app.created limits access to ONLY calendars
// and events created by THIS application. The app cannot see, read, edit, or
// delete the user's primary calendar or any other calendar. This is enforced
// by Google at the API level — not just in our code.
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.app.created",
  "openid",
  "email",
];

function clientId(): string {
  const v = process.env.GOOGLE_CLIENT_ID;
  if (!v) throw new Error("GOOGLE_CLIENT_ID not set");
  return v;
}
function clientSecret(): string {
  const v = process.env.GOOGLE_CLIENT_SECRET;
  if (!v) throw new Error("GOOGLE_CLIENT_SECRET not set");
  return v;
}
function redirectUri(): string {
  const v = process.env.GOOGLE_REDIRECT_URI;
  if (!v) throw new Error("GOOGLE_REDIRECT_URI not set");
  return v;
}

/** Build the Google OAuth consent URL. `state` should be a signed CSRF token. */
export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",   // get a refresh_token
    prompt: "consent",        // always show consent → always get refresh_token
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  id_token?: string;
}

/** Exchange an authorization code for tokens. */
export async function exchangeCode(code: string): Promise<TokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google token exchange failed (${res.status}): ${body}`);
  }
  return res.json();
}

/** Refresh an access token using a refresh token. */
export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId(),
      client_secret: clientSecret(),
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google token refresh failed (${res.status}): ${body}`);
  }
  return res.json();
}

/** Decode the email from a Google ID token (JWT). No signature verify needed —
 *  we just got it from Google over HTTPS in the token exchange response. */
export function emailFromIdToken(idToken: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString());
    return payload.email || null;
  } catch {
    return null;
  }
}

// --------------- Calendar API helpers ---------------

interface GCalRequest {
  accessToken: string;
  method?: string;
  path: string;
  body?: unknown;
  query?: Record<string, string>;
}

async function gcalFetch<T = unknown>({ accessToken, method = "GET", path, body, query }: GCalRequest): Promise<T> {
  const url = new URL(`${GCAL_BASE}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Calendar API ${method} ${path} failed (${res.status}): ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface GCalCalendar {
  id: string;
  summary: string;
  timeZone: string;
}

/** Create a secondary calendar. Returns the calendar ID. */
export async function createSecondaryCalendar(accessToken: string, summary: string): Promise<string> {
  const cal = await gcalFetch<GCalCalendar>({
    accessToken,
    method: "POST",
    path: "/calendars",
    body: { summary, timeZone: "Asia/Singapore" },
  });
  return cal.id;
}

export interface GCalEventTime {
  dateTime: string;
  timeZone: string;
}

export interface GCalEvent {
  id?: string;
  summary: string;
  description?: string;
  start: GCalEventTime;
  end: GCalEventTime;
  status?: string;
  extendedProperties?: {
    private?: Record<string, string>;
  };
}

/** Minimal event shape returned while reconciling this app's calendar. */
export interface GCalListedEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  start?: {
    date?: string;
    dateTime?: string;
    timeZone?: string;
  };
  end?: {
    date?: string;
    dateTime?: string;
    timeZone?: string;
  };
  extendedProperties?: {
    private?: Record<string, string>;
  };
}

interface GCalEventsPage {
  items?: GCalListedEvent[];
  nextPageToken?: string;
}

/**
 * List events from the app-owned calendar. Callers must still restrict any
 * mutation to events bearing the private jmt_key marker.
 */
export async function listCalendarEvents(accessToken: string, calendarId: string): Promise<GCalListedEvent[]> {
  const events: GCalListedEvent[] = [];
  let pageToken: string | undefined;

  do {
    const page = await gcalFetch<GCalEventsPage>({
      accessToken,
      path: `/calendars/${encodeURIComponent(calendarId)}/events`,
      query: {
        maxResults: "2500",
        ...(pageToken ? { pageToken } : {}),
      },
    });
    events.push(...(page.items || []));
    pageToken = page.nextPageToken;
  } while (pageToken);

  return events;
}

/** Insert a calendar event. Returns the Google event ID. */
export async function insertEvent(accessToken: string, calendarId: string, event: GCalEvent): Promise<string> {
  const created = await gcalFetch<{ id: string }>({
    accessToken,
    method: "POST",
    path: `/calendars/${encodeURIComponent(calendarId)}/events`,
    body: event,
  });
  return created.id;
}

/** Update an existing calendar event. */
export async function updateEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  event: GCalEvent
): Promise<void> {
  await gcalFetch({
    accessToken,
    method: "PUT",
    path: `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    body: event,
  });
}

/** Delete (cancel) an event. */
export async function deleteEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<void> {
  await gcalFetch({
    accessToken,
    method: "DELETE",
    path: `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
  });
}
