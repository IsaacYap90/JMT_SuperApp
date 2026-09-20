"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  getGcalStatus,
  disconnectGcal,
  triggerGcalSync,
  type GcalConnectionStatus,
} from "@/app/actions/gcal";

/** Readable text for the ?gcal_error= codes the connect/callback routes set. */
const ERROR_TEXT: Record<string, string> = {
  not_configured: "Google Calendar setup is still pending — there is nothing to connect to yet.",
  unauthorized: "Please sign in again, then retry.",
  forbidden: "Only coaches and admins can connect Google Calendar.",
  connect_failed: "Could not start Google sign-in. Please try again.",
};

export function GcalConnect() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<GcalConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);

  function showOk(text: string) {
    setMessage(text);
    setMessageIsError(false);
  }
  function showError(text: string) {
    setMessage(text);
    setMessageIsError(true);
  }

  useEffect(() => {
    loadStatus();
    // Show success/error from OAuth redirect
    const connected = searchParams.get("gcal_connected");
    const error = searchParams.get("gcal_error");
    if (connected === "1") showOk("Google Calendar connected");
    else if (error) showError(ERROR_TEXT[error] || `Connection failed: ${error}`);
  }, [searchParams]);

  async function loadStatus() {
    setLoading(true);
    try {
      const s = await getGcalStatus();
      setStatus(s);
    } catch {
      setStatus({ connected: false, configured: false, google_email: null, connected_at: null, last_synced_at: null });
    }
    setLoading(false);
  }

  async function handleDisconnect() {
    if (!confirm("Disconnect Google Calendar? Events already synced will remain on Google.")) return;
    setDisconnecting(true);
    setMessage("");
    const res = await disconnectGcal();
    if (res.success) {
      showOk("Disconnected");
      await loadStatus();
    } else {
      showError(res.error || "Failed to disconnect");
    }
    setDisconnecting(false);
  }

  async function handleSync() {
    setSyncing(true);
    setMessage("");
    const res = await triggerGcalSync();
    if (res.success && res.result) {
      const r = res.result;
      showOk(`Synced: ${r.created} created, ${r.updated} updated, ${r.deleted} removed`);
      await loadStatus();
    } else {
      showError(res.error || "Sync failed");
    }
    setSyncing(false);
  }

  if (loading) {
    return (
      <section className="bg-jai-card border border-jai-border rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-semibold text-jai-text uppercase tracking-wide">Google Calendar</h2>
        <p className="text-sm text-jai-text">Loading...</p>
      </section>
    );
  }

  return (
    <section className="bg-jai-card border border-jai-border rounded-xl p-4 space-y-3">
      <h2 className="text-sm font-semibold text-jai-text uppercase tracking-wide">Google Calendar</h2>

      {!status?.connected ? (
        <>
          <p className="text-sm text-jai-text">
            Connect your Google account to sync your JMT schedule to a private
            &quot;JMT Schedule&quot; calendar. Your classes, PT sessions, and leave
            will appear on your iPhone/Android.
          </p>
          {status?.configured ? (
            <a
              href="/api/gcal/connect"
              className="inline-flex items-center gap-2 px-4 py-3 bg-jai-blue text-white text-sm font-medium rounded-lg hover:bg-jai-blue/90 transition-all"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              Connect Google Calendar
            </a>
          ) : (
            <>
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="inline-flex items-center gap-2 px-4 py-3 bg-jai-bg border border-jai-border text-jai-text text-sm font-medium rounded-lg opacity-60 cursor-not-allowed"
              >
                Setup pending — not available yet
              </button>
              <p className="text-xs text-jai-text">
                Google Calendar sync has not been set up on this server yet, so
                there is nothing to connect to. Until it is, subscribe to your
                schedule with the calendar link on the Schedule page — it works
                on iPhone and Android today.
              </p>
            </>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-green-400 rounded-full" />
            <span className="text-sm text-white">
              Connected{status.google_email ? ` — ${status.google_email}` : ""}
            </span>
          </div>
          {status.last_synced_at && (
            <p className="text-xs text-jai-text">
              Last synced: {new Date(status.last_synced_at).toLocaleString("en-SG", { timeZone: "Asia/Singapore" })}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="px-4 py-2 bg-jai-blue text-white text-sm font-medium rounded-lg hover:bg-jai-blue/90 disabled:opacity-40 transition-all"
            >
              {syncing ? "Syncing..." : "Sync Now"}
            </button>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/20 text-sm font-medium rounded-lg hover:bg-red-500/20 disabled:opacity-40 transition-all"
            >
              {disconnecting ? "..." : "Disconnect"}
            </button>
          </div>
        </>
      )}

      {message && (
        <p className={`text-sm ${messageIsError ? "text-red-400" : "text-green-400"}`}>
          {message}
        </p>
      )}
    </section>
  );
}
