// On-demand cache bust. Used by:
//   - daily cron (refresh all spots after Open-Meteo's nightly model update)
//   - manual ops when a deploy ships a scoring tweak and we want fresh numbers.
//
// Auth: `x-refresh-secret` header must match REFRESH_SECRET env var. Without
// the secret set, the route refuses every request — deliberate fail-closed so
// a misconfigured prod doesn't expose a cache-invalidation primitive.

import { revalidateTag } from "next/cache";
import { invalidate } from "@/lib/cache";

const NAMESPACE = "forecast";
// Tide entries (`tide:{lat0.1}_{lon0.1}:{date}`) are deliberately NOT busted
// here. The TS-side tide cache only stores successful WorldTides responses
// (errors are dropped, not cached), and the underlying data doesn't change
// retroactively — re-fetching a 2024-01-15 tide chart would burn a credit
// for the same numbers. If we ever need a tide bust (e.g. station data
// migration), it should be a separate, intentional operation.

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
    await invalidate(NAMESPACE, `${slug}:${date}`);
  } else if (slug) {
    // No single-spot wildcard helper yet — fall back to a full namespace flush.
    // Fine because the namespace is small and refresh runs at most a few times
    // a day. Tighten if we ever cache hundreds of spot:date keys.
    await invalidate(NAMESPACE);
  } else {
    await invalidate(NAMESPACE);
  }

  // Tag-based ISR bust — the [spot] page can opt in by tagging its cache hits
  // (phase 4 hookup). Safe to call even if no tagged caches exist yet.
  // Next 16's revalidateTag requires a CacheLife profile; 'max' = expire ASAP.
  revalidateTag(NAMESPACE, "max");

  return Response.json({ ok: true, slug: slug ?? null, date: date ?? null });
}
