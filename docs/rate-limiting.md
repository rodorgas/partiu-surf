# Rate limiting

How partiu.surf protects its expensive paths from abuse and accidental loops. Update this file in the same PR that adds, removes, or retunes a limiter.

## Stack

`@upstash/ratelimit` on top of `@upstash/redis`. Sliding-window algorithm — counts requests in a rolling window of the configured duration, no thundering-herd at window boundaries the way fixed-window limiters have. All limiters share one Upstash instance, namespaced by per-limiter `prefix:`.

Source: `apps/web/lib/ratelimit.ts`. Helpers: `clientId(req)` extracts the caller IP from `x-forwarded-for` → `x-real-ip` → `'anon'`.

## Current limiters

| Limiter            | Window         | Where applied        | Why this number                                                                 |
|--------------------|----------------|----------------------|---------------------------------------------------------------------------------|
| `forecastLimiter`  | 60 / minute    | (reserved — public forecast JSON, currently mostly defended by edge cache) | Generous because the forecast path is mostly cached; this is a safety net, not the primary defence. |
| `chatLimiter`      | 10 / hour      | `POST /api/chat`     | Strict — each request is an Anthropic call that costs real money. 10/h is enough for an engaged user and cheap to over-spend on accidents. |
| `subscribeLimiter` | 5 / 10 minutes | `POST /api/subscribe`| Slow path. Confirmation flow already prevents fake addresses from landing in the active list, so this only needs to defend against drive-by spam and accidental double-clicks. Each signup writes ~4 Redis keys and will eventually trigger an outbound email/WhatsApp once delivery ships. |

## How a request flows

```
┌────────┐    POST /api/...    ┌──────────────────┐
│ client │ ───────────────────▶│ Next.js route    │
└────────┘                     │                  │
                               │ 1. clientId(req) │── x-forwarded-for[0]
                               │                  │
                               │ 2. limiter.limit │──────┐
                               │    (clientId)    │      │
                               │                  │      ▼
                               │                  │  ┌────────────────┐
                               │                  │  │ Upstash Redis  │
                               │                  │  │ (sliding-      │
                               │                  │  │  window count) │
                               │                  │  └────────────────┘
                               │                  │      │
                               │ 3a. success: proceed◀───┘
                               │ 3b. !success: 429
                               │     + Retry-After
                               └──────────────────┘
```

`limiter.limit(id)` returns `{ success, remaining, reset }`. On the success path we proceed and surface `X-RateLimit-Remaining` so well-behaved clients can self-throttle. On the rejection path we return `429` with `Retry-After` in seconds and a friendly pt-BR message.

## Identification — choosing the right key

Today every limiter keys on `clientId(req)` which is the caller IP. That's the right default but has known edge cases:

- **Corporate NAT / mobile carriers** can put many users behind one IP. A single bad actor on the same network can starve everyone else. Acceptable for current scale.
- **`'anon'` bucket** — when no IP header is present (mostly local dev), every caller shares one bucket. Fine in dev, won't happen in prod behind Vercel.
- **No cookie/account binding** — anyone can rotate IPs to bypass. Acceptable for now because the underlying cost per request is bounded (Haiku is cheap, Resend hasn't shipped yet). When we add accounts, switch authenticated routes to key on user id instead of IP — IP becomes a fallback only.

## Adding a new limiter

1. Define the limiter in `lib/ratelimit.ts` with a unique `prefix:` (no collisions — there's a test that asserts this).
2. Pick a window based on what each request *costs* — money, downstream rate limits, write amplification — not on what feels safe.
3. In the route: call `await limiter.limit(clientId(req))` **before** parsing the body. Rejecting early on a 429 is cheaper than parsing JSON only to discard it.
4. On reject, return `429` with `Retry-After` and `X-RateLimit-Remaining`. Use a friendly pt-BR error message — this is user-visible.
5. On accept, set `X-RateLimit-Remaining` on the success response too. Clients use it to back off proactively.

## Testing

Upstash's `Ratelimit` uses Redis Lua scripts (`evalsha`) that the in-memory mock in `lib/__mocks__/upstash-redis-memory.ts` does not implement. **Don't try to support `evalsha` in the mock** — it's not worth the complexity. Instead, in route tests, substitute the limiter directly with a deterministic counter:

```ts
const { ratelimitState } = vi.hoisted(() => ({
  ratelimitState: { requests: new Map<string, number>(), cap: 5 },
}));

vi.mock("@/lib/ratelimit", () => ({
  subscribeLimiter: {
    limit: vi.fn(async (id: string) => {
      const used = ratelimitState.requests.get(id) ?? 0;
      ratelimitState.requests.set(id, used + 1);
      return {
        success: used < ratelimitState.cap,
        remaining: Math.max(0, ratelimitState.cap - used - 1),
        reset: Date.now() + 600_000,
      };
    }),
  },
  clientId: (req: Request) =>
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon",
}));
```

See `app/api/chat/route.test.ts` and `app/api/subscribe/route.test.ts` for the live versions.

For `lib/ratelimit.ts` itself, only the prefix wiring and `clientId()` need direct tests — the actual sliding-window behavior is upstream's responsibility.

## When a limiter starts paging us

A 429 in production usually means one of three things:

1. **Genuine abuse** — block the IP at Vercel's firewall, don't loosen the limiter.
2. **A loop in our own code** (e.g. a stuck client retrying without backoff) — fix the client, don't loosen the limiter.
3. **The limit was set wrong for actual usage** — only then retune. Bump the cap, ship, watch the dashboard, retune again. Don't pre-emptively widen "to be safe."

Avoid the temptation to add per-route exemptions for "trusted" callers — every exemption is a future bypass.
