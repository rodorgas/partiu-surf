# Caching strategy

## Principles

1. **Cache the upstream API data, not the score.** Open-Meteo and WorldTides are slow, paid, and rate-limited. Scoring is local math over ~14 hours of data — cheap to redo on every request.
2. **One Redis entry per (slug, date), shared across gears.** Users switch gears frequently; we don't want N gear variants in Redis when a single raw payload feeds all of them.
3. **CDN owns per-URL caching.** Search params (`?gear=…&date=…`) already key the rendered HTML naturally at the CDN layer, so we don't duplicate that responsibility in Redis.
4. **Fail open.** Redis is best-effort. When env vars are missing or Upstash errors out, we degrade to a direct API call — the page still renders.

## Layers

```
                ┌──────────────────────┐
                │  CDN (Vercel edge)   │  HTML per URL = (slug, gear, date)
                └──────────┬───────────┘
                           │ miss
                ┌──────────▼───────────┐
                │  Next.js server      │  scoring runs here per request
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

- **Scored Forecasts.** No `forecast:{slug}:{date}:{gear}` entry. Scoring is per-request. Caching this would create one entry per (slug, date, gear) — five gears × eight spots × seven days = 280 entries that all derive from 56 raw entries. The CDN handles per-URL caching where it belongs.
- **Adapted view-model.** `adaptRawToForecast` runs every request — same reasoning as scoring.

## The Python lambda

`api/forecast.py` accepts pre-fetched `marine`, `forecast`, and `tideHeights` JSON in the request. When all three are provided, it skips its own API calls and is effectively a pure scoring function. Missing inputs fall back to direct fetches so:

- **CLI** (`python -m surfcheck`) keeps working — no TS-side cache, the lambda fetches.
- **Local dev without Redis env vars** keeps working — TS swallows the cache error and the lambda fetches.

This means the lambda is independently usable; the TS cache is an optimization layer in front of it, not a hard dependency.

## Page-level CDN caching

`app/[spot]/page.tsx` sets `export const revalidate = 3600` and `generateStaticParams` lists all known spot slugs. With no search params, the route is statically generated and cached at the edge for 1h, then revalidated.

`await searchParams` makes the route dynamically rendered, so `?gear=…&date=…` variants are not CDN-cached today. Two paths to fix that, neither implemented yet:

- **Path-based URLs** (`/{spot}/{date}/{gear}`) — every variant becomes a static segment, fully CDN-cacheable.
- **Cache Components / `'use cache'`** — keep search params, wrap the data layer with `'use cache'` so the framework cache + CDN handle the variants.

Until one of those lands, gear/date switches fall through to `<Suspense>` + skeleton on the cold path. That's acceptable: the most common access pattern is the default URL (`/{spot}`), which does get CDN-cached.

## On-demand invalidation

`POST /api/refresh` (gated by `x-refresh-secret`) clears the cache:

- No body, or empty body → flush all `openmeteo:*` keys.
- `{ slug }` → flush all `openmeteo:*` (no single-spot wildcard helper yet; the namespace is small enough that a full flush is fine).
- `{ slug, date }` → delete the single `openmeteo:{slug}:{date}` key.

Every call also fires `revalidateTag("forecast", "max")` so any Next.js framework-cached HTML evicts. Tide entries are **never** busted by this route (see note above).

Used by:
- Daily cron after Open-Meteo's nightly model update.
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

Moving the cache one layer up — to the raw API responses — fixes all three. Scoring re-runs on every page render but it's local math; the slow tails are the API roundtrips, which are exactly what we now share.
