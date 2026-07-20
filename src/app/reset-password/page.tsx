"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

type LinkState = "checking" | "ready" | "invalid";

function ResetPasswordContent() {
  const [linkState, setLinkState] = useState<LinkState>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // The emailed recovery link redirects here either with ?code=... (PKCE)
  // or with tokens in the #fragment (implicit — what Supabase's /verify
  // endpoint actually sends). The fragment is consumed ASYNCHRONOUSLY by the
  // client's detectSessionInUrl, so never conclude "invalid" from one early
  // getUser() — listen for the auth event and only give up after a grace
  // window (E2E 2026-07-20 caught exactly that race).
  useEffect(() => {
    let settled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();

      const ready = () => {
        if (!settled) {
          settled = true;
          setLinkState("ready");
        }
      };

      const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || session) {
          ready();
        }
      });
      unsubscribe = () => sub.subscription.unsubscribe();

      const code = new URLSearchParams(window.location.search).get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) return ready();
      }

      // Supabase's /verify endpoint redirects with tokens in the #fragment
      // (implicit flow). The PKCE-configured browser client does NOT consume
      // those automatically — set the session from them explicitly.
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const access_token = hash.get("access_token");
      const refresh_token = hash.get("refresh_token");
      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        if (!error) {
          window.history.replaceState(null, "", window.location.pathname);
          return ready();
        }
      }

      const { data } = await supabase.auth.getSession();
      if (data.session) return ready();

      setTimeout(async () => {
        if (settled) return;
        const { data } = await supabase.auth.getSession();
        settled = true;
        setLinkState(data.session ? "ready" : "invalid");
      }, 2500);
    })();
    return () => unsubscribe?.();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      return setError("Password must be at least 8 characters.");
    }
    if (password !== confirm) {
      return setError("Passwords don't match.");
    }
    setLoading(true);
    setError("");

    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/");
      router.refresh();
    }
  };

  const inputCls =
    "w-full px-4 py-3 bg-jai-card border border-jai-border rounded-lg text-white focus:outline-none focus:border-jai-blue transition-colors pr-16";

  return (
    <div className="min-h-screen flex items-center justify-center bg-jai-bg px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">Set a new password</h1>
        </div>

        {linkState === "checking" && (
          <p className="text-jai-text text-center">Checking your link...</p>
        )}

        {linkState === "invalid" && (
          <div className="space-y-4 text-center">
            <p className="text-white bg-jai-card border border-jai-border rounded-lg px-4 py-6">
              This reset link is invalid or has expired.
            </p>
            <Link href="/forgot-password" className="block text-jai-blue text-sm">
              Request a new link
            </Link>
          </div>
        )}

        {linkState === "ready" && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-jai-text mb-1">
                New password
              </label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputCls}
                  placeholder="At least 8 characters"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-jai-text hover:text-white"
                >
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm text-jai-text mb-1">
                Confirm new password
              </label>
              <input
                type={showPw ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={inputCls}
                placeholder="Repeat password"
                required
              />
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-jai-blue text-white font-semibold rounded-lg hover:bg-jai-blue/90 disabled:opacity-50 transition-all"
            >
              {loading ? "Saving..." : "Save new password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default dynamic(() => Promise.resolve(ResetPasswordContent), {
  ssr: false,
});
