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
import { getCached, setCached } from "./cache";
import type { Forecast, ForecastHour, TideState } from "./data";
import { MOCK_FORECAST } from "./data";
import type { GearKey } from "./forecast-shared";
import { getSpot, type Spot } from "./spots";

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

const FORECAST_NAMESPACE = "forecast";

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

  const cacheKey = `${slug}:${date}:${gear}`;
  const cached = await safeGetCached(cacheKey);
  if (cached) return cached;

  const raw = await fetchRawForecast(spot, date, gear);
  const forecast = adaptRawToForecast(raw, spot);
  await safeSetCached(cacheKey, forecast);
  return forecast;
}

async function safeGetCached(key: string): Promise<Forecast | null> {
  try {
    return await getCached<Forecast>(FORECAST_NAMESPACE, key);
  } catch (err) {
    if (!isRedisMisconfigured(err)) console.warn("getCached failed:", err);
    return null;
  }
}

async function safeSetCached(key: string, value: Forecast): Promise<void> {
  try {
    await setCached(FORECAST_NAMESPACE, key, value);
  } catch (err) {
    if (!isRedisMisconfigured(err)) console.warn("setCached failed:", err);
  }
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
): Promise<RawForecast> {
  const payload = {
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

  const url = forecastEndpoint(payload);

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) return (await res.json()) as RawForecast;
    // Non-2xx — fall through to local script fallback below.
  } catch {
    // Network error in local dev (no /api/forecast route in `next dev`) —
    // fall through.
  }

  // Local-dev escape hatch: when running on a developer machine without Vercel,
  // `next dev` doesn't execute Python functions. We invoke the script directly.
  // In production (VERCEL is set), this branch should never run; if it does,
  // surface the error rather than silently masking a deploy bug.
  if (process.env.VERCEL) {
    throw new Error(
      `forecast endpoint failed at ${url} (no local fallback in Vercel env)`,
    );
  }
  return invokePythonFallback(payload);
}

function forecastEndpoint(payload: Record<string, unknown>): string {
  const base =
    process.env.NEXT_PUBLIC_BASE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(payload)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v) || typeof v === "object") {
      qs.set(k, JSON.stringify(v));
    } else {
      qs.set(k, String(v));
    }
  }
  return `${base}/api/forecast?${qs.toString()}`;
}

/**
 * Local-dev fallback: invoke api/forecast.py via spawnSync. Documented hack —
 * remove once `vercel dev` is in the workflow. Tests should mock fetchRawForecast
 * rather than rely on this path.
 */
function invokePythonFallback(payload: Record<string, unknown>): RawForecast {
  // `process.cwd()` is the app working dir under `next dev`; resolve relative
  // to that. The vendored copy is created by predev so this is safe at runtime.
  const scriptPath = path.resolve(process.cwd(), "api", "forecast.py");
  if (!existsSync(scriptPath)) {
    throw new Error(`local fallback script missing: ${scriptPath}`);
  }
  const result = spawnSync("python3", [scriptPath, JSON.stringify(payload)], {
    encoding: "utf-8",
    timeout: 20_000,
  });
  if (result.status !== 0) {
    throw new Error(
      `python fallback failed (${result.status}): ${result.stderr || result.stdout}`,
    );
  }
  return JSON.parse(result.stdout) as RawForecast;
}

/**
 * Adapt the raw API payload to the `Forecast` shape the components consume.
 * The mock supplies non-forecast metadata (suggestions, welcome, historic,
 * nearby spots) until phases 4-5 derive them from real data.
 */
export function adaptRawToForecast(raw: RawForecast, spot: Spot): Forecast {
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
    flag: r.flag,
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
    historic: MOCK_FORECAST.historic,
  };
}
