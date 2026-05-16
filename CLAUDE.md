# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running

No build, lint, or test setup. Single runtime dep: `requests`.

```bash
python -m surfcheck                                  # default: arpoador, next 12h
python -m surfcheck --spot prainha --hours 6 --gear bb
python -m surfcheck --days 7                         # daily summary mode
python -m surfcheck --date 2026-05-12                # specific day
python -m surfcheck log --rating 7 --notes "fun"     # log a real session
python -m surfcheck history --limit 30
```

`surfcheck.py` at the repo root is a thin shim; real entry is `surfcheck/cli.py:main`.

Tide enrichment requires `WORLDTIDES_API_KEY` in the environment. Without it, tide columns are silently skipped and tide weight drops out of the composite — the same scan command works either way (see `cli.py:_tide_lookup`).

## Architecture

The pipeline is **fetch → build rows → score → render**, orchestrated by `cli.cmd_scan`:

1. **Fetch** (`fetch.py`, `tides.py`) — Open-Meteo marine + forecast APIs (no key) and optionally WorldTides. Each call returns hourly arrays indexed by ISO timestamp.
2. **Align hours** (`cli._build_rows`) — marine and forecast `time` arrays are zipped via a `t → forecast_index` dict. Tide heights are matched by normalizing ISO strings to `YYYY-MM-DDTHH:00`.
3. **Score** (`scoring.compute`) — composite of three (or four, with tide) sub-scores combined with fixed weights. **All weights live in `compute()` only**; sub-scores return raw 0–10. The weight scheme rebalances when tide is present (`pw_s` weight drops from 5 → 4 to make room for tide weight 1). Editing weights in one place cascades through both modes.
4. **Render** (`render.py`) — three output modes: hourly table (`render_hours` + `render_summary`), multi-day digest (`render_multiday`), session history (`render_history`). The "best window" finder is the longest contiguous run with `score >= 7` and `length >= 2h`.

### Spot and gear data model

Spots are positional tuples in `config.SPOTS`; the index meanings are documented in the file header. Code reads them by index (e.g. `spot[3]` = facing, `spot[4]` = shelter, `spot[6]` = tide_pref, `spot[7]` = size_tol). **If you reorder the tuple, every consumer breaks** — grep for `spot[` across `cli.py` and `scoring.py`.

`GEAR` profiles are dicts with a `power` step-curve (list of `(upper_threshold, score)` tuples consumed by `geometry.curve`) and a `danger_h` height threshold for the ⚠️ flag. The curve maps `swell_height × period / size_tol` (a rough wave-energy proxy) into a 0–10 score, so adding a new gear profile is just designing its curve.

### Geometry helpers

`geometry.py` is the only place doing angular math. `angle_diff` returns 0–180; `in_arc` handles wrap-around at 360°; `shelter_factor` (in `scoring.py`) uses these to compute a 0.3–1.0 multiplier on wind speed when the wind direction sits inside a sheltered arc — gradient-based, not binary.

### Calibration loop

`session.py` writes JSONL to `~/.surfcheck/sessions.jsonl` (one record per logged session, including the predicted score at log time). `calibration_data()` returns parallel `(predicted_scores, user_ratings)` lists for evaluating model accuracy. The CLI doesn't expose calibration analytics yet — that's the natural next layer.

### Timezone handling

All times are naive in `America/Sao_Paulo` (set via `config.TZ` and passed to Open-Meteo). The cutoff in `cmd_scan` strips tzinfo deliberately so it matches the naive ISO strings the APIs return — don't introduce tz-aware datetimes into the row pipeline without converting the API timestamps too.

## Web app — `apps/web/`

Production frontend live on Vercel. Next.js 16 (App Router) + React 19, deployed alongside a single Python serverless function. **`apps/web/AGENTS.md` warns that this Next.js version has breaking changes from training data — read `node_modules/next/dist/docs/` before writing framework code.**

```bash
cd apps/web
pnpm dev          # vendors surfcheck/ then next dev
pnpm build        # vendors surfcheck/ then next build
pnpm test         # vitest
pnpm test:e2e     # playwright
pnpm lint
```

The `plan/` directory contains the original phased plan (scaffold → storage → forecast pipeline → chat → hardening). Phases 1–4 shipped; treat it as historical context, not a roadmap.

### Forecast pipeline (TS ↔ Python split)

**Python owns fetch + row alignment + scoring. TS owns caching and view-model shape.** This avoids porting `cli._build_rows` to TS and keeps the math in one place.

- `api/forecast.py` — Vercel Python function (`@vercel/python@4.3.0`, 512 MB, 15s). Imports the **vendored** `surfcheck/` package from `api/_vendored/surfcheck/` and emits JSON for `(spot, date, gear)`.
- `scripts/vendor-surfcheck.mjs` — copies repo-root `surfcheck/` → `api/_vendored/surfcheck/` on `predev`/`prebuild`. The vendored copy is gitignored (never committed); it's regenerated every build. Vercel's git integration clones the whole repo and the project's `rootDirectory` is set to `apps/web`, so the parent `surfcheck/` is visible at build time and the prebuild step finds it.
- `lib/forecast.ts` — calls `/api/forecast` (via `VERCEL_PROJECT_PRODUCTION_URL` to bypass deployment protection, falling back to `VERCEL_URL`, then `localhost:3000`), caches the result in Upstash Redis (`lib/cache.ts`), and adapts the JSON into the `Forecast` shape the UI consumes. In local dev with no running route, it `spawnSync`s the Python function directly.

**Canonical scoring stays in `surfcheck/scoring.py`** — both the CLI and the web app import from it. Don't reimplement in TS without a deliberate decision to switch sources of truth.

### Routes

- `app/page.tsx` — home / default spot.
- `app/[spot]/page.tsx` — per-spot page; query params `gear`, `date`, `today`.
- `app/api/chat` — streaming Anthropic Haiku 4.5 with two cached prefix blocks (system prompt + per-spot forecast JSON). NDJSON over HTTP, not SSE. Falls back to a canned response when `ANTHROPIC_API_KEY` is unset.
- `app/api/refresh` — cache-bust endpoint (cron + manual ops). Header `x-refresh-secret` gated by `REFRESH_SECRET`; **fails closed** when the env var is unset.
- `app/api/health` — Upstash ping smoke test.

### Storage / external deps

- **Upstash Redis** (`@upstash/redis`, env via `Redis.fromEnv()`): forecast cache, 12h TTL for today/future, permanent for past dates. Namespace `forecast:{slug}:{YYYY-MM-DD}`.
- **Upstash Ratelimit** (`@upstash/ratelimit`) on the chat route.
- **Anthropic SDK** (`@anthropic-ai/sdk`) for chat. Model: Claude Haiku 4.5.
- **Langfuse** (`langfuse` v3) for LLM tracing on `/api/chat`. Singleton in `lib/langfuse.ts` no-ops when keys are unset, so local runs without Langfuse env vars work unchanged. Env: `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL`. **Gotcha:** the SDK auto-reads `LANGFUSE_BASEURL` (no underscore); we use `LANGFUSE_BASE_URL` for readability and pass it explicitly to the constructor. Trace shape: one `chat.message` trace → one `anthropic.messages.stream` generation per request. Final-message capture (output text + token usage incl. `cache_read_input_tokens` / `cache_creation_input_tokens`) and `flushAsync()` run inside `next/server`'s `after()` so the response streams immediately and the lambda stays alive via `waitUntil` until events ship.
- **WorldTides** (optional) for tide enrichment — same key/silent-skip behavior as the CLI.

### Instrumentation / analytics

- **Vercel Web Analytics** (`@vercel/analytics`) + **Speed Insights** (`@vercel/speed-insights`) — mounted in `app/layout.tsx`. Zero-config pageview + Core Web Vitals; dashboard in the Vercel project.
- **PostHog** (`posthog-js` + `posthog-node`) — product analytics, session replay, feature flags, error tracking. Init in `instrumentation-client.ts` (Next.js 16 root-level file that runs before hydration). Server-side captures in `app/api/chat/route.ts` use `next/server`'s `after()` to flush without blocking the streaming response. `lib/posthog-server.ts` extracts the browser's `distinct_id` from the `ph_<key>_posthog` cookie so client and server events join.
- Env: `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` (required to enable; both client and server read it), `NEXT_PUBLIC_POSTHOG_HOST` (optional, defaults to `https://us.i.posthog.com`). When unset, PostHog is silently disabled — same pattern as `ANTHROPIC_API_KEY` / `WORLDTIDES_API_KEY`. LLM observability stays on Langfuse, not PostHog LLM Analytics.

### Vercel account

Deploys go to the **personal** account, not work:

- Team slug: `rodorgas-projects` (internal team id `team_kdlAHsNI9yDB5ShJWdyTzI0U`)
- Project: `surf` — production alias `https://partiu.surf`
- Linked via `apps/web/.vercel/project.json` (committed; safe — just IDs)

The user's default `vercel` CLI auth points at their **work** account. To run CLI commands against this project, pass the personal token explicitly — it lives in the repo root at `.vercel-token` (gitignored, never commit). Pattern:

```bash
_ZO_DOCTOR=0 vercel <cmd> --token "$(cat /Users/rodrigo.orem/Documents/personal/surf/.vercel-token)"
```

The `_ZO_DOCTOR=0` prefix silences a zoxide warning that the CLI emits on stderr in this shell. Don't inline the token value in any committed file — re-read `.vercel-token` each time.

### Deployment gotchas

- Deploys go through the Vercel ↔ GitHub integration; CLI deploys aren't the supported path. The project's `rootDirectory` is set to `apps/web` so the Next.js framework detection finds `package.json` there.
- `vercel.json` sets `excludeFiles` on `api/forecast.py` to keep the Next.js build output (`.next`, `node_modules`, `app/`, `components/`, …) out of the Python lambda bundle.
- Hobby plans gate the deployment-specific hostname behind Vercel Deployment Protection (401 to unauthenticated callers). Self-fetches must use `VERCEL_PROJECT_PRODUCTION_URL`, not `VERCEL_URL` — already handled in `lib/forecast.ts`.
