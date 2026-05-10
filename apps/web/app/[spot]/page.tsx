// Spot page — renders a single surf forecast.
//
// Caching:
//   - Upstash Redis caches the upstream API/score result for 12h (see lib/cache),
//     keyed by spot+date+gear. The page itself renders dynamically because it
//     reads ?gear and ?date from searchParams, but Redis keeps Open-Meteo /
//     WorldTides calls predictable across filter switches.

import { notFound } from "next/navigation";
import { Desktop } from "@/components/Desktop";
import { Mobile } from "@/components/Mobile";
import { todayISO } from "@/lib/date";
import { getForecast, normalizeDate, normalizeGear } from "@/lib/forecast";
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
