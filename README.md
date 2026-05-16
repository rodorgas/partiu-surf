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
            │                              cache │               │ stream
            │                                    ▼               ▼
            │                            ┌──────────────┐  ┌──────────────┐
            │                            │ Upstash Redis│  │ Anthropic    │
            │                            │   12h TTL    │  │ Haiku 4.5    │
            │                            └──────┬───────┘  │ /api/chat    │
            │                                   │ miss     └──────────────┘
            │                            ┌──────▼──────────┐
            │                            │ /api/forecast   │
            │                            │ Vercel Python   │
            │                            └──────┬──────────┘
            │                                   │ imports vendored
            └─────────────────┬─────────────────┘
                              ▼
            ┌────────────────────────────────────────┐
            │   surfcheck/  (canonical Python core)  │
            │   fetch · score · geometry · tides     │
            └───────────────┬───────────────┬────────┘
                            ▼               ▼
                    ┌─────────────┐  ┌──────────────┐
                    │  Open-Meteo │  │  WorldTides  │
                    │ marine + atm│  │  (optional)  │
                    └─────────────┘  └──────────────┘
```

The pipeline is **fetch → align hourly rows → score → render**. Open-Meteo provides marine and atmospheric forecasts; WorldTides optionally adds tide heights. `surfcheck/scoring.py` blends three sub-scores (or four, with tide) using fixed weights that live in one place. Spots are positional tuples with a facing direction, shelter arc, and size tolerance; gear profiles are step-curves that map wave energy to a 0–10. The web app deploys the same Python scoring as a Vercel function and caches results in Upstash Redis (12h TTL, permanent for past dates).
