// Spot page — renders a single surf forecast.
//
// Two-layer cache:
//   - ISR (revalidate = 3600) caches the rendered HTML per spot+date at the
//     Vercel POP.
//   - Upstash Redis caches the upstream API/score result for 12h (see lib/cache).
//   The double layer keeps Open-Meteo + WorldTides calls predictable even
//   under traffic spikes.

import { notFound } from "next/navigation";
import { Desktop } from "@/components/Desktop";
import { Mobile } from "@/components/Mobile";
import { getForecast } from "@/lib/forecast";
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
}: {
  params: Promise<{ spot: string }>;
}) {
  const { spot } = await params;
  if (!SPOTS[spot]) notFound();

  const data = await getForecast(spot, todayISO());

  return (
    <>
      <div className="layout-desktop">
        <Desktop data={data} spot={spot} />
      </div>
      <div className="layout-mobile">
        <Mobile data={data} spot={spot} />
      </div>
    </>
  );
}
