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

type Status = "loading" | "unsupported" | "off" | "on" | "saving";

function biometryLabel(type: BiometryType): string {
  switch (type) {
    case BiometryType.faceId:
      return "Face ID";
    case BiometryType.touchId:
      return "Touch ID";
    case BiometryType.fingerprintAuthentication:
      return "Fingerprint";
    case BiometryType.faceAuthentication:
      return "Face unlock";
    case BiometryType.irisAuthentication:
      return "Iris unlock";
    default:
      return "Biometric";
  }
}

export function BiometricSettingsButton() {
  const [status, setStatus] = useState<Status>("loading");
  const [label, setLabel] = useState("Biometric");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isNative()) {
        if (!cancelled) setStatus("unsupported");
        return;
      }
      const check = await checkBiometricAvailability();
      if (!check.available) {
        if (!cancelled) setStatus("unsupported");
        return;
      }
      setLabel(biometryLabel(check.type));
      const enabled = await isBiometricEnabled();
      if (!cancelled) setStatus(enabled ? "on" : "off");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "unsupported" || status === "loading") return null;

  const handleToggle = async () => {
    setStatus("saving");
    if (status === "on") {
      await setBiometricEnabled(false);
      setStatus("off");
      return;
    }
    const result = await promptBiometric(`Enable ${label} for JMT Dashboard`);
    if (result.ok) {
      await setBiometricEnabled(true);
      setStatus("on");
    } else {
      setStatus("off");
    }
  };

  const isOn = status === "on";
  const isSaving = status === "saving";

  return (
    <div className="flex items-center justify-between w-full px-4 py-3 bg-jai-card border border-jai-border rounded-lg">
      <div className="flex items-center gap-3">
        <svg
          className="w-5 h-5 text-jai-blue"
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
        <div>
          <p className="text-sm text-white font-medium">{label}</p>
          <p className="text-xs text-jai-text">
            {isOn ? "Enabled" : "Use to unlock the app"}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={handleToggle}
        disabled={isSaving}
        className={`relative w-11 h-6 rounded-full transition-colors ${
          isOn ? "bg-jai-blue" : "bg-jai-border"
        } ${isSaving ? "opacity-50" : ""}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
            isOn ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
