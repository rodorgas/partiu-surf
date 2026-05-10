# Phase 4 — Completion notes

Status: **landed on `main`**. Final commit `1c5dfba`.

## Files created
- `apps/web/app/api/chat/route.ts` — streaming chat route with two ephemeral
  `cache_control` blocks (system prompt + serialized forecast). Stub fallback
  when `ANTHROPIC_API_KEY` is unset.
- `apps/web/lib/useChat.ts` — shared streaming hook (SSE parser,
  idle/waiting/streaming/error state machine).
- `apps/web/app/api/chat/route.test.ts`
- `apps/web/tests/smoke/chat.spec.ts` (rewritten)
- `apps/web/tests/smoke/chat-cache.spec.ts`

## Files modified
- `apps/web/package.json`, `apps/web/pnpm-lock.yaml` — added
  `@anthropic-ai/sdk@0.95.1`.
- `apps/web/components/Desktop.tsx` — `ChatPanel` consumes `useChat`, renders
  history + streaming + amber/red error bubbles. Suggestion clicks fire send.
- `apps/web/components/Mobile.tsx` — `PeekContents`/`HalfContents`/`FullContents`
  thread a shared `ChatProps`. Suggestion taps expand sheet to `full` AND fire
  send in one gesture.
- `apps/web/app/[spot]/page.tsx` — passes `spot` to both layouts.
- `apps/web/components/{Desktop,Mobile,Mobile.integration}.test.tsx` — updated
  for new `spot` prop, added chat-streaming/429/suggestion tests.

## Test results
- Unit/component (vitest): **15 files / 87 tests passing** (added: 8 chat
  route, 3 Desktop chat, 3 Mobile chat).
- `pnpm tsc --noEmit` clean.
- Smoke tests (`tests/smoke/chat*.spec.ts`) skip-gated on
  `ANTHROPIC_API_KEY`; not exercised yet.

## Commits (newest first)
- `1c5dfba` Phase 4: smoke tests for chat — gated on ANTHROPIC_API_KEY
- `f7c075d` Phase 4: component tests for streaming chat UI
- `e660a64` Phase 4: unit tests for the chat route
- `0863324` Phase 4: wire streaming chat into Desktop + Mobile
- `fce59b7` Phase 4: chat route with Haiku streaming + two cache blocks

## Manual steps still required

1. **`ANTHROPIC_API_KEY` in Vercel env** — set on **Preview** and
   **Production** scopes. Until set, `/api/chat` returns a stub stream tagged
   `[stub] Sem ANTHROPIC_API_KEY no ambiente.` and `X-Chat-Stub: 1`, so local
   dev keeps working.

2. **Anthropic dashboard hard cap** — Settings → Limits → set a **$5/month**
   organization spend cap. This is the actual safety net; the in-app rate
   limiter (`chatLimiter`, 10/h per IP) is the soft layer.

3. **Run the cache smoke once** — with `ANTHROPIC_API_KEY` exported locally:
   ```sh
   pnpm test:e2e tests/smoke/chat-cache.spec.ts
   ```
   Confirms the two `cache_control: ephemeral` blocks are actually hit on the
   second request. If `cacheRead <= 0` on request #2, something is
   invalidating the prefix — most likely a future code change interpolating a
   timestamp into either cached block (there isn't one today).

## Notes / blockers

- **None blocking.** Phase ready for production once the env key + hard cap
  are in place.
- The Anthropic SDK's `toReadableStream()` output shape is consumed
  identically by the in-app client parser (`useChat`), the chat-route unit
  test parser, and the cache-smoke usage scraper. If the SDK ever changes the
  SSE event shape, all three need updating in lockstep.
- The chat route uses `claude-haiku-4-5-20251001` as specified in the plan
  (not the alias `claude-haiku-4-5`) — kept literal to match
  `plan/04-llm-chat.md` §4.2.
- The chat route's history payload deliberately excludes the new user message
  (sent as `message`) — the server appends it. The client's `history` state
  mirrors what was sent to the server *before* this turn.
- Tool use, `compare_spots`, and agentic behavior are deferred per phase doc.
  The chat is a pure Q&A bot today.
