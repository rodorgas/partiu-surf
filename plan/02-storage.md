# Phase 2 — Storage layer (Upstash Redis)

**Goal**: forecast cache + rate limiting wired up as TS primitives, ready for phases 3 and 4 to consume. No business logic yet — just the wrappers.

**Depends on**: nothing (can run in parallel with phase 1).

## Tasks

### 2.1 Provision Upstash Redis via Vercel Marketplace

In the Vercel dashboard for the project:

1. Storage → Browse Marketplace → Upstash → Redis → Create.
2. Pick the free tier, region closest to São Paulo (`gru1` if available, else `us-east-1`).
3. Connect to the Next.js project. Vercel auto-injects:
   - `KV_REST_API_URL`
   - `KV_REST_API_TOKEN`
   - `KV_REST_API_READ_ONLY_TOKEN`
   - `KV_URL` (raw Redis protocol)

Pull locally:

```bash
cd apps/web
vercel env pull .env.local
```

### 2.2 Install SDKs

```bash
pnpm add @upstash/redis @upstash/ratelimit
```

### 2.3 Cache wrapper — port of `surfcheck/cache.py`

`apps/web/lib/cache.ts`:

```ts
import { Redis } from '@upstash/redis'

export const redis = Redis.fromEnv()

const TODAY_TTL_S = 12 * 60 * 60  // 12h — matches surfcheck/cache.py rule
const TZ = 'America/Sao_Paulo'

function todayISO(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: TZ })  // YYYY-MM-DD
}

export async function getCached<T>(namespace: string, targetDate: string): Promise<T | null> {
  return redis.get<T>(`${namespace}:${targetDate}`)
}

export async function setCached<T>(namespace: string, targetDate: string, data: T): Promise<void> {
  const key = `${namespace}:${targetDate}`
  // Past dates → permanent. Today/future → 12h TTL.
  if (targetDate < todayISO()) {
    await redis.set(key, data)
  } else {
    await redis.set(key, data, { ex: TODAY_TTL_S })
  }
}

export async function invalidate(namespace: string, targetDate?: string): Promise<void> {
  if (targetDate) {
    await redis.del(`${namespace}:${targetDate}`)
  } else {
    // delete all keys in namespace — used by /api/refresh
    let cursor = 0
    do {
      const [next, keys] = await redis.scan(cursor, { match: `${namespace}:*`, count: 100 })
      if (keys.length) await redis.del(...keys)
      cursor = Number(next)
    } while (cursor !== 0)
  }
}
```

Key namespacing convention (consumed by phase 3):

```
forecast:{spot}:{YYYY-MM-DD}     # marine + atmospheric forecast
tide:{spot}:{YYYY-MM-DD}         # tide heights (when WorldTides is enabled)
```

### 2.4 Rate limiter

`apps/web/lib/ratelimit.ts`:

```ts
import { Ratelimit } from '@upstash/ratelimit'
import { redis } from './cache'

// Public forecast JSON — generous, mostly defended by edge cache.
export const forecastLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, '1 m'),
  prefix: 'rl:forecast',
})

// LLM chat — strict, costs real money.
export const chatLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 h'),
  prefix: 'rl:chat',
})

export function clientId(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim()
    ?? req.headers.get('x-real-ip')
    ?? 'anon'
}
```

### 2.5 Health check route (smoke entry point)

`apps/web/app/api/health/route.ts`:

```ts
import { redis } from '@/lib/cache'

export async function GET() {
  const start = Date.now()
  const pong = await redis.ping()
  return Response.json({ ok: pong === 'PONG', latencyMs: Date.now() - start })
}
```

This stays in production — it's how you confirm Upstash is reachable from a deployed function.

## Tests

### Tooling

Vitest is already installed from phase 1. Add an in-memory Redis for unit tests:

```bash
pnpm add -D ioredis-mock @types/ioredis-mock
```

### Unit tests

`lib/cache.test.ts`:
- `setCached` with a past date stores without TTL → `redis.ttl(key)` returns -1.
- `setCached` with today's date stores with TTL ≈ 43200s.
- `setCached` with a future date stores with TTL ≈ 43200s.
- `getCached` returns `null` for missing keys.
- Roundtrip: write JSON, read it back, deep-equal.
- `invalidate(namespace)` removes all keys matching pattern, leaves other namespaces intact.

`lib/ratelimit.test.ts`:
- `chatLimiter.limit('user1')` 10× returns success, 11th returns `success: false`.
- After 1 hour (mock time), limit resets.
- `forecastLimiter` with different IPs are independent.
- `clientId()` reads `x-forwarded-for` first, falls back to `x-real-ip`, then `'anon'`.

### Integration tests

Spin up `ioredis-mock` and point `Redis.fromEnv` at it:

`lib/cache.integration.test.ts`:
- 100 parallel writes + reads with no race conditions.
- TTL math correctness across DST boundary (São Paulo doesn't observe DST anymore but data may include past DST dates).

### Smoke tests

`tests/smoke/health.spec.ts`:
- `GET /api/health` returns `{ ok: true, latencyMs: <number> }` in <500ms locally, <100ms from Vercel POP.

Production smoke (after deploy):
```bash
curl -fsS https://partiu-surf.vercel.app/api/health | jq -e '.ok == true'
```

Add to GH Actions on `deployment_status: success`.

## Acceptance criteria

- [ ] Upstash database provisioned via Vercel Marketplace; env vars present in `.env.local` after `vercel env pull`.
- [ ] `lib/cache.ts` and `lib/ratelimit.ts` exist with the above signatures.
- [ ] `/api/health` returns 200 with `ok: true` both locally and deployed.
- [ ] Vitest suite passes: 6+ unit, 2+ integration tests.
- [ ] Playwright smoke test for `/api/health` passes locally.
- [ ] Deployed health check responds <100ms.

## Notes

- Don't use the `@vercel/kv` package — it's a thin wrapper around `@upstash/redis` and adds no value while doubling the API surface to learn. Use Upstash directly.
- The cache key format (`forecast:{spot}:{date}`) is part of the contract with phase 3. Don't change it later without updating phase 3 references.
- `Ratelimit.slidingWindow` is the right primitive — token bucket would be nicer for bursts but sliding window matches what users intuitively expect ("10 messages per hour").
