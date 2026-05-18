// Spot page — renders a single surf forecast.
//
// Caching layers (top → bottom):
//   1. CDN / ISR: <CachedSpot> opts into Next 16 Cache Components via
//      `'use cache'`. Keyed on (slug, gear, date, today) — the rendered RSC
//      payload (Desktop + Mobile DOM) is what's cached. Warm URL = CDN HIT,
//      no skeleton flash. Past dates use `forecastArchive` (effectively
//      permanent); today/future use `forecastFresh` (1h SWR). The cron at
//      /api/refresh busts via revalidateTag.
//   2. Upstash Redis at the raw-API layer: one entry per (slug, date) shared
//      across every gear — see lib/openmeteo.ts and lib/tides.ts. Scoring
//      runs per request inside CachedSpot; math over ~14 hours is cheap
//      compared to API roundtrips.
//   3. Python lambda: a pure scoring function. TS hands it the cached raw
//      payloads. Climatology stays on the Python side with its own monthly
//      cache.
//
// PPR shape: the page reads only build-time-known data (params via
// generateStaticParams) in its body so a static shell can prerender. The
// request-time reads (searchParams, current time) live inside the Suspense
// child so they don't block the shell — the cold-path fallback uses spot
// metadata only.

import { Suspense } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { notFound } from "next/navigation";
import { Desktop } from "@/components/Desktop";
import { Mobile } from "@/components/Mobile";
import { SpotSkeleton } from "@/components/SpotSkeleton";
import { todayISO } from "@/lib/date";
import { getForecast, normalizeDate, normalizeGear } from "@/lib/forecast";
import type { GearKey } from "@/lib/forecast-shared";
import { SPOTS, SPOT_SLUGS } from "@/lib/spots";

export async function generateStaticParams() {
  return SPOT_SLUGS.map((spot) => ({ spot }));
}

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function SpotPage({
  params,
  searchParams,
}: {
  params: Promise<{ spot: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { spot } = await params;
  if (!SPOTS[spot]) notFound();

  return (
    <Suspense fallback={<SpotSkeleton spot={spot} />}>
      <ResolveAndCache spot={spot} searchParams={searchParams} />
    </Suspense>
  );
}

// Lives inside Suspense so request-time reads (searchParams, current time)
// don't block the prerendered shell. Resolves dispatch state and hands the
// serializable primitives to CachedSpot.
async function ResolveAndCache({
  spot,
  searchParams,
}: {
  spot: string;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const today = todayISO();
  const gear = normalizeGear(firstParam(sp.gear));
  const date = normalizeDate(firstParam(sp.date), today);
  const isPast = date < today;

  return (
    <CachedSpot
      spot={spot}
      gear={gear}
      date={date}
      today={today}
      isPast={isPast}
    />
  );
}

async function CachedSpot({
  spot,
  gear,
  date,
  today,
  isPast,
}: {
  spot: string;
  gear: GearKey;
  date: string;
  today: string;
  isPast: boolean;
}) {
  "use cache";
  // Split per-branch so each call passes a string literal — cacheLife's
  // overloads only resolve one literal at a time.
  if (isPast) cacheLife("forecastArchive");
  else cacheLife("forecastFresh");
  cacheTag("forecast", `forecast:${spot}`, `forecast:${spot}:${date}`);

  const data = await getForecast(spot, date, gear);

  return (
    <>
      <div className="layout-desktop">
        <Desktop data={data} spot={spot} gear={gear} date={date} today={today} />
      </div>
      <div className="layout-mobile">
        <Mobile data={data} spot={spot} gear={gear} date={date} today={today} />
      </div>
    </>
  );
}
