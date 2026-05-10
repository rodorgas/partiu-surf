// Client-safe forecast helpers — types, normalization, URL building.
//
// Split from lib/forecast.ts because that module imports node:child_process
// (the local-dev Python fallback). Anything client components need lives here
// so Turbopack doesn't try to bundle the server-only chunk for the browser.
// The server-side orchestrator (getForecast) lives in lib/forecast.ts and
// re-exports these for callers that don't care about the split.

import { diffDaysISO, isValidISODate, todayISO } from "./date";

export type GearKey = "all" | "bb" | "short" | "trekkinho";
const VALID_GEAR: readonly GearKey[] = ["all", "bb", "short", "trekkinho"];

export function normalizeGear(input: string | undefined | null): GearKey {
  return VALID_GEAR.includes(input as GearKey) ? (input as GearKey) : "all";
}

/**
 * Forecast horizon (in days, inclusive of today). Open-Meteo's free tier
 * comfortably serves 7 forward days for both marine + forecast endpoints,
 * which is also the practical limit before the swell signal gets noisy.
 */
export const FORECAST_DAY_COUNT = 7;
const MAX_FORECAST_OFFSET = FORECAST_DAY_COUNT - 1;

/**
 * Accept ?date= only when (a) it's a real calendar date in YYYY-MM-DD and
 * (b) it falls within [today, today + MAX_FORECAST_OFFSET]. Anything else
 * silently falls back to today so a stale or hand-crafted URL doesn't 500.
 */
export function normalizeDate(
  input: string | undefined | null,
  today: string = todayISO(),
): string {
  if (!isValidISODate(input)) return today;
  const offset = diffDaysISO(input, today);
  if (offset < 0 || offset > MAX_FORECAST_OFFSET) return today;
  return input;
}

/**
 * Canonical spot URL: omits defaults (gear=all, date=today) so links round-
 * trip cleanly to `/${slug}`. Pass `today` from the caller when you have it
 * pre-computed; otherwise it's read here.
 */
export function buildSpotUrl(
  slug: string,
  opts: { gear?: GearKey; date?: string | null; today?: string } = {},
): string {
  const params = new URLSearchParams();
  const gear = opts.gear ?? "all";
  if (gear !== "all") params.set("gear", gear);
  const today = opts.today ?? todayISO();
  if (opts.date && opts.date !== today) params.set("date", opts.date);
  const qs = params.toString();
  return qs ? `/${slug}?${qs}` : `/${slug}`;
}
