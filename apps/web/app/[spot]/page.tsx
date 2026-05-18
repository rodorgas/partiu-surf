// Spot page — renders a single surf forecast.
//
// Caching:
//   - Upstash Redis caches the upstream API/score result for 12h (see lib/cache),
//     keyed by spot+date+gear. The page itself renders dynamically because it
//     reads ?gear and ?date from searchParams, but Redis keeps Open-Meteo /
//     WorldTides calls predictable across filter switches.
//
// Streaming:
//   - The slow `getForecast` call is wrapped in <Suspense> so the page shell
//     (skeleton with spot name + region) streams immediately. The data-bound
//     UI fills in when the Python lambdas resolve — turns a 4–7s blank into
//     an instant paint that progressively reveals.

import { Suspense, use } from "react";
import { notFound } from "next/navigation";
import { Desktop } from "@/components/Desktop";
import { Mobile } from "@/components/Mobile";
import { SpotSkeleton } from "@/components/SpotSkeleton";
import type { Forecast } from "@/lib/data";
import { todayISO } from "@/lib/date";
import { getForecast, normalizeDate, normalizeGear } from "@/lib/forecast";
import type { GearKey } from "@/lib/forecast-shared";
import { SPOTS, SPOT_SLUGS } from "@/lib/spots";

export const revalidate = 3600;
// `false` lets us fall through to notFound() for unknown slugs at runtime.
export const dynamicParams = true;

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

  const sp = await searchParams;
  const today = todayISO();
  const gear = normalizeGear(firstParam(sp.gear));
  const date = normalizeDate(firstParam(sp.date), today);

  // Kick off the fetch synchronously here so the slow IO starts at request
  // arrival, in parallel with React's render of the Suspense shell. The
  // child awaits the promise; React 19 suspends and streams the fallback.
  const forecastPromise = getForecast(spot, date, gear);

  // Keyed so client-side navigation between dates/gears re-suspends instead
  // of showing stale content during refetch.
  return (
    <Suspense
      key={`${spot}:${date}:${gear}`}
      fallback={<SpotSkeleton spot={spot} gear={gear} date={date} today={today} />}
    >
      <SpotContent
        forecastPromise={forecastPromise}
        spot={spot}
        gear={gear}
        date={date}
        today={today}
      />
    </Suspense>
  );
}

// Sync component that suspends on the promise via React 19's `use()`. Behaves
// identically to an async server component for streaming SSR, but works under
// testing-library's client renderer too (async function components don't
// auto-resolve there).
function SpotContent({
  forecastPromise,
  spot,
  gear,
  date,
  today,
}: {
  forecastPromise: Promise<Forecast>;
  spot: string;
  gear: GearKey;
  date: string;
  today: string;
}) {
  const data = use(forecastPromise);

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
