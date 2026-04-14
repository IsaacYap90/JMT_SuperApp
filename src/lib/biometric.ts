import { Capacitor } from "@capacitor/core";
import {
  BiometricAuth,
  BiometryError,
  BiometryErrorType,
  BiometryType,
} from "@aparajita/capacitor-biometric-auth";
import { SecureStorage } from "@aparajita/capacitor-secure-storage";

const FLAG_KEY = "jmtdb.biometric.enabled";

export type BiometryCheck = {
  available: boolean;
  type: BiometryType;
  reason?: string;
};

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

export async function checkBiometricAvailability(): Promise<BiometryCheck> {
  if (!isNative()) {
    return { available: false, type: BiometryType.none, reason: "web" };
  }
  try {
    const result = await BiometricAuth.checkBiometry();
    return {
      available: result.isAvailable,
      type: result.biometryType,
      reason: result.isAvailable ? undefined : result.reason,
    };
  } catch (err) {
    return {
      available: false,
      type: BiometryType.none,
      reason: err instanceof Error ? err.message : "unknown",
    };
  }
}

export async function promptBiometric(reason: string): Promise<
  | { ok: true }
  | { ok: false; code: BiometryErrorType | "not_native" | "unknown"; message: string }
> {
  if (!isNative()) {
    return { ok: false, code: "not_native", message: "biometric only runs on native" };
  }
  try {
    await BiometricAuth.authenticate({
      reason,
      cancelTitle: "Cancel",
      allowDeviceCredential: true,
      iosFallbackTitle: "Use Passcode",
      androidTitle: "JMT Dashboard",
      androidSubtitle: "Unlock to continue",
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof BiometryError) {
      return { ok: false, code: err.code, message: err.message };
    }
    return {
      ok: false,
      code: "unknown",
      message: err instanceof Error ? err.message : "unknown",
    };
  }
}

export async function isBiometricEnabled(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const flag = await SecureStorage.get(FLAG_KEY);
    return flag === true || flag === "true";
  } catch {
    return false;
  }
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  if (!isNative()) return;
  if (enabled) {
    await SecureStorage.set(FLAG_KEY, true, false, false);
  } else {
    await SecureStorage.remove(FLAG_KEY);
  }
}
