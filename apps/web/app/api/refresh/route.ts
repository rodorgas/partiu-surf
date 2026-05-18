// On-demand cache bust. Used by:
//   - daily cron (refresh all spots after Open-Meteo's nightly model update)
//   - manual ops when a deploy ships a scoring tweak and we want fresh numbers.
//
// Auth: `x-refresh-secret` header must match REFRESH_SECRET env var. Without
// the secret set, the route refuses every request — deliberate fail-closed so
// a misconfigured prod doesn't expose a cache-invalidation primitive.

import { revalidateTag } from "next/cache";
import { invalidate } from "@/lib/cache";

// Redis caches raw Open-Meteo responses per (slug, date) under `openmeteo:*`.
// Refresh busts those so the next request re-fetches from Open-Meteo. Scoring
// is recomputed on every page render from the raw inputs, so there's no
// scored-output cache to invalidate.
//
// Tide entries (`tide:{lat0.1}_{lon0.1}:{date}`) are deliberately NOT busted
// here. The TS-side tide cache only stores successful WorldTides responses
// (errors are dropped, not cached), and the underlying data doesn't change
// retroactively — re-fetching a 2024-01-15 tide chart would burn a credit
// for the same numbers. If we ever need a tide bust (e.g. station data
// migration), it should be a separate, intentional operation.
const NAMESPACE = "openmeteo";
const TAG = "forecast";

export async function POST(req: Request) {
  const secret = process.env.REFRESH_SECRET;
  if (!secret) {
    return new Response("refresh disabled (REFRESH_SECRET not set)", {
      status: 503,
    });
  }
  if (req.headers.get("x-refresh-secret") !== secret) {
    return new Response("forbidden", { status: 403 });
  }

  let slug: string | undefined;
  let date: string | undefined;
  try {
    const body = (await req.json().catch(() => ({}))) as {
      slug?: unknown;
      date?: unknown;
    };
    if (typeof body.slug === "string") slug = body.slug;
    if (typeof body.date === "string") date = body.date;
  } catch {
    // Empty body is fine — invalidate the whole namespace.
  }

  if (slug && date) {
    // Raw Open-Meteo keys are `openmeteo:${slug}:${date}` — exact match.
    await invalidate(`${NAMESPACE}:${slug}`, date);
    revalidateTag(`${TAG}:${slug}:${date}`, "max");
  } else if (slug) {
    // No single-spot wildcard helper yet — fall back to a full namespace flush.
    // Fine because the namespace is small and refresh runs at most a few times
    // a day. Tighten if we ever cache hundreds of spot:date keys.
    await invalidate(NAMESPACE);
    revalidateTag(`${TAG}:${slug}`, "max");
  } else {
    await invalidate(NAMESPACE);
    // Tag-based ISR bust — page renders that opt into cache tags via
    // 'use cache' get evicted here. Next 16's revalidateTag requires a
    // CacheLife profile; 'max' = expire ASAP.
    revalidateTag(TAG, "max");
  }

  return Response.json({ ok: true, slug: slug ?? null, date: date ?? null });
}
