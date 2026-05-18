// Forecast orchestrator (TS side).
//
// Architectural decision (Phase 3, mirrored in api/forecast.py):
//   Python owns fetch + row alignment + scoring. TS owns Redis caching and
//   shape adaptation to the existing `Forecast` type the UI components consume.
//   This avoids a fragile TS port of cli._build_rows and keeps math in one place.
//
// Flow: getForecast(slug, date)
//   → check Upstash Redis ('forecast' namespace)
//   → on miss, call /api/forecast (Vercel Python function in prod; spawnSync
//     fallback in local dev when VERCEL is unset and the route 404s)
//   → cache the assembled Forecast and return it.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { getPermanent, setPermanent } from "./cache";
import type { Forecast, ForecastHour, Historic, TideState } from "./data";
import { MOCK_FORECAST } from "./data";
import type { GearKey } from "./forecast-shared";
import { getOpenMeteoData, type OpenMeteoData } from "./openmeteo";
import { getSpot, type Spot } from "./spots";
import { getTideHeights, type TideHeights } from "./tides";

// Re-export client-safe helpers so server callers can keep importing
// everything from `lib/forecast`. Client components must import directly
// from `lib/forecast-shared` (this module pulls in node:child_process).
export {
  buildSpotUrl,
  FORECAST_DAY_COUNT,
  normalizeDate,
  normalizeGear,
  type GearKey,
} from "./forecast-shared";

/** Raw shape returned by api/forecast.py. */
export type RawForecastHour = {
  h: string;
  isoTime: string;
  score: number;
  swH: number;
  swT: number;
  swDir: number;
  wKmh: number;
  wDir: number;
  gust: number;
  tideH: number;
  tide: TideState;
  hasTide: boolean;
  flag: string;
  winner: string;
  isPeak?: boolean;
};

export type RawForecast = {
  generatedAt: string;
  spot: {
    slug: string;
    name: string;
    region: string;
    facing: number;
    breakType: string;
    tidePref: string;
    waterTemp: number;
    sunrise: string;
    sunset: string;
    bestWindow: string;
    todayPeak: number;
  };
  hours: RawForecastHour[];
  hasTide: boolean;
  gear: string;
};

const HISTORIC_NAMESPACE = "historic";

/**
 * Public entry point — used by app/[spot]/page.tsx.
 *
 * Redis is treated as best-effort: in local dev without Upstash env vars set
 * (and during integration tests that don't mock @upstash/redis), get/set will
 * throw. We swallow those errors so the page still renders. In production
 * Redis is always provisioned via Vercel Marketplace, so this is a no-op.
 */
export async function getForecast(
  slug: string,
  date: string,
  gear: GearKey = "auto",
): Promise<Forecast> {
  const spot = getSpot(slug);
  if (!spot) throw new Error(`unknown spot: ${slug}`);

  // Cache lives at the *raw API* layer — one Redis entry per (slug, date)
  // shared across every gear. Scoring is cheap (math over ~14 hours) so we
  // recompute it per request rather than caching N gear variants. Tide and
  // historic also have their own caches (see lib/tides.ts, getPermanent below).
  const openMeteoP = safeGetOpenMeteo(spot, date);
  const historicP = safeGetHistoric(spot, date, gear);
  const tideP = safeGetTide(spot, date);

  const [openMeteo, tide, historic] = await Promise.all([
    openMeteoP,
    tideP,
    historicP,
  ]);

  // Lambda now takes raw inputs and just scores — Open-Meteo + WorldTides
  // calls all happen on the TS side so they share a single Redis cache.
  const raw = await fetchRawForecast(spot, date, gear, openMeteo, tide);
  const forecast = adaptRawToForecast(raw, spot, historic);
  return forecast;
}

async function safeGetOpenMeteo(
  spot: Spot,
  date: string,
): Promise<OpenMeteoData | null> {
  try {
    return await getOpenMeteoData(spot.slug, spot.lat, spot.lon, date);
  } catch (err) {
    console.warn("getOpenMeteoData failed:", err);
    return null;
  }
}

async function safeGetTide(
  spot: Spot,
  date: string,
): Promise<TideHeights | null> {
  try {
    return await getTideHeights(spot.lat, spot.lon, date);
  } catch (err) {
    console.warn("getTideHeights failed:", err);
    return null;
  }
}

function historicCacheKey(slug: string, date: string, gear: GearKey): string {
  // Per calendar month — climatology doesn't change day-to-day.
  const yyyymm = date.slice(0, 7);
  return `${HISTORIC_NAMESPACE}:${slug}:${yyyymm}:${gear}`;
}

async function safeGetHistoric(
  spot: Spot,
  date: string,
  gear: GearKey,
): Promise<Historic | null> {
  const key = historicCacheKey(spot.slug, date, gear);
  try {
    const cached = await getPermanent<Historic | null>(key);
    if (cached !== null && cached !== undefined) return cached;
  } catch (err) {
    if (!isRedisMisconfigured(err)) console.warn("getHistoric cache failed:", err);
  }

  let historic: Historic | null = null;
  try {
    historic = await fetchHistoric(spot, date, gear);
  } catch (err) {
    console.warn("fetchHistoric failed:", err);
    return null;
  }

  if (historic !== null) {
    try {
      await setPermanent(key, historic);
    } catch (err) {
      if (!isRedisMisconfigured(err)) console.warn("setHistoric cache failed:", err);
    }
  }
  return historic;
}

/**
 * Heuristic: Upstash throws `TypeError: Failed to parse URL from /pipeline`
 * when env vars are missing. Don't spam the log for this expected dev case.
 */
function isRedisMisconfigured(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.message.includes("Failed to parse URL") ||
    err.message.includes("REST_URL") ||
    err.message.includes("REST_TOKEN")
  );
}

/** Fetch the raw Python output. Exposed for testing. */
export async function fetchRawForecast(
  spot: Spot,
  date: string,
  gear: GearKey = "auto",
  openMeteo: OpenMeteoData | null = null,
  tideHeights: TideHeights | null = null,
): Promise<RawForecast> {
  const payload = buildSpotPayload(spot, date, gear);
  // Always pass `tideHeights` (even when empty) so the lambda knows TS
  // owns the WorldTides call and doesn't fall back to its own fetch.
  // Absent param ⇒ CLI/local-dev path inside the lambda.
  (payload as Record<string, unknown>).tideHeights = JSON.stringify(
    tideHeights ?? {},
  );
  // Same contract for Open-Meteo: when TS supplied the data (Redis-cached),
  // pass it through and the lambda skips its own Open-Meteo fetch. When
  // unavailable (e.g. fetch failed), omit so the lambda falls back to a
  // direct call — degrades gracefully.
  if (openMeteo) {
    (payload as Record<string, unknown>).marine = JSON.stringify(openMeteo.marine);
    (payload as Record<string, unknown>).forecast = JSON.stringify(openMeteo.atmo);
  }
  return invokePython<RawForecast>("forecast", payload);
}

/** Fetch monthly climatology from `/api/climatology`. Exposed for testing. */
export async function fetchHistoric(
  spot: Spot,
  date: string,
  gear: GearKey = "auto",
): Promise<Historic | null> {
  const payload = buildSpotPayload(spot, date, gear);
  const body = await invokePython<{ historic: Historic | null }>(
    "climatology",
    payload,
  );
  return body.historic ?? null;
}

function buildSpotPayload(spot: Spot, date: string, gear: GearKey) {
  return {
    slug: spot.slug,
    name: spot.name,
    region: spot.region,
    lat: spot.lat,
    lon: spot.lon,
    facing: spot.facing,
    sizeTol: spot.sizeTol,
    breakType: spot.breakType,
    tidePref: spot.tidePref,
    shelter: spot.shelter,
    gear,
    date,
  };
}

async function invokePython<T>(
  endpoint: "forecast" | "climatology",
  payload: Record<string, unknown>,
): Promise<T> {
  const url = vercelEndpoint(endpoint, payload);
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) return (await res.json()) as T;
    // Non-2xx — fall through to local script fallback below.
  } catch {
    // Network error in local dev (no route in `next dev`) — fall through.
  }
  if (process.env.VERCEL) {
    throw new Error(
      `${endpoint} endpoint failed at ${url} (no local fallback in Vercel env)`,
    );
  }
  return invokePythonFallback<T>(endpoint, payload);
}

function vercelEndpoint(
  path: "forecast" | "climatology",
  payload: Record<string, unknown>,
): string {
  // VERCEL_URL points to the deployment-specific hostname, which is gated by
  // Vercel's "Deployment Protection" on hobby projects (401 to anyone without
  // a Vercel session). Self-fetch from the runtime SSR pass blows up there.
  // VERCEL_PROJECT_PRODUCTION_URL is the public production alias and is what
  // we want; fall back to VERCEL_URL only when the production alias isn't set
  // (e.g. preview deploys without protection disabled).
  const host =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  const base =
    process.env.NEXT_PUBLIC_BASE_URL ??
    (host ? `https://${host}` : "http://localhost:3000");
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(payload)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v) || typeof v === "object") {
      qs.set(k, JSON.stringify(v));
    } else {
      qs.set(k, String(v));
    }
  }
  return `${base}/api/${path}?${qs.toString()}`;
}

/**
 * Local-dev fallback: invoke the Python function via spawnSync. Documented hack —
 * remove once `vercel dev` is in the workflow. Tests should mock fetchRawForecast
 * rather than rely on this path.
 */
function invokePythonFallback<T>(
  endpoint: "forecast" | "climatology",
  payload: Record<string, unknown>,
): T {
  // `process.cwd()` is the app working dir under `next dev`; resolve relative
  // to that. The vendored copy is created by predev so this is safe at runtime.
  const scriptPath = path.resolve(process.cwd(), "api", `${endpoint}.py`);
  if (!existsSync(scriptPath)) {
    throw new Error(`local fallback script missing: ${scriptPath}`);
  }
  const result = spawnSync("python3", [scriptPath, JSON.stringify(payload)], {
    encoding: "utf-8",
    timeout: 30_000,
  });
  if (result.status !== 0) {
    throw new Error(
      `python fallback failed (${result.status}): ${result.stderr || result.stdout}`,
    );
  }
  return JSON.parse(result.stdout) as T;
}

/**
 * Adapt the raw API payload to the `Forecast` shape the components consume.
 * The mock supplies non-forecast metadata (suggestions, welcome, nearby spots)
 * until later phases derive them from real data. Historic comes from a separate
 * climatology fetch (null when unavailable — the UI hides its card).
 */
export function adaptRawToForecast(
  raw: RawForecast,
  spot: Spot,
  historic: Historic | null = null,
): Forecast {
  const hours: ForecastHour[] = raw.hours.map((r) => ({
    h: r.h,
    score: r.score,
    swH: r.swH,
    swT: Math.round(r.swT),
    swDir: r.swDir,
    wKmh: r.wKmh,
    wDir: r.wDir,
    gust: r.gust,
    tideH: r.tideH,
    tide: r.tide,
    hasTide: r.hasTide,
    flag: r.flag,
    winner: r.winner,
  }));

  return {
    hours,
    spot: {
      name: raw.spot.name,
      region: spot.region,
      facing: raw.spot.facing,
      breakType: raw.spot.breakType,
      waterTemp: raw.spot.waterTemp,
      sunrise: raw.spot.sunrise,
      sunset: raw.spot.sunset,
      bestWindow: raw.spot.bestWindow,
      todayPeak: raw.spot.todayPeak,
    },
    spots: MOCK_FORECAST.spots,
    suggestions: MOCK_FORECAST.suggestions,
    welcome: MOCK_FORECAST.welcome,
    historic,
  };
}
