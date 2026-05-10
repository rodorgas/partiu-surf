# Phase 5 — Production hardening + multi-spot

**Goal**: ready for actual users. Custom domain, all spots from the Python config wired up, cost ceilings enforced, monitoring in place.

**Depends on**: phases 1-4 all green.

## Tasks

### 5.1 Multi-spot

The Python `surfcheck/config.py` defines a list of spots beyond Itamambuca. Port them all:

- Mirror every `SPOTS` entry into `apps/web/lib/spots.ts`.
- Each spot becomes `/[spot]` route (already wired via `generateStaticParams` in phase 3).
- Add a spot search/picker UI in the desktop top bar and mobile app bar (currently hardcoded to Itamambuca):
  - Search input with substring match against spot names.
  - "Picos perto" list (currently mocked) — phase 5 wires it to real geolocation if the user grants permission, falling back to a default list of popular spots.

Geolocation:
- `navigator.geolocation.getCurrentPosition()` on first visit (with permission gate).
- Sort SPOTS by distance using the `geometry.haversine` helper (port if not already).
- Persist last-picked spot in `localStorage` to skip the prompt on return visits.

### 5.2 Custom domain

In Vercel dashboard:
- Settings → Domains → Add `partiu.surf`.
- Configure DNS at the registrar (A record or CNAME per Vercel's instructions).
- Verify HTTPS, redirect www → apex.

Smoke after: `curl -I https://partiu.surf` returns 200, valid cert.

### 5.3 Daily cache pre-warm cron

`apps/web/app/api/cron/refresh/route.ts`:

```ts
import { revalidateTag } from 'next/cache'
import { invalidate } from '@/lib/cache'
import { SPOTS } from '@/lib/spots'

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('forbidden', { status: 403 })
  }
  await invalidate('forecast')
  for (const slug of Object.keys(SPOTS)) {
    revalidateTag(`forecast-${slug}`)
    // Optionally: pre-fetch each spot to warm Redis before users wake up
    await fetch(`https://partiu.surf/${slug}`, { cache: 'no-store' })
  }
  return Response.json({ ok: true, refreshedAt: new Date().toISOString() })
}
```

`apps/web/vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/refresh", "schedule": "0 8 * * *" }
  ]
}
```

08:00 UTC = 05:00 in São Paulo — refreshed before any surfer wakes up.

### 5.4 Cost ceilings (defensive)

Three hard caps:

- **Anthropic**: $5/month set in dashboard (already done in phase 4).
- **Vercel**: enable "Spend Limits" in Settings → Billing. Hobby is free but Pro overage protection costs nothing to set.
- **Upstash**: free tier auto-throttles (HTTP 429 on commands once you exceed). No billing surprise possible.

### 5.5 Monitoring

- **Vercel Analytics**: enable in dashboard, free tier covers Hobby.
- **Vercel Speed Insights**: enable, gives Core Web Vitals per page.
- **Sentry** (optional): free Developer plan covers a personal project. Wrap the chat route + forecast pipeline in `Sentry.withScope` for error tracking.
- **Cost dashboard**: a single Server Component at `/admin/cost` (gated by `ADMIN_TOKEN` cookie) that aggregates: Upstash command count, Vercel function invocations, Anthropic spend. Read-only, refreshes hourly.

### 5.6 SEO + meta

- `app/layout.tsx`: set `<title>`, `<meta description>`, OG tags, Twitter card.
- Per-spot dynamic metadata: `export async function generateMetadata({ params })` returning `{ title: \`${spot.name} — partiu.surf\`, description: \`Previsão de surf hoje em ${spot.name}, ${spot.region}.\` }`.
- `robots.txt`: allow all but `/api/`, `/admin/`.
- `sitemap.ts` listing all spots.

### 5.7 PWA shell (optional but cheap)

- Add a manifest, icons, service worker that caches static assets.
- Result: "Add to Home Screen" on iOS works, app feels native.
- Don't bother with offline forecast caching — surf data is meaningless when stale.

### 5.8 Accessibility audit

- Run Lighthouse on `/itamambuca` desktop + mobile.
- Score targets: Performance ≥ 90, Accessibility ≥ 90, SEO ≥ 95.
- Fix flagged issues: missing alt text on icons, color contrast on `inkSoft`, missing `aria-label` on icon buttons (the ↑ submit button, the × close button, the grabber).

## Tests

### Smoke tests (run on every prod deploy)

`tests/smoke/prod.spec.ts`:
- `https://partiu.surf` returns 200, valid cert.
- `/itamambuca` renders, hour table has rows.
- `/api/health` returns `{ ok: true }`.
- Every spot in `SPOTS` returns 200 — iterate.
- `/api/cron/refresh` without auth returns 403.
- Lighthouse perf ≥ 85 (some slack vs target).

### Multi-spot tests

`tests/smoke/spots.spec.ts`:
- For each `slug` in SPOTS:
  - GET `/${slug}` returns 200.
  - HTML contains the spot's name.
  - Score wedge shows a number 0-10.
  - Cache header indicates ISR (`x-vercel-cache: HIT` on second request).

### Cost guardrails (run daily via cron)

`tests/smoke/cost-daily.spec.ts`:
- Anthropic spend / days_in_month_so_far × days_in_month projected → if >$5, alert.
- Upstash command count projected for month → if >250k (50% of free), alert.
- Vercel invocations projected → if >500k, alert.

Send alerts to email or Slack via a webhook.

### Load smoke (one-off, before launch)

```bash
# k6 or autocannon — confirm 100 concurrent users don't blow caches
npx autocannon -c 100 -d 30 https://partiu.surf/itamambuca
```

Targets:
- p50 latency <100ms
- p99 latency <500ms
- Zero 5xx errors
- Function invocations during the run <50 (most served from edge cache)

If function invocations spike, ISR isn't working — investigate cache headers.

### Rate-limit penetration test

```bash
for i in {1..20}; do curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST https://partiu.surf/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"spot":"itamambuca","history":[],"message":"oi"}'
done
```

Expect: first 10 return 200, remainder return 429.

### Geolocation smoke

`tests/smoke/geo.spec.ts`:
- Mock browser geolocation to a Rio coordinate.
- Assert "Picos perto" list shows Itamambuca closer than Maranduba (distance-sorted).
- Mock to São Paulo (inland) coordinate → falls back to default list.

## Acceptance criteria

- [ ] All Python `SPOTS` mirrored in TS, each accessible at `/[slug]`.
- [ ] `partiu.surf` resolves with HTTPS.
- [ ] Daily cron runs at 05:00 BRT, evidenced by Vercel logs + Redis writes.
- [ ] Anthropic + Vercel + Upstash spend caps configured.
- [ ] Vercel Analytics + Speed Insights enabled.
- [ ] Lighthouse Performance ≥ 90, Accessibility ≥ 90.
- [ ] Multi-spot smoke test green for every SPOT.
- [ ] Load test: 100 concurrent users, <500ms p99, no 5xx.
- [ ] Cost-guardrail cron runs daily, alerts wired to email/Slack.

## Notes

- **Don't add features in this phase.** Hardening means the existing scope works under stress. Feature creep here is what turns a 1-week launch into a 1-month one.
- Custom domain registration may take 24-48h for DNS + cert propagation. Schedule accordingly.
- The cost-guardrail cron is the most important defensive piece — without it, a forgotten test loop or a viral tweet can quietly drain the LLM budget over a weekend. Set up the alerts before opening to public traffic.
- If usage stays well under free tiers for 90 days, consider this phase "done" — anything more (auth, user accounts, calibration sync) is a new project, not hardening.
