// Open-Meteo client with Redis cache.
//
// Moved out of the Python lambda so a single Redis entry per (slug, date)
// is shared across all gear variants — scoring is cheap, so we recompute
// per request rather than caching N gear-scored forecasts. The lambda
// accepts the raw payloads we pass in and skips its own Open-Meteo call,
// mirroring how `lib/tides.ts` handles WorldTides.
//
// Shape mirrors `surfcheck.fetch`: marine + atmospheric forecasts returned
// verbatim from Open-Meteo. The lambda accesses `marine["hourly"]` and
// `forecast["hourly"]` directly, so we don't reshape — JSON-stringify and
// hand it back.

import { getCached, setCached } from "./cache";

const MARINE_URL = "https://marine-api.open-meteo.com/v1/marine";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const MARINE_HOURLY =
  "swell_wave_height,swell_wave_period,swell_wave_direction,wave_height";
const FORECAST_HOURLY = "wind_speed_10m,wind_direction_10m,wind_gusts_10m";
const TZ = "America/Sao_Paulo";

/** Raw Open-Meteo responses — opaque blobs the Python lambda re-parses. */
export type OpenMeteoData = {
  marine: unknown;
  atmo: unknown;
};

function namespace(slug: string): string {
  return `openmeteo:${slug}`;
}

export async function getOpenMeteoData(
  slug: string,
  lat: number,
  lon: number,
  date: string,
): Promise<OpenMeteoData | null> {
  try {
    const cached = await getCached<OpenMeteoData>(namespace(slug), date);
    if (cached) return cached;
  } catch (err) {
    if (!isRedisMisconfigured(err)) {
      console.warn("getOpenMeteo cache failed:", err);
    }
  }

  const data = await fetchOpenMeteo(lat, lon, date);
  if (data === null) return null;

  try {
    await setCached(namespace(slug), date, data);
  } catch (err) {
    if (!isRedisMisconfigured(err)) {
      console.warn("setOpenMeteo cache failed:", err);
    }
  }
  return data;
}

async function fetchOpenMeteo(
  lat: number,
  lon: number,
  date: string,
): Promise<OpenMeteoData | null> {
  try {
    const [marine, atmo] = await Promise.all([
      fetchOne(MARINE_URL, lat, lon, date, MARINE_HOURLY),
      fetchOne(FORECAST_URL, lat, lon, date, FORECAST_HOURLY),
    ]);
    if (!marine || !atmo) return null;
    return { marine, atmo };
  } catch (err) {
    console.warn("openmeteo fetch failed:", err);
    return null;
  }
}

async function fetchOne(
  base: string,
  lat: number,
  lon: number,
  date: string,
  hourly: string,
): Promise<unknown | null> {
  const url = new URL(base);
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("timezone", TZ);
  url.searchParams.set("hourly", hourly);
  url.searchParams.set("start_date", date);
  url.searchParams.set("end_date", date);
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    console.warn(`openmeteo non-2xx: ${base} status=${res.status}`);
    return null;
  }
  return res.json();
}

function isRedisMisconfigured(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.message.includes("Failed to parse URL") ||
    err.message.includes("REST_URL") ||
    err.message.includes("REST_TOKEN")
  );
}
