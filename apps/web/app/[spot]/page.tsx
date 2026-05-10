// Spot page — renders a single surf forecast.
//
// Caching:
//   - Upstash Redis caches the upstream API/score result for 12h (see lib/cache),
//     keyed by spot+date+gear. The page itself renders dynamically because it
//     reads ?gear from searchParams, but Redis keeps Open-Meteo/WorldTides
//     calls predictable across filter switches.

import { notFound } from "next/navigation";
import { Desktop } from "@/components/Desktop";
import { Mobile } from "@/components/Mobile";
import { getForecast, normalizeGear } from "@/lib/forecast";
import { SPOTS, SPOT_SLUGS } from "@/lib/spots";

export const revalidate = 3600;
// `false` lets us fall through to notFound() for unknown slugs at runtime.
export const dynamicParams = true;

const TZ = "America/Sao_Paulo";

function todayISO(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
}

export async function generateStaticParams() {
  return SPOT_SLUGS.map((spot) => ({ spot }));
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

  const raw = (await searchParams).gear;
  const gear = normalizeGear(Array.isArray(raw) ? raw[0] : raw);

  const data = await getForecast(spot, todayISO(), gear);

  return (
    <>
      <div className="layout-desktop">
        <Desktop data={data} spot={spot} gear={gear} />
      </div>
      <div className="layout-mobile">
        <Mobile data={data} spot={spot} gear={gear} />
      </div>
    </>
  );
}
