"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const THRESHOLD = 70;
const MAX_PULL = 120;

export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const touchStart = useRef<number | null>(null);
  const atTop = useRef<boolean>(true);

  useEffect(() => {
    const checkTop = () => {
      atTop.current = window.scrollY <= 0;
    };
    window.addEventListener("scroll", checkTop, { passive: true });
    checkTop();
    return () => window.removeEventListener("scroll", checkTop);
  }, []);

  const onTouchStart = (e: React.TouchEvent) => {
    if (!atTop.current || refreshing) return;
    touchStart.current = e.touches[0].clientY;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStart.current === null || refreshing) return;
    const dy = e.touches[0].clientY - touchStart.current;
    if (dy <= 0) {
      setPull(0);
      return;
    }
    const damped = Math.min(dy * 0.5, MAX_PULL);
    setPull(damped);
  };

  const onTouchEnd = async () => {
    if (touchStart.current === null) return;
    touchStart.current = null;
    if (pull >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPull(THRESHOLD);
      try {
        router.refresh();
        await new Promise((r) => setTimeout(r, 600));
      } finally {
        setRefreshing(false);
        setPull(0);
      }
    } else {
      setPull(0);
    }
  };

  const progress = Math.min(pull / THRESHOLD, 1);
  const showIndicator = pull > 0 || refreshing;

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      {showIndicator && (
        <div
          className="flex items-center justify-center overflow-hidden"
          style={{ height: pull, transition: refreshing ? "height 200ms" : "none" }}
        >
          <div
            className={`w-6 h-6 rounded-full border-2 border-jai-blue/30 border-t-jai-blue ${
              refreshing ? "animate-spin" : ""
            }`}
            style={{
              opacity: progress,
              transform: refreshing ? undefined : `rotate(${progress * 360}deg)`,
            }}
          />
        </div>
      )}
      <div
        style={{
          transform: refreshing ? `translateY(0)` : `translateY(${pull}px)`,
          transition: pull === 0 || refreshing ? "transform 200ms" : "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}
