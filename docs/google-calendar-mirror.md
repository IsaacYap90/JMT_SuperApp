# Google Calendar mirror

JMT OS is the source of truth. Google Calendar is a one-way, private mirror for
each coach; JMT OS never reads or writes the coach's primary calendar.

## Before production

1. In Google Cloud, enable **Google Calendar API** and create a Web OAuth client.
2. Add this redirect URI:
   `https://jmtos.ionicx.ai/api/gcal/callback`
3. Configure the consent screen. Use **Internal** for JMT Google Workspace, or
   add each coach as a test user while an External app remains in Testing.
4. Add these production variables with `vercel env add` (never `.env.local`):
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, and
   `GCAL_TOKEN_ENCRYPTION_KEY` (64-character hex from `openssl rand -hex 32`).
5. Review and apply `20260920060000_google_calendar_sync.sql`.
6. Build a tunnel review link, test with one coach, then deploy after approval.

## Before setup is done, the UI says so

`getGcalStatus()` reports a non-secret `configured` boolean from
`src/lib/gcal/config.ts`, which checks that all four env vars above are present
and well-formed (`GCAL_TOKEN_ENCRYPTION_KEY` must be 64 hex chars;
`GOOGLE_REDIRECT_URI` must be https, or http only on localhost). When it is
false the Profile card shows a disabled **Setup pending** control instead of the
connect link, and `/api/gcal/connect` redirects to
`/profile?gcal_error=not_configured` rather than throwing. That redirect
matters: an unhandled throw in an API route returns a raw 500 body, which Safari
offers to download as a file.

## A plain-http Tailscale preview cannot be the OAuth callback

A local review link such as `http://<machine>.<tailnet>.ts.net:3000` is fine for
looking at the page, but it can never complete Google OAuth:

- Google rejects any redirect URI that is not `https`. The single http exception
  is loopback — `http://localhost` / `http://127.0.0.1` — and a Tailscale host
  is not loopback.
- The redirect URI must also be registered verbatim on the Google Cloud OAuth
  client. An ad-hoc preview hostname is not registered, so Google answers
  `redirect_uri_mismatch` even if the scheme were right.
- The OAuth state cookie is `secure` in production, so it would not be sent back
  over http regardless.

On a Tailscale http preview the correct, expected behaviour is therefore the
**Setup pending** state. To exercise the real OAuth round trip, use the
configured production URL (`https://jmtos.ionicx.ai/api/gcal/callback`) or an
approved https review URL that has been added to the Google Cloud OAuth client
and set as `GOOGLE_REDIRECT_URI` for that environment.

The existing ICS calendar subscription on the Schedule page is untouched and
remains the fallback for coaches while this stays pending.

## What a coach sees

The coach opens Profile, clicks **Connect Google Calendar**, and approves access.
JMT OS creates a secondary calendar called **JMT Schedule**. The iPhone Calendar
app then shows it through the coach's existing Google account sync.

## Safety

The OAuth scope is `calendar.app.created`: Google only permits the app to manage
secondary calendars and events that this app created. Disconnect only revokes the
local connection; it never deletes the coach's Google calendar or events.
