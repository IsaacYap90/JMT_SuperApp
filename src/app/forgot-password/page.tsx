"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";

function ForgotPasswordContent() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    // Always show the sent state on success; Supabase already avoids
    // confirming whether the email exists.
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSent(true);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-jai-bg px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">Reset password</h1>
          <p className="text-jai-text mt-2">
            Enter your JMT OS email and we&apos;ll send you a reset link.
          </p>
        </div>

        {sent ? (
          <div className="space-y-4 text-center">
            <p className="text-white bg-jai-card border border-jai-border rounded-lg px-4 py-6">
              If that email has an account, a reset link is on its way.
              Check your inbox (and spam folder).
            </p>
            <Link href="/login" className="block text-jai-blue text-sm">
              Back to login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-jai-text mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-jai-card border border-jai-border rounded-lg text-white focus:outline-none focus:border-jai-blue transition-colors"
                placeholder="you@email.com"
                required
              />
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-jai-blue text-white font-semibold rounded-lg hover:bg-jai-blue/90 disabled:opacity-50 transition-all"
            >
              {loading ? "Sending..." : "Send reset link"}
            </button>

            <Link
              href="/login"
              className="block text-center text-sm text-jai-text hover:text-white transition-colors"
            >
              Back to login
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}

export default dynamic(() => Promise.resolve(ForgotPasswordContent), {
  ssr: false,
});
