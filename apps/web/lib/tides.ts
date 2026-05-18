// WorldTides client with Redis cache.
//
// Lifted out of the Python lambda: `surfcheck/cache.py` writes to ~/.surfcheck
// which is read-only on Vercel, so the lambda's tide cache was a no-op and
// every cold invocation fired a fresh WorldTides API call. With 5 gear keys
// × 8 spots × 7 days of distinct forecast cache combinations, credits drained
// far faster than the data actually changed. Now TS fetches once per
// (lat-zone, day), Redis-caches, and passes the heights map down to the
// lambda — so the only WorldTides calls left are genuine cache misses.
//
// Cache key rounds lat/lon to 0.1° (~10km) so neighbouring spots share one
// entry. Tide doesn't vary at finer resolution than that — the underlying
// WorldTides station is the same for the whole Rio Sul/Oeste stretch.
//
// Output shape mirrors `surfcheck.tides.fetch_tide_heights`: an
// hour-bucketed dict keyed by `YYYY-MM-DDTHH:00`. The Python lambda hands
// the dict straight to `tide_state` / `score_tide` without re-parsing.

import { addDaysISO, todayISO } from "./date";
import { getCached, setCached } from "./cache";

const WORLDTIDES_URL = "https://www.worldtides.info/api/v3";

export type TideHeights = Record<string, number>;

function zoneNamespace(lat: number, lon: number): string {
  return `tide:${lat.toFixed(1)}_${lon.toFixed(1)}`;
}

/**
 * Hourly tide heights spanning the requested period.
 *
 * Mirrors `surfcheck.tides.fetch_tide_heights`:
 *   - date=null, days=1  → today + tomorrow (handles 24h windows that cross
 *                          midnight, same rule the Python uses)
 *   - date=null, days>1  → exactly `days` days starting today
 *   - date=ISO           → `days` days starting from that date
 *
 * Returns null when WORLDTIDES_API_KEY is unset, or when any per-day fetch
 * fails — callers should treat null as "no tide data" and degrade gracefully
 * (the lambda renders `hasTide:false` for every hour).
 */
export async function getTideHeights(
  lat: number,
  lon: number,
  date: string | null,
  days: number = 1,
): Promise<TideHeights | null> {
  if (!process.env.WORLDTIDES_API_KEY) return null;

  const span = date === null && days === 1 ? 2 : days;
  const start = date ?? todayISO();

  const out: TideHeights = {};
  for (let i = 0; i < span; i++) {
    const iso = addDaysISO(start, i);
    const day = await fetchTideDay(lat, lon, iso);
    if (day === null) return null;
    Object.assign(out, day);
  }
  return out;
}

async function fetchTideDay(
  lat: number,
  lon: number,
  date: string,
): Promise<TideHeights | null> {
  const namespace = zoneNamespace(lat, lon);

  try {
    const cached = await getCached<TideHeights>(namespace, date);
    if (cached) return cached;
  } catch (err) {
    if (!isRedisMisconfigured(err)) console.warn("getTide cache failed:", err);
  }

  const day = await callWorldTides(lat, lon, date);
  if (day === null) return null;

  try {
    await setCached(namespace, date, day);
  } catch (err) {
    if (!isRedisMisconfigured(err)) console.warn("setTide cache failed:", err);
  }
  return day;
}

async function callWorldTides(
  lat: number,
  lon: number,
  date: string,
): Promise<TideHeights | null> {
  // Midnight São Paulo time → epoch seconds. SP is UTC-3 year-round (DST
  // abolished in 2019), so the -03:00 offset is a fixed constant.
  const startTs = Math.floor(
    new Date(`${date}T00:00:00-03:00`).getTime() / 1000,
  );
  const url = new URL(WORLDTIDES_URL);
  url.searchParams.set("heights", "");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("key", process.env.WORLDTIDES_API_KEY!);
  url.searchParams.set("start", String(startTs));
  url.searchParams.set("length", "86400");
  url.searchParams.set("step", "3600");
  url.searchParams.set("localtime", "true");

  let data: { heights?: Array<{ date: string; height: number }>; status?: number; error?: string };
  try {
    const res = await fetch(url, { cache: "no-store" });
    data = await res.json();
  } catch (err) {
    console.warn("worldtides fetch failed:", err);
    return null;
  }
  if (!data.heights) {
    // Quota exhausted, bad key, station mismatch, etc. Don't cache the
    // failure — let the next request retry rather than locking us out.
    console.warn(
      `worldtides error: status=${data.status ?? "?"} error=${data.error ?? "?"}`,
    );
    return null;
  }
  const out: TideHeights = {};
  for (const h of data.heights) {
    // Bucket per hour. Matches the Python: `h["date"][:13] + ":00"`.
    const iso = String(h.date).slice(0, 13) + ":00";
    out[iso] = h.height;
  }
  return out;
}

function isRedisMisconfigured(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.message.includes("Failed to parse URL") ||
    err.message.includes("REST_URL") ||
    err.message.includes("REST_TOKEN")
  );
}
