export function haptic(kind: "tap" | "success" | "error" = "tap"): void {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  if (kind === "tap") navigator.vibrate(15);
  else if (kind === "success") navigator.vibrate([20, 40, 20]);
  else navigator.vibrate([40, 60, 40, 60, 40]);
}
