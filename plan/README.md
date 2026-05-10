# partiu.surf — implementation plan

Six phases, mostly sequential. Each `NN-*.md` file is self-contained — an agent should be able to pick up phase N and execute without reading other phases (beyond this README).

## Locked architecture decisions

These were settled before the plan was written. Don't relitigate without checking with the user.

- **Frontend**: Next.js 16 App Router, deployed on Vercel.
- **Rendering**: ISR with `revalidate: 3600` for spot pages. On-demand bust via `revalidateTag()`.
- **Storage**: Upstash Redis only — forecast cache. No surf session log on the web (the existing Python CLI keeps writing to `~/.surfcheck/sessions.jsonl` locally; calibration stays a personal CLI feature). No Postgres, no EC2, no Blob.
- **Backend (BFF)**: lives inside the Next.js app. Server Components for read paths, API routes only for streaming chat + explicit endpoints.
- **Scoring**: keep `surfcheck/scoring.py` as the canonical implementation. Deploy as a Vercel Python serverless function (`apps/web/api/score.py`). Don't port to TS yet — the math is iterating and you don't want two implementations to keep in sync.
- **Other Python modules** (`fetch.py`, `tides.py`, `geometry.py`, `cache.py`): port to TS. Trivial code, single-stack wins.
- **LLM**: Anthropic Claude Haiku 4.5 via streaming, with prompt caching (system prompt + forecast cached as one block). Hard cap on Anthropic dashboard.
- **Rate limiting**: Upstash Ratelimit on every public route (forecast API, chat API).

## Repo layout target

```
/
  surfcheck/              # existing Python CLI — untouched
  surfcheck.py            # CLI shim — untouched
  apps/
    web/                  # Next.js 16 App Router
      app/
      components/
      lib/
      api/score.py        # Python serverless function (Vercel runs it natively)
      public/
      package.json
      next.config.ts
      tsconfig.json
  web/                    # static prototype — DELETE after phase 1
  plan/                   # this folder
  CLAUDE.md
```

The Python CLI (`surfcheck/`) stays at the repo root so `python -m surfcheck` keeps working. The web app sits under `apps/web/`. The Python score function deploys *with* the web app via Vercel's monorepo support.

## Phase order

| # | Phase | Depends on | Outcome |
|---|---|---|---|
| 1 | [Scaffold Next.js + migrate static UI](./01-scaffold-nextjs.md) | — | Mock-data UI deployed on Vercel |
| 2 | [Storage layer (Redis)](./02-storage.md) | — | Provisioned Upstash + cache/ratelimit primitives |
| 3 | [Forecast pipeline (real data)](./03-forecast-pipeline.md) | 1, 2 | Real Open-Meteo + WorldTides + scoring rendering |
| 4 | [LLM chat with Haiku](./04-llm-chat.md) | 3 | Streaming chat in desktop sidebar + mobile sheet |
| 5 | [Production hardening + multi-spot](./05-production-hardening.md) | 1-4 | Custom domain, all spots, hard caps, monitoring |

Phases 1 and 2 are independent — can run in parallel.

## Source-of-truth references

- **Design intent + visual spec**: `web/desktop.jsx`, `web/mobile.jsx`, `web/mobile-shared.jsx`, `web/data.jsx` (the static prototype, already pixel-perfect).
- **Backend logic**: `surfcheck/` Python package. `scoring.py` is the canonical scoring; `fetch.py` shows the Open-Meteo API contract; `cache.py` documents the date-rule for cache TTL.
- **Domain knowledge**: `CLAUDE.md` at repo root.

## Honest expectations per phase

- Phase 1: 1 working session. Mostly mechanical port from CDN-React to Next.js.
- Phase 2: 1 working session. Mostly clicking around Vercel dashboard + writing two thin wrapper files.
- Phase 3: 2-3 working sessions. The Open-Meteo + WorldTides + scoring wiring takes care; parity with the Python CLI matters.
- Phase 4: 1-2 working sessions. Streaming + prompt caching + rate limiting are well-trodden patterns.
- Phase 5: ongoing.
