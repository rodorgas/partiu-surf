# partiu.surf

Honest surf scoring for the Brazilian coast — combines swell, wind, tide, and a gear/spot model into a single 0–10 number per hour, with a chat copilot that can talk through the forecast in Portuguese.

Live: **[partiu.surf](https://partiu.surf)**

## What's in here

- **`surfcheck/`** — Python CLI and the canonical scoring engine (Open-Meteo marine + atmospheric, optional WorldTides). Run it standalone in the terminal.
- **`apps/web/`** — Next.js 16 + React 19 frontend deployed on Vercel. Hits a Python serverless function that imports a vendored copy of `surfcheck/`, so the CLI and the website agree on the score by construction.
- **`plan/`** — historical phased plan for the production frontend (scaffold → storage → forecast → chat → hardening). Phases 1–4 shipped.

`CLAUDE.md` is the architecture guide — read it before making non-trivial changes.

## Quick start — CLI

```bash
python -m surfcheck                                  # default: arpoador, next 12h
python -m surfcheck --spot prainha --hours 6 --gear bb
python -m surfcheck --days 7                         # daily summary
python -m surfcheck --date 2026-05-12                # specific day
python -m surfcheck log --rating 7 --notes "fun"     # log a real session
python -m surfcheck history --limit 30
```

Only runtime dep is `requests`. Set `WORLDTIDES_API_KEY` for tide enrichment (optional — the composite score rebalances automatically when tide data is missing).

## Quick start — web app

```bash
cd apps/web
pnpm install
pnpm dev          # vendors surfcheck/ then next dev on :3000
pnpm test         # vitest
pnpm test:e2e     # playwright
```

The dev server expects `ANTHROPIC_API_KEY` (chat — falls back to a canned response if unset) and Upstash env vars (`KV_REST_API_URL` / `KV_REST_API_TOKEN`) for the forecast cache.

## Architecture

```
            CLI                                    Web (Vercel)
   python -m surfcheck                              partiu.surf
            │                                            │
            │                                  ┌─────────▼─────────┐
            │                                  │  Next.js 16 SSR   │
            │                                  │  lib/forecast.ts  │
            │                                  └─┬───────────────┬─┘
            │                                    │               │
            │                       whole-result │               │ stream
            │                              cache ▼               ▼
            │                       ┌────────────────────┐  ┌──────────────┐
            │                       │ Upstash Redis      │  │ Anthropic    │
            │                       │  forecast:  12h    │  │ Haiku 4.5    │
            │                       │  historic:  ∞      │  │ /api/chat    │
            │                       └─────┬──────────┬───┘  └──────────────┘
            │                       miss  │          │  miss
            │                  ┌──────────▼─┐   ┌────▼──────────────┐
            │                  │/api/forecast│   │/api/climatology  │
            │                  │Vercel Python│   │Vercel Python      │
            │                  │daily +scored│   │N-year monthly avg │
            │                  └──────┬──────┘   └────┬──────────────┘
            │                         │ imports vendored │
            └─────────────────┬───────┴──────────────────┘
                              ▼
            ┌────────────────────────────────────────┐
            │   surfcheck/  (canonical Python core)  │
            │   fetch · score · geometry · tides ·   │
            │   climatology                          │
            └───────────────┬───────────────┬────────┘
                            ▼               ▼
                    ┌─────────────┐  ┌──────────────────┐
                    │  Open-Meteo │  │   WorldTides     │
                    │ marine + atm│  │   (optional)     │
                    │  + archive  │  │ ~/.surfcheck/    │◀── CLI tide cache
                    │  (no cache) │  │ cache/*.json     │    (per-day, same
                    └─────────────┘  └──────────────────┘     date rule as Redis)
```

The pipeline is **fetch → align hourly rows → score → render**. Open-Meteo provides marine and atmospheric forecasts; WorldTides optionally adds tide heights. `surfcheck/scoring.py` blends three sub-scores (or four, with tide) using fixed weights that live in one place. Spots are positional tuples with a facing direction, shelter arc, and size tolerance; gear profiles are step-curves that map wave energy to a 0–10.

**Two caches with the same date rule** (past = permanent, today/future = 12h rolling TTL): the CLI caches WorldTides responses to `~/.surfcheck/cache/` as JSON files (Open-Meteo is free, so no point); the web app skips per-API caching and instead Redis-caches the entire assembled `Forecast` per `(spot, date, gear)`. The CLI also writes `~/.surfcheck/sessions.jsonl` — one record per logged surf session, including the predicted score at log time, for future calibration analysis.

**Monthly climatology** powers the "Comparado à média" card on the web: `surfcheck/climatology.py` averages swH, swT, and the composite score (the typical *daily peak*, not flat hourly mean) for the same calendar month across the past 3 years of Open-Meteo archive data. The web app exposes this through a separate `/api/climatology` function so it can be cached permanently per `(spot, YYYY-MM, gear)` — orthogonal to the 12h daily-forecast cache.
