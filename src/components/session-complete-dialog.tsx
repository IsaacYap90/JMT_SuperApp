"use client";

import { useEffect, useRef, useState } from "react";
import SignaturePad from "signature_pad";

export type CompletePayload = {
  signed_on_paper: boolean;
  client_signature: string;
  paid_amount?: number | null;
};

export function SessionCompleteDialog({
  open,
  memberName,
  saving,
  payPerClass,
  defaultPrice,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  memberName: string;
  saving: boolean;
  // If true, show an "Amount received" input pre-filled with defaultPrice.
  payPerClass?: boolean;
  defaultPrice?: number | null;
  onCancel: () => void;
  onConfirm: (payload: CompletePayload) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const [paper, setPaper] = useState(false);
  const [empty, setEmpty] = useState(true);
  const [amount, setAmount] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setPaper(false);
    setEmpty(true);
    setAmount(defaultPrice != null ? String(defaultPrice) : "");
  }, [open, defaultPrice]);

  useEffect(() => {
    if (!open || paper) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    function resize() {
      if (!canvas) return;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const rect = canvas.getBoundingClientRect();
      const data = padRef.current?.toData() || [];
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      canvas.getContext("2d")?.scale(ratio, ratio);
      padRef.current?.clear();
      if (data.length > 0) padRef.current?.fromData(data);
      setEmpty(padRef.current?.isEmpty() ?? true);
    }

    const pad = new SignaturePad(canvas, {
      backgroundColor: "rgba(255,255,255,0)",
      penColor: "#f5f5f5",
      minWidth: 1.2,
      maxWidth: 2.8,
    });
    padRef.current = pad;
    pad.addEventListener("endStroke", () => setEmpty(pad.isEmpty()));

    resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      pad.off();
      padRef.current = null;
    };
  }, [open, paper]);

  if (!open) return null;

  const clear = () => {
    padRef.current?.clear();
    setEmpty(true);
  };

  const toDataUrl = (): string => {
    const canvas = canvasRef.current;
    if (!canvas || !padRef.current || padRef.current.isEmpty()) return "";
    const src = canvas.getContext("2d");
    if (!src) return "";
    const w = canvas.width;
    const h = canvas.height;
    if (w === 0 || h === 0) return "";

    // Render on white so it reads on any background when replayed.
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    const ctx = out.getContext("2d");
    if (!ctx) return "";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(canvas, 0, 0);
    // Switch strokes from light-grey (canvas colour) to black on export.
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 0 && (d[i] > 200 && d[i + 1] > 200 && d[i + 2] > 200)) {
        d[i] = 17;
        d[i + 1] = 17;
        d[i + 2] = 17;
      }
    }
    ctx.putImageData(img, 0, 0);
    return out.toDataURL("image/png");
  };

  const handleConfirm = () => {
    const amountNum = payPerClass && amount ? parseFloat(amount) : null;
    const paid_amount = Number.isFinite(amountNum) ? amountNum : null;
    if (paper) {
      onConfirm({ signed_on_paper: true, client_signature: "", paid_amount });
      return;
    }
    if (empty) return;
    onConfirm({ signed_on_paper: false, client_signature: toDataUrl(), paid_amount });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onCancel}
    >
      <div
        className="bg-jai-bg border border-jai-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 space-y-4">
          <div>
            <p className="text-sm font-semibold">Complete PT session</p>
            <p className="text-xs text-jai-text/60">Client: {memberName || "—"}</p>
          </div>

          {payPerClass && (
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-jai-text/60 mb-1">
                Amount received (SGD)
              </label>
              <div className="flex items-center gap-2">
                <span className="text-jai-text/60 text-sm">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={defaultPrice != null ? String(defaultPrice) : "0.00"}
                  className="w-full bg-jai-card border border-jai-border rounded-md px-3 py-2 text-sm"
                />
              </div>
              <p className="text-[10px] text-jai-text/50 mt-1">
                Pay-per-class client. Leave blank if not collecting today.
              </p>
            </div>
          )}

          <label className="flex items-center gap-2 text-xs text-jai-text cursor-pointer select-none">
            <input
              type="checkbox"
              checked={paper}
              onChange={(e) => setPaper(e.target.checked)}
              className="w-4 h-4"
            />
            Signed on paper contract (attendance record)
          </label>

          {!paper && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-jai-text/60">
                Client signature
              </p>
              <div className="relative bg-jai-card/50 border border-jai-border rounded-lg overflow-hidden">
                <canvas
                  ref={canvasRef}
                  className="w-full h-40 touch-none block"
                  style={{ touchAction: "none" }}
                />
                {empty && (
                  <p className="absolute inset-0 flex items-center justify-center text-xs text-jai-text/40 pointer-events-none">
                    Client signs here
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={clear}
                disabled={empty}
                className="text-[11px] text-jai-text/60 hover:text-jai-text disabled:opacity-40"
              >
                Clear
              </button>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={onCancel}
              disabled={saving}
              className="flex-1 py-2 text-xs font-medium rounded-lg bg-jai-card border border-jai-border text-jai-text/70 hover:bg-jai-card/60 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={saving || (!paper && empty)}
              className="flex-1 py-2 text-xs font-medium rounded-lg bg-green-500/20 text-green-300 border border-green-500/30 hover:bg-green-500/30 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Mark Completed"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
