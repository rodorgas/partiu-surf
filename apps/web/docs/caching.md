# Caching strategy

## Principles

1. **Cache the upstream API data, not the score.** Open-Meteo is rate-limited; WorldTides is rate-limited and bills per request. Both are network-bound. Scoring is local math over 24 hours of data — cheap to redo on every request.
2. **One Redis entry per (slug, date), shared across gears.** Users switch gears frequently; we don't want N gear variants in Redis when a single raw payload feeds all of them.
3. **The framework owns per-variant rendered caching.** Cache Components (`'use cache'`) keys the rendered RSC payload by `(slug, gear, date, today, isPast)` — the CDN serves the prerendered shell, the framework cache fills the dynamic hole. We don't duplicate that responsibility in Redis.
4. **Fail open.** Redis is best-effort. When env vars are missing or Upstash errors out, we degrade to a direct API call — the page still renders.

## Layers

```
                ┌──────────────────────┐
                │  CDN (Vercel edge)   │  prerendered shell per (slug)
                └──────────┬───────────┘
                           │ shell HIT, dynamic hole streams
                ┌──────────▼───────────┐
                │  Cache Components    │  RSC payload per
                │  ('use cache')       │  (slug, gear, date, today, isPast)
                └──────────┬───────────┘
                           │ miss
                ┌──────────▼───────────┐
                │  Next.js server      │  scoring runs here per cache miss
                └──────────┬───────────┘
                           │ Redis lookup (raw API data only)
                ┌──────────▼───────────┐
                │  Upstash Redis       │  per (slug, date)
                └──────────┬───────────┘
                           │ miss
                ┌──────────▼───────────┐
                │  Open-Meteo /        │
                │  WorldTides          │
                └──────────────────────┘
```

## Redis namespaces

All keys go through `lib/cache.ts`. The shape is `${namespace}:${targetDate}` with TTL applied by date class:

| Namespace                        | Value                              | TTL today/future | TTL past   | Written by              | Busted by               |
| -------------------------------- | ---------------------------------- | ---------------- | ---------- | ----------------------- | ----------------------- |
| `openmeteo:{slug}:{date}`        | Raw marine + atmospheric JSON      | 12h              | permanent  | `lib/openmeteo.ts`      | `/api/refresh`          |
| `tide:{lat0.1}_{lon0.1}:{date}`  | Raw WorldTides JSON                | 12h              | permanent  | `lib/tides.ts`          | **not busted** (see note) |
| `historic:{slug}:{YYYY-MM}:{gear}` | Monthly climatology              | permanent        | permanent  | `lib/forecast.ts`       | manual / app deploy     |

Past-date entries are permanent because historical forecasts don't change retroactively. Today and future entries get a 12h TTL because Open-Meteo updates its model a few times a day.

> **Tide is deliberately preserved.** WorldTides costs credits per fetch, the underlying station data doesn't change retroactively, and re-fetching `2024-01-15` would burn a credit for the same numbers. If we ever need a tide bust (e.g. station migration), it should be a separate, intentional operation.

## What is *not* cached in Redis

- **Scored Forecasts.** No `forecast:{slug}:{date}:{gear}` entry in Redis. Scoring runs per cache miss. The per-variant cache lives one layer up in Cache Components (`'use cache'` on `CachedSpot`), which caches the *rendered RSC payload* keyed by `(slug, gear, date, today, isPast)`. Two layers, one job — Redis holds raw upstream data shared across gears; Cache Components holds the final HTML/RSC.
- **Adapted view-model.** `adaptRawToForecast` runs every cache miss — same reasoning as scoring.

## The Python lambda

`api/forecast.py` accepts pre-fetched `marine`, `forecast`, and `tideHeights` JSON in the request. When all three are provided, it skips its own API calls and is effectively a pure scoring function. Missing inputs fall back to direct fetches so:

- **CLI** (`python -m surfcheck`) keeps working — no TS-side cache, the lambda fetches.
- **Local dev without Redis env vars** keeps working — TS swallows the cache error and the lambda fetches.

This means the lambda is independently usable; the TS cache is an optimization layer in front of it, not a hard dependency.

## Page-level CDN caching

`app/[spot]/page.tsx` opts into Next 16 Cache Components (`cacheComponents: true` in `next.config.ts`). The route is shaped for Partial Prerender (PPR): a static shell prerenders for every slug listed in `generateStaticParams`, and a `<Suspense>`-wrapped dynamic hole resolves the request-time variant.

The page splits into three components by who reads what:

| Component         | Where it runs   | Reads                                  |
| ----------------- | --------------- | -------------------------------------- |
| `SpotPage`        | shell           | `params` (build-time-known)            |
| `ResolveAndCache` | inside Suspense | `searchParams`, `todayISO()`           |
| `CachedSpot`      | `'use cache'`   | only serialized props from the parent  |

`CachedSpot` is the cache cell. It wraps the rendered Desktop + Mobile DOM in `'use cache'` keyed by `(slug, gear, date, today, isPast)` and attaches three nested tags:

- `forecast` — full bust
- `forecast:{slug}` — single-spot bust
- `forecast:{slug}:{date}` — single (spot, date) bust across all gears

Cache lifetime branches on `isPast`:

| Profile           | stale | revalidate | expire  | When                  |
| ----------------- | ----- | ---------- | ------- | --------------------- |
| `forecastFresh`   | 60s   | 1h         | 1d      | today / future        |
| `forecastArchive` | 5m    | 30d        | 365d    | past dates            |

`'use cache'` forbids reading `searchParams`/`cookies`/`headers` inside the cached scope, so `ResolveAndCache` does those reads outside and hands `CachedSpot` only serialized primitives. The Suspense fallback uses `<SpotSkeleton spot={spot} />` — gear/date/today are optional on the skeleton precisely so the prerendered shell doesn't depend on request-time data.

On warm hits the CDN serves the cached RSC payload directly with no skeleton flash. On cold misses the shell streams immediately, the dynamic hole resolves through Redis → scoring lambda → cached, and subsequent hits for that variant land on the CDN.

## On-demand invalidation

`POST /api/refresh` (gated by `x-refresh-secret`) clears both the raw Redis cache and the CDN/RSC cache, with granularity that follows the cache tags:

| Body              | Redis                                    | `revalidateTag`                       |
| ----------------- | ---------------------------------------- | ------------------------------------- |
| empty / no body   | flush all `openmeteo:*`                  | `forecast`                            |
| `{ slug }`        | flush all `openmeteo:*`                  | `forecast:{slug}`                     |
| `{ slug, date }`  | delete `openmeteo:{slug}:{date}` only    | `forecast:{slug}:{date}`              |

All `revalidateTag` calls use the `"max"` profile (SWR — the tag is marked stale and the next request triggers a background refresh). Tide entries are **never** busted by this route (see note above).

The Redis-side namespace flush for `{ slug }` is broader than the tag bust — there's no single-spot Redis wildcard helper yet. Fine because the namespace is small and refresh runs at most a few times a day.

Intended use:
- Daily refresh after Open-Meteo's nightly model update. There's no `crons` entry in `vercel.json` today; the endpoint is ready, but the schedule has to be wired separately (Vercel Cron, external scheduler, or a `crons` block here).
- Manual ops when a deploy ships a scoring tweak and we want fresh numbers.

## Failure modes and degradation

| What fails                  | Effect                                                                 |
| --------------------------- | ---------------------------------------------------------------------- |
| Upstash env vars unset      | Cache reads/writes throw; lib/* swallows the error, fetch falls back   |
| Upstash down                | Same — error swallowed, direct API fetch                               |
| Open-Meteo down             | `getOpenMeteoData` returns `null`; lambda falls back to its own fetch  |
| Open-Meteo down + Redis miss | Lambda fetches directly; if that fails too, 500 propagates up         |
| WorldTides down or no key   | Tide silently dropped; scoring rebalances weights (see `scoring.py`)   |

The chain is: Redis → TS Open-Meteo client → Python lambda fetch. Any layer can fail without breaking the next one.

## Why this shape

The earlier strategy cached scored Forecasts per (slug, date, gear) directly. That had three problems:

1. **Multiplicative growth.** Adding a gear meant ~7× more Redis entries (one per forecast day per spot).
2. **Stale-on-deploy.** A scoring tweak required busting every entry; the lambda would re-derive the same scores from the same upstream data.
3. **Wasted upstream.** A user opening the page on gear A and then gear B fetched Open-Meteo twice (once per cached entry's cold path), even though the two scores came from the same raw data.

Moving the cache one layer up — to the raw API responses — fixes all three. Scoring runs whenever the Cache Components layer misses, but it's local math; the slow tails are the API roundtrips, which are exactly what we now share.

Cache Components on top of that handles the per-variant rendered output — it's the right layer for "this exact URL produced this exact HTML," granular bust by tag, and the upside of warm hits paying neither scoring nor Redis lookup.
