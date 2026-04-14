"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  isNative,
  isBiometricEnabled,
  promptBiometric,
  setBiometricEnabled,
} from "@/lib/biometric";

type GateState = "checking" | "locked" | "unlocked" | "bypass";

export function BiometricGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>(isNative() ? "checking" : "bypass");
  const [retryKey, setRetryKey] = useState(0);
  const router = useRouter();

  useEffect(() => {
    if (!isNative()) {
      setState("bypass");
      return;
    }

    let cancelled = false;

    (async () => {
      const enabled = await isBiometricEnabled();
      if (!enabled) {
        if (!cancelled) setState("bypass");
        return;
      }

      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        if (!cancelled) setState("bypass");
        return;
      }

      if (!cancelled) setState("locked");

      const result = await promptBiometric("Unlock JMT Dashboard");
      if (cancelled) return;

      if (result.ok) {
        setState("unlocked");
      } else if (result.code === "userCancel" || result.code === "appCancel") {
        setState("locked");
      } else if (result.code === "biometryLockout") {
        setState("locked");
      } else {
        await setBiometricEnabled(false);
        await supabase.auth.signOut();
        router.push("/login");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [retryKey, router]);

  if (state === "bypass" || state === "unlocked") {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-jai-bg text-white px-6">
      <div className="w-20 h-20 rounded-full bg-jai-card border border-jai-border flex items-center justify-center mb-6">
        <svg
          className="w-10 h-10 text-jai-blue"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 11c0-1.104.896-2 2-2s2 .896 2 2v4m-4 0h4m-8-8a6 6 0 1112 0v1m-6 15v-2m0 0a8 8 0 01-8-8v-1a8 8 0 0116 0v1a8 8 0 01-8 8z"
          />
        </svg>
      </div>
      <h1 className="text-xl font-semibold mb-2">JMT Dashboard</h1>
      <p className="text-jai-text text-sm mb-8 text-center">
        {state === "checking" ? "Checking…" : "Unlock to continue"}
      </p>
      {state === "locked" && (
        <button
          type="button"
          onClick={() => setRetryKey((k) => k + 1)}
          className="px-6 py-3 bg-jai-blue text-white font-semibold rounded-lg hover:bg-jai-blue/90 transition-all"
        >
          Unlock
        </button>
      )}
    </div>
  );
}
