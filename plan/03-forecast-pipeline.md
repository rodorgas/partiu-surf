# Phase 3 — Forecast pipeline (real data)

**Goal**: replace mock data with real Open-Meteo + WorldTides + scoring. Page renders real Itamambuca conditions, ISR caches it, Redis caches the upstream API responses.

**Depends on**: phase 1 (UI), phase 2 (Redis + ratelimit).

## Tasks

### 3.1 Port `geometry.py` → `lib/geometry.ts`

`surfcheck/geometry.py` is ~50 lines of pure math. Port verbatim with type annotations.

Functions to port:
- `angle_diff(a, b) → number` (0-180, smallest signed difference unsigned)
- `in_arc(deg, center, half_width) → boolean`
- `deg_to_compass(deg) → string` (N, NNE, NE, ..., NNO)
- `curve(x, points)` (step-curve interpolator used by gear scoring)

Tests verify outputs match Python module for a fixture set of inputs (see Tests section).

### 3.2 Port `fetch.py` → `lib/forecast-fetch.ts`

```ts
const OPEN_METEO_MARINE = 'https://marine-api.open-meteo.com/v1/marine'
const OPEN_METEO_FORECAST = 'https://api.open-meteo.com/v1/forecast'
const TZ = 'America/Sao_Paulo'

export type MarineHour = {
  time: string[]
  swell_wave_height: number[]
  swell_wave_period: number[]
  swell_wave_direction: number[]
}

export async function fetchMarine(lat: number, lon: number, date?: string, days = 1): Promise<MarineHour> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: 'swell_wave_height,swell_wave_period,swell_wave_direction',
    timezone: TZ,
    ...(date ? { start_date: date, end_date: date } : { forecast_days: String(days) }),
  })
  const res = await fetch(`${OPEN_METEO_MARINE}?${params}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Open-Meteo marine: ${res.status}`)
  const data = await res.json()
  return data.hourly
}

export async function fetchForecast(lat: number, lon: number, date?: string, days = 1) {
  // wind_speed_10m, wind_direction_10m, wind_gusts_10m
  // ... mirrors fetch.py:fetch_forecast
}
```

Use `cache: 'no-store'` on the underlying `fetch` because we manage caching ourselves via Upstash (don't double-cache through the fetch cache).

### 3.3 Port `tides.py` → `lib/tides.ts`

WorldTides API call. Skip silently if `WORLDTIDES_API_KEY` env var is missing — same fallback behavior as the Python CLI. The composite scoring rebalances when tide is absent (see `surfcheck/scoring.py`).

### 3.4 Spots config

`apps/web/lib/spots.ts`:

```ts
export type Spot = {
  slug: string         // 'itamambuca'
  name: string         // 'Itamambuca'
  region: string       // 'Ubatuba · SP'
  lat: number
  lon: number
  facing: number       // pico aponta para SSE = 165
  breakType: 'beach' | 'point' | 'reef'
  shelter: { from: number; to: number } | null  // wind shelter arc
  tidePref: 'low' | 'mid' | 'high' | null
  sizeTol: number      // size tolerance for waves
}

export const SPOTS: Record<string, Spot> = {
  itamambuca: { slug: 'itamambuca', name: 'Itamambuca', region: 'Ubatuba · SP', lat: -23.397, lon: -45.039, facing: 165, /* ... */ },
  // mirror surfcheck/config.py:SPOTS — port the tuples verbatim
}
```

**Important**: the Python `SPOTS` is a list of positional tuples. The order is documented in `surfcheck/config.py` header. Port each field by index, not by guessing.

### 3.5 Scoring as a Python serverless function

Don't port `scoring.py`. Deploy it as a Vercel Python function.

`apps/web/api/score.py`:

```python
import json
import sys
from pathlib import Path

# Vendor surfcheck into the deployment so the function can import it.
# At build time, copy ../../../surfcheck → ./_vendored/surfcheck
sys.path.insert(0, str(Path(__file__).parent / '_vendored'))

from surfcheck.scoring import compute
from surfcheck.config import SPOTS, GEAR

def handler(request):
    body = json.loads(request.body)
    spot_slug = body['spot']
    gear = body.get('gear', 'all')
    rows = body['rows']  # hourly rows from the TS side

    # Find spot tuple by slug
    spot = next((s for s in SPOTS if s[0] == spot_slug), None)
    if not spot:
        return json.dumps({'error': 'unknown spot'}), 400

    scored = [compute(r, spot, GEAR[gear]) for r in rows]
    return json.dumps({'scored': scored})
```

`apps/web/vercel.json`:

```json
{
  "functions": {
    "api/score.py": { "runtime": "python3.11" }
  }
}
```

Vendor `surfcheck` into `apps/web/api/_vendored/` at build time:

`apps/web/scripts/vendor-surfcheck.mjs`:

```js
import { cpSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dest = join(here, '..', 'api', '_vendored', 'surfcheck')
const src = join(here, '..', '..', '..', 'surfcheck')
rmSync(dest, { recursive: true, force: true })
cpSync(src, dest, { recursive: true })
console.log('vendored surfcheck →', dest)
```

Wire into `package.json`:

```json
{
  "scripts": {
    "predev": "node scripts/vendor-surfcheck.mjs",
    "prebuild": "node scripts/vendor-surfcheck.mjs"
  }
}
```

### 3.6 The orchestrator — `lib/forecast.ts`

```ts
import { getCached, setCached } from './cache'
import { fetchMarine, fetchForecast } from './forecast-fetch'
import { fetchTideHeights } from './tides'
import { SPOTS, type Spot } from './spots'

export type ForecastDay = { /* shape consumed by Desktop + Mobile components */ }

export async function getForecast(slug: string, date: string): Promise<ForecastDay> {
  const cached = await getCached<ForecastDay>('forecast', `${slug}:${date}`)
  if (cached) return cached

  const spot = SPOTS[slug]
  if (!spot) throw new Error(`unknown spot: ${slug}`)

  const [marine, atm, tide] = await Promise.all([
    fetchMarine(spot.lat, spot.lon, date),
    fetchForecast(spot.lat, spot.lon, date),
    fetchTideHeights(spot.lat, spot.lon, date).catch(() => null),
  ])

  const rows = buildRows(marine, atm, tide)  // align hours, like cli._build_rows

  // Call the Python scoring function
  const scoreRes = await fetch(`${process.env.VERCEL_URL ?? 'http://localhost:3000'}/api/score`, {
    method: 'POST',
    body: JSON.stringify({ spot: slug, gear: 'all', rows }),
  })
  const { scored } = await scoreRes.json()

  const day: ForecastDay = { hours: scored, spot, /* ... */ }
  await setCached('forecast', `${slug}:${date}`, day)
  return day
}
```

### 3.7 Wire into the Server Component

`apps/web/app/[spot]/page.tsx`:

```tsx
import { getForecast } from '@/lib/forecast'
import { Desktop } from '@/components/Desktop'
import { Mobile } from '@/components/Mobile'

export const revalidate = 3600

export default async function SpotPage({ params }: { params: Promise<{ spot: string }> }) {
  const { spot } = await params
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
  const data = await getForecast(spot, today)
  return (
    <>
      <div className="layout-desktop"><Desktop data={data} /></div>
      <div className="layout-mobile"><Mobile data={data} /></div>
    </>
  )
}

export async function generateStaticParams() {
  return Object.keys(SPOTS).map(slug => ({ spot: slug }))
}
```

Default redirect from `/` to `/itamambuca` (or geolocation-based later) via `app/page.tsx`.

### 3.8 On-demand revalidation

`apps/web/app/api/refresh/route.ts`:

```ts
import { revalidateTag } from 'next/cache'
import { invalidate } from '@/lib/cache'

export async function POST(req: Request) {
  const secret = req.headers.get('x-refresh-secret')
  if (secret !== process.env.REFRESH_SECRET) return new Response('forbidden', { status: 403 })
  const { spot } = await req.json()
  await invalidate('forecast', spot ? `${spot}:*` : undefined)
  revalidateTag('forecast')
  return Response.json({ ok: true })
}
```

Set `REFRESH_SECRET` as a Vercel env var. Used by a daily cron and manually if needed.

## Tests

### Unit tests

- `lib/geometry.test.ts`: parity table — for each `(input, expected)` pair from a Python-generated fixture, assert TS implementation matches. Generate the fixture once with a tiny Python script (`scripts/gen-geometry-fixtures.py`) that imports `surfcheck.geometry` and dumps to JSON.
- `lib/forecast-fetch.test.ts`: mock `global.fetch` to return canned Open-Meteo JSON, assert `fetchMarine` returns the expected shape.
- `lib/tides.test.ts`: assert returns `null` when env var is missing; mocked WorldTides response parses correctly.
- `lib/forecast.test.ts`: with mocked Redis (cache hit), `getForecast` returns cached data without hitting Open-Meteo.

### Integration tests

`lib/forecast.integration.test.ts`:
- Real Redis (ioredis-mock), mocked HTTP. First call: cache miss, all 3 upstream APIs hit, score function called, result cached. Second call: pure cache hit, zero outbound HTTP.
- Cache miss after invalidation: `invalidate('forecast')` then `getForecast` → cache miss again.

`api/score.test.ts` (Python — pytest):
- POST a known input row from the existing CLI test fixtures to the function, assert score matches `surfcheck.scoring.compute()` directly.
- Run `pytest apps/web/api/score_test.py` — vendor path resolution must work.

### Smoke tests

`tests/smoke/forecast.spec.ts` (Playwright):
- Open `/itamambuca`, wait for hydration, assert score wedge shows a valid number 0-10 (not the mock's hardcoded 8.9 unless coincidence — assert the value is parseable).
- Hour table has 13 rows.
- Open page twice within 5s — second load is faster (rough proxy for ISR cache).

`tests/smoke/parity.spec.ts`:
- Run `python -m surfcheck --spot itamambuca --hours 12` and capture the 12 hourly scores.
- Hit `/api/forecast/itamambuca` (or extract from rendered HTML) and capture the 12 hourly scores.
- Assert max diff ≤ 0.1 — the scoring should be byte-identical since Python is the source of truth.

Production smoke:
```bash
# After deploy
curl -fsS https://partiu-surf.vercel.app/itamambuca | grep -E 'score.*[0-9]+\.[0-9]'
curl -fsS https://partiu-surf.vercel.app/api/health | jq -e '.ok'
```

### Cost smoke (run weekly via cron)

`tests/smoke/cost.spec.ts`:
- Hit Upstash dashboard via API; assert command count <50% of free tier (alarm threshold).
- Hit Vercel API; assert function invocations <50% of monthly limit.
- Hit Anthropic dashboard; assert spend <$2.50 (50% of $5 cap).

This catches runaway scrapers or cache misconfigs before they bill you.

## Acceptance criteria

- [ ] `/itamambuca` renders real forecast data (not the hardcoded mock 8.9).
- [ ] Second request within ISR window returns identical HTML in <100ms (POP cache hit).
- [ ] Disabling `WORLDTIDES_API_KEY` doesn't break the page (tide columns absent, composite score still computed).
- [ ] Parity smoke test: TS pipeline + Python scoring matches CLI scoring within ±0.1.
- [ ] `POST /api/refresh` (with secret) clears cache; next request misses Redis.
- [ ] Vitest unit + integration suites pass.
- [ ] Playwright forecast + parity smoke tests pass.
- [ ] Production health + smoke checks pass post-deploy.

## Notes

- The `_build_rows` alignment logic (hours indexed by ISO timestamp) is in `surfcheck/cli.py:_build_row`. Re-implementing it in TS is annoying — consider keeping that logic in Python too, returning aligned rows from `/api/score` or a new `/api/forecast` Python function. Decide before starting; the simpler architecture is **all data assembly in Python**, TS only for fetch + Redis + render.
- If you go all-Python for assembly: TS calls `/api/forecast?spot=...` once, gets the full ForecastDay back, caches in Redis, renders. Cleaner separation.
- The `revalidate = 3600` on the page combined with Redis 12h TTL means: ISR refreshes hourly, but underlying Open-Meteo only gets called every 12h regardless. Two-layer cache works.
- WorldTides has rate limits — be careful in dev. Use the cache aggressively even locally.
