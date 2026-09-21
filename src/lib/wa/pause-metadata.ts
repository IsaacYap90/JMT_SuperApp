export const PAUSE_OBSERVABILITY_MS = 24 * 60 * 60 * 1000;

export type PauseMetadataWrite = {
  ai_paused: true;
  ai_paused_at: string;
  ai_paused_by: string;
  ai_pause_source: string;
  ai_pause_reason: string;
  ai_pause_expires_at: string;
};

export function buildPauseMetadata(input: {
  pausedBy: string;
  source: string;
  reason: string;
  now?: number;
  durationMs?: number;
}): PauseMetadataWrite {
  const now = input.now ?? Date.now();
  const durationMs = input.durationMs ?? PAUSE_OBSERVABILITY_MS;
  if (!input.pausedBy.trim() || !input.source.trim() || !input.reason.trim()) {
    throw new Error("Pause metadata requires pausedBy, source and reason");
  }
  if (!Number.isFinite(now) || !Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error("Pause metadata requires a valid time and positive duration");
  }
  return {
    ai_paused: true,
    ai_paused_at: new Date(now).toISOString(),
    ai_paused_by: input.pausedBy.trim(),
    ai_pause_source: input.source.trim(),
    ai_pause_reason: input.reason.trim(),
    ai_pause_expires_at: new Date(now + durationMs).toISOString(),
  };
}

export function clearPauseMetadata() {
  return {
    ai_paused: false,
    ai_paused_at: null,
    ai_paused_by: null,
    ai_pause_source: null,
    ai_pause_reason: null,
    ai_pause_expires_at: null,
  } as const;
}

export function refreshedPauseExpiry(now: number = Date.now()): string {
  return new Date(now + PAUSE_OBSERVABILITY_MS).toISOString();
}

export function isMissingPauseMetadataColumn(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; message?: unknown };
  if (e.code === "42703") return true;
  const message = typeof e.message === "string" ? e.message.toLowerCase() : "";
  return message.includes("column") && [
    "ai_paused_at",
    "ai_paused_by",
    "ai_pause_source",
    "ai_pause_reason",
    "ai_pause_expires_at",
  ].some((column) => message.includes(column));
}
