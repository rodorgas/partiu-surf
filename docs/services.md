# Services

Reference for the external services partiu.surf depends on, and *why* each one. When adding or replacing a service, update this file in the same PR.

## Hosting & runtime

### Vercel
Hosts the Next.js app (`apps/web`) and a single Python serverless function (`api/forecast.py`). Picked because the project already had its serverless wiring (`@vercel/python@4.3.0`, 512 MB, 15 s) and we wanted preview deployments per PR for free. Deploys go through the GitHub integration — CLI deploys are not the supported path. Account: personal (`rodorgas-projects` team), production alias `https://partiu.surf`. See `CLAUDE.md` for the personal-token workaround when running `vercel` CLI commands.

### Vercel Analytics + Speed Insights
Zero-config pageview tracking (`@vercel/analytics`) and Core Web Vitals (`@vercel/speed-insights`). Mounted in `app/layout.tsx`. Chosen because they're one import each and ship in the same dashboard as deployments — no extra account, no extra cost on hobby.

## Storage

### Upstash Redis
Serverless Redis over HTTP. Used for three things now: forecast/tide/historic cache (`lib/cache.ts`), rate limiting (`lib/ratelimit.ts`), and **newsletter subscriptions** (`lib/subscriptions.ts`). HTTP-only matters here — Vercel functions are short-lived and can't hold a TCP connection pool, so a normal Redis client would pay handshake cost on every cold start.

For newsletter subscriptions specifically we picked Redis (instead of standing up Postgres) because v1 traffic is single-digit subscribers, the access patterns are trivial (lookup by token, set membership for the cron worker), and the project already had an Upstash instance. The schema is documented in `lib/subscriptions.ts`. **Migration plan:** when subscriber count gets non-trivial (~1K+) or we need reporting/joins (anything beyond "members of set X"), port the module to Postgres without touching callers. Don't add complex query logic to the Redis path — that's the signal to migrate.

### Upstash Ratelimit
Sliding-window limiter built on Upstash Redis. Three limiters wired up: `forecastLimiter` (60/min, generous — mostly defended by edge cache), `chatLimiter` (10/h — LLM costs real money), `subscribeLimiter` (5/10min — drive-by spam + accidental double-clicks). The limiter uses Redis Lua scripts (`evalsha`) — the in-memory test mock in `lib/__mocks__/upstash-redis-memory.ts` doesn't support these, so route tests stub the limiter directly (see `app/api/chat/route.test.ts` and `app/api/subscribe/route.test.ts` for the pattern).

## Weather data

### Open-Meteo
Free marine + atmospheric forecast API (`https://marine-api.open-meteo.com`, `https://api.open-meteo.com`). No API key for non-commercial use. Hourly arrays for swell height/period/direction, wind speed/direction, air temp. Also used for historical climatology (`surfcheck/climatology.py` → `https://archive-api.open-meteo.com`). Chosen because it's free, no rate-limit headaches at this volume, and the hourly granularity matches the scoring pipeline. Treated as the source of truth for "what conditions will be" — if it's wrong, the score is wrong, and we accept that.

Not "OpenWeather" — that's a different (paid) service we deliberately avoided.

### WorldTides
Tide-height API (`https://www.worldtides.info/api/v3`). Optional — gated on `WORLDTIDES_API_KEY` being set. Without the key, tide columns are silently skipped and tide weight drops out of the composite score (`scoring.compute` rebalances). Paid (~$0.001/request). Picked over the free alternatives because the data was cleaner and the hourly interpolation matched what we needed. Cache aggressively (`tide:{spot}:{YYYY-MM-DD}`, permanent for past dates, 12 h TTL for today/future) to keep costs in the cents.

## LLM

### Anthropic API
Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) for the in-app chat. Direct API, no gateway. Two cached prefix blocks per request (system prompt + per-spot forecast JSON) — after the first hit per spot/day, both are ~90% cheaper. Picked Haiku over Sonnet because the chat use case is short-form conditions Q&A, not deep reasoning; Sonnet was overkill. The route has a stub mode that returns canned text when `ANTHROPIC_API_KEY` is unset, so local dev works without a key.

### Langfuse
LLM observability — traces every `/api/chat` request with one `chat.message` trace + one `anthropic.messages.stream` generation per request, including token usage and cache hit/miss counts. Singleton in `lib/langfuse.ts` no-ops when keys are unset, so local runs work unchanged. Picked over PostHog LLM Analytics because Langfuse's per-generation cache-token reporting is what we actually optimize against. **Gotcha:** the SDK auto-reads `LANGFUSE_BASEURL` (no underscore); we use `LANGFUSE_BASE_URL` for readability and pass it explicitly to the constructor.

## Analytics & ops

### PostHog
Product analytics, session replay, feature flags, error tracking. Client side init in `instrumentation-client.ts` (Next.js 16 root-level file that runs before hydration). Server-side captures use `next/server`'s `after()` so they don't block streaming responses. `lib/posthog-server.ts` extracts the browser's `distinct_id` from the `ph_<key>_posthog` cookie so client and server events join. Picked because it bundles four things we'd otherwise pay for separately, and the free tier (1M events/month) is plenty for current traffic. **Scope discipline:** LLM observability stays on Langfuse — don't move it to PostHog LLM Analytics without a deliberate decision.

## Email delivery (planned, not yet wired)

### Resend (recommended)
For the newsletter confirmation + digest emails. Not yet implemented — when wiring up, prefer Resend over the alternatives because: free tier is generous (3K emails/month, 100/day, one custom domain on the free plan), the API is the simplest of the lot (`{ from, to, subject, html }`), it pairs with React Email for templating (matches our React stack), and the deliverability is well-regarded for cold domains. Picked over Postmark (similar quality but no free tier), SendGrid (heavier API, free tier became stingier), and Amazon SES (cheapest at scale but the most setup — sender verification, sandbox mode, separate IAM — not worth it at single-digit-subscriber volume).

When you wire it up: the `confirmToken` should leave `/api/subscribe`'s response and be sent via Resend instead. Same for `unsubscribeToken` (include it in the email footer link).

### WhatsApp delivery (planned)
For the WhatsApp channel of the newsletter. Recommended path: Meta WhatsApp Cloud API directly (no Twilio markup, free tier of 1K conversations/month). Note: WhatsApp template messages need pre-approval from Meta — a "your surf digest" template should be submitted as soon as the schema is stable.
