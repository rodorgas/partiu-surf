"use client";

import { useEffect, useState } from "react";
import { TZ } from "./date";

/**
 * Returns the current hour (0–23) in America/Sao_Paulo, refreshed every minute.
 * Returns null when `active` is false — used to skip the timer when the user
 * is viewing a date other than today.
 */
export function useNowHour(active: boolean): number | null {
  const [hour, setHour] = useState<number | null>(null);
  useEffect(() => {
    if (!active) {
      setHour(null);
      return;
    }
    const tick = () => {
      const h = Number(
        new Date().toLocaleString("en-US", {
          timeZone: TZ,
          hour: "2-digit",
          hour12: false,
        }),
      );
      setHour(Number.isFinite(h) ? h : null);
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [active]);
  return hour;
}
