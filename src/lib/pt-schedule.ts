/** Shared validation for PT times before they reach the database or calendar. */
const MIN_PT_YEAR = 2000;
const MAX_PT_YEAR = 2100;

export function parsePtScheduledAt(value: string): Date {
  const date = new Date(value);
  if (
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() < MIN_PT_YEAR ||
    date.getUTCFullYear() > MAX_PT_YEAR
  ) {
    throw new Error("Choose a valid PT date between 2000 and 2100");
  }
  return date;
}

export function isValidPtScheduledAt(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    parsePtScheduledAt(value);
    return true;
  } catch {
    return false;
  }
}

export function assertValidPtDuration(value: number): void {
  if (!Number.isInteger(value) || value <= 0 || value > 480) {
    throw new Error("PT duration must be between 1 and 480 minutes");
  }
}
