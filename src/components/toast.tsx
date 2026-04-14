"use client";

import { useEffect, useState } from "react";

type ToastKind = "success" | "error" | "info";
type ToastItem = { id: number; kind: ToastKind; message: string };

const EVENT = "jmt-toast";

export function showToast(message: string, kind: ToastKind = "success") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<Omit<ToastItem, "id">>(EVENT, { detail: { kind, message } }));
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    let counter = 0;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<Omit<ToastItem, "id">>).detail;
      if (!detail) return;
      const id = ++counter;
      setItems((prev) => [...prev, { ...detail, id }]);
      setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    };
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none w-[92vw] max-w-sm">
      {items.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto rounded-xl px-4 py-3 text-sm shadow-lg border backdrop-blur-sm animate-toast-in ${
            t.kind === "success"
              ? "bg-green-500/15 text-green-200 border-green-500/30"
              : t.kind === "error"
              ? "bg-red-500/15 text-red-200 border-red-500/30"
              : "bg-jai-card/80 text-jai-text border-jai-border"
          }`}
        >
          {t.kind === "success" ? "✓ " : t.kind === "error" ? "⚠ " : ""}
          {t.message}
        </div>
      ))}
    </div>
  );
}
