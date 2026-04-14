"use client";

import { useEffect, useState } from "react";
import { BiometryType } from "@aparajita/capacitor-biometric-auth";
import {
  checkBiometricAvailability,
  isBiometricEnabled,
  isNative,
  promptBiometric,
  setBiometricEnabled,
} from "@/lib/biometric";

type PromptState = "hidden" | "visible" | "saving";

function biometryLabel(type: BiometryType): string {
  switch (type) {
    case BiometryType.faceId:
      return "Face ID";
    case BiometryType.touchId:
      return "Touch ID";
    case BiometryType.fingerprintAuthentication:
      return "fingerprint unlock";
    case BiometryType.faceAuthentication:
      return "face unlock";
    case BiometryType.irisAuthentication:
      return "iris unlock";
    default:
      return "biometric unlock";
  }
}

export function EnableBiometricPrompt({ onDone }: { onDone: () => void }) {
  const [state, setState] = useState<PromptState>("hidden");
  const [label, setLabel] = useState("biometric unlock");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!isNative()) {
        onDone();
        return;
      }
      const already = await isBiometricEnabled();
      if (already) {
        onDone();
        return;
      }
      const check = await checkBiometricAvailability();
      if (!check.available) {
        onDone();
        return;
      }
      if (cancelled) return;
      setLabel(biometryLabel(check.type));
      setState("visible");
    })();

    return () => {
      cancelled = true;
    };
  }, [onDone]);

  if (state === "hidden") return null;

  const handleEnable = async () => {
    setState("saving");
    const result = await promptBiometric(`Enable ${label} for JMT Dashboard`);
    if (result.ok) {
      await setBiometricEnabled(true);
    }
    onDone();
  };

  const handleSkip = () => {
    onDone();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm px-6">
      <div className="w-full max-w-sm bg-jai-card border border-jai-border rounded-2xl p-6 text-white">
        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-jai-blue/10 flex items-center justify-center">
          <svg
            className="w-7 h-7 text-jai-blue"
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
        <h2 className="text-lg font-semibold text-center mb-2">
          Enable {label}?
        </h2>
        <p className="text-jai-text text-sm text-center mb-6">
          Sign in instantly next time by unlocking with {label}. You can turn
          this off anytime in your profile.
        </p>
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleEnable}
            disabled={state === "saving"}
            className="w-full py-3 bg-jai-blue text-white font-semibold rounded-lg hover:bg-jai-blue/90 disabled:opacity-50 transition-all"
          >
            {state === "saving" ? "Enabling…" : `Enable ${label}`}
          </button>
          <button
            type="button"
            onClick={handleSkip}
            disabled={state === "saving"}
            className="w-full py-3 bg-transparent border border-jai-border text-jai-text font-medium rounded-lg hover:bg-jai-card disabled:opacity-50 transition-all"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
