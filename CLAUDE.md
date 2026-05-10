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

## Web frontend (under construction)

- `web/` — static prototype (HTML + React via CDN, mock data). Pixel-perfect implementation of the Claude Design handoff. **Will be migrated into `apps/web/` as a Next.js app and then deleted.**
- `plan/` — phased implementation plan for the production frontend (Next.js 16 on Vercel + Upstash Redis + Anthropic Haiku chat). Read `plan/README.md` first.

`surfcheck/scoring.py` stays the canonical scoring implementation. The web app will deploy it as a Python serverless function (`apps/web/api/score.py`) rather than reimplementing the math in TS — don't port it without a deliberate decision to make TS the source of truth.
