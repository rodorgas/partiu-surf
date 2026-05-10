# Phase 4 — LLM chat with Claude Haiku 4.5

**Goal**: working streaming chat in the desktop sidebar and mobile bottom sheet, backed by Anthropic Haiku with prompt caching, rate-limited per user.

**Depends on**: phase 3 (chat needs forecast data as context).

## Tasks

### 4.1 Anthropic SDK

```bash
pnpm add @anthropic-ai/sdk
```

Set env vars in Vercel:
- `ANTHROPIC_API_KEY`
- Configure a **hard monthly cap of $5** in the Anthropic console (Settings → Limits). This is the actual safety net — rate limiting is the soft layer, the hard cap is the floor.

### 4.2 Chat route

`apps/web/app/api/chat/route.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk'
import { chatLimiter, clientId } from '@/lib/ratelimit'
import { getForecast } from '@/lib/forecast'

export const runtime = 'nodejs'  // Edge would also work; Node is simpler for streaming.

const client = new Anthropic()

export async function POST(req: Request) {
  const id = clientId(req)
  const { success, remaining, reset } = await chatLimiter.limit(id)
  if (!success) {
    return new Response(JSON.stringify({
      error: 'rate_limited',
      message: `Você usou todas as mensagens da hora. Volta em ${Math.ceil((reset - Date.now())/60000)} min.`,
      remaining,
    }), { status: 429, headers: { 'Content-Type': 'application/json' } })
  }

  const { spot, history, message } = await req.json() as {
    spot: string
    history: { role: 'user' | 'assistant'; content: string }[]
    message: string
  }

  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
  const forecast = await getForecast(spot, today)

  const stream = await client.messages.stream({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },  // cached block 1: stable system prompt
      },
      {
        type: 'text',
        text: `Forecast for ${forecast.spot.name} on ${today}:\n${JSON.stringify(forecast, null, 2)}`,
        cache_control: { type: 'ephemeral' },  // cached block 2: per-spot per-day forecast
      },
    ],
    messages: [
      ...history,
      { role: 'user', content: message },
    ],
  })

  return new Response(stream.toReadableStream(), {
    headers: {
      'Content-Type': 'text/event-stream',
      'X-RateLimit-Remaining': String(remaining),
    },
  })
}

const SYSTEM_PROMPT = `Você é o copiloto do partiu.surf — um assistente de surf em pt-BR.
Você analisa swell, vento, maré e temperatura, cruza com o nível e equipamento do usuário,
e responde de forma direta. Seja honesto sobre quando NÃO vale a pena ir surfar.
Use unidades métricas (metros, segundos, km/h, °C). Direções em português (S, SSE, etc).
Mantenha respostas curtas — 2-3 frases — a menos que o usuário peça mais detalhe.`
```

**Two cache blocks** on every request: the system prompt (stable across all users), and the forecast for `(spot, today)` (stable across all users asking about this spot today). After the first hit per spot/day, both blocks are 90% cheaper.

### 4.3 Wire into the chat panel (desktop)

In `components/Desktop.tsx`, update the chat form's `onSubmit`:

```tsx
'use client'
import { useState } from 'react'

function ChatPanel({ spot }: { spot: string }) {
  const [draft, setDraft] = useState('')
  const [history, setHistory] = useState<{ role: 'user'|'assistant'; content: string }[]>([])
  const [streaming, setStreaming] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.trim() || streaming) return
    const userMsg = { role: 'user' as const, content: draft }
    setHistory(h => [...h, userMsg])
    setDraft('')
    setStreaming('')
    setError(null)

    const res = await fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ spot, history: [...history, userMsg], message: draft }),
    })
    if (res.status === 429) {
      const data = await res.json()
      setError(data.message)
      return
    }
    const reader = res.body!.getReader()
    const dec = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      // SDK's toReadableStream emits SSE-style "data: {json}\n\n" — parse text deltas
      for (const chunk of buf.split('\n\n')) {
        const m = chunk.match(/^data: (.+)$/m)
        if (m) {
          const evt = JSON.parse(m[1])
          if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
            setStreaming(s => s + evt.delta.text)
          }
        }
      }
    }
    setHistory(h => [...h, { role: 'assistant', content: /* final */ '' }])
    setStreaming('')
  }

  // ... rest of ChatPanel renders history + streaming + draft input
}
```

Render the chat history above the suggestions; suggestions disappear once `history.length > 0`. Welcome bubble stays as the first item.

### 4.4 Wire into the mobile sheet

`components/Mobile.tsx`:
- `peek` state: keep showing suggestions (clicking a suggestion expands sheet to `full` and immediately sends).
- `half` state: show the latest bot reply + composer.
- `full` state: full conversation view + composer (already designed).

Replace the static `BotBubble`/`UserBubble` content with `history.map(...)`.

### 4.5 Suggestion clicks fire chat

Replace the existing `setDraft(s)` on suggestion buttons with: `setDraft(s); send(syntheticEvent)`. Same flow on desktop and mobile.

### 4.6 Loading + error states

- Streaming dot indicator (already designed for the mobile `Typing` component) — show it whenever `streaming === ''` and `history.last === user`.
- 429 error bubble: render `error` as a soft amber bubble below the latest user message.
- Network error: similar bubble, "tente de novo" CTA.

## Tests

### Unit tests

`app/api/chat/route.test.ts`:
- Rate-limit hit returns 429 with `{ error: 'rate_limited' }`.
- Successful flow: mocked Anthropic client streams 3 chunks, route returns a ReadableStream that yields all 3.
- Missing `spot` or `message` returns 400.
- System prompt + forecast are sent as two cache blocks (assert `cache_control: { type: 'ephemeral' }` on both).

`components/Desktop.test.tsx` (chat-specific):
- Submitting input adds a user bubble immediately.
- Mocked stream yields tokens; component renders them progressively (`data-testid="streaming"` text grows).
- 429 response renders the error bubble.

### Integration tests

`tests/integration/chat.test.ts`:
- Boot Next.js test server, mock Anthropic SDK to emit canned SSE.
- POST `/api/chat` with a real session, read the stream end-to-end, assert reconstructed text.
- Hit it 11 times within an hour — last call returns 429.

### Smoke tests

`tests/smoke/chat.spec.ts` (Playwright):
- Open `/itamambuca` desktop, type "vale ir agora?", press Enter.
- Wait for non-empty assistant bubble within 5s.
- Assert response contains a number (score) or one of the words `bom`, `ruim`, `vale`, `não`.
- (Same flow on mobile viewport, full-state sheet.)

`tests/smoke/chat-rate-limit.spec.ts`:
- Hit `/api/chat` 11× in rapid succession with the same fake IP.
- 11th response status === 429.

### Cost smoke

`tests/smoke/llm-cost.spec.ts` (run weekly):
- Query Anthropic billing API for current month spend.
- Assert spend <$2.50 (50% of monthly cap).
- If between $2.50 and $5: warn (slack/email), tighten rate limits.
- If ≥$5: hard cap kicks in at Anthropic, but alert anyway.

### Prompt cache smoke

After every deploy, fire 2 chat requests for the same spot back-to-back (different sessions, same content). Inspect the `usage` field in the API response:
- First request: `cache_creation_input_tokens` > 0, `cache_read_input_tokens` ≈ 0.
- Second request: `cache_creation_input_tokens` ≈ 0, `cache_read_input_tokens` > 0.

If second-request cache reads are 0, the prompt cache is broken (often because the system or forecast block is being mutated unintentionally — e.g., timestamp in the prompt).

## Acceptance criteria

- [ ] `/api/chat` streams Haiku responses; first byte <2s.
- [ ] Both cache blocks (system + forecast) hit on the second request for the same spot.
- [ ] 11th request from one IP within an hour returns 429.
- [ ] Hard $5 cap configured in Anthropic dashboard.
- [ ] Desktop chat panel + mobile sheet both stream tokens visibly.
- [ ] Suggestion clicks fire a chat turn end-to-end.
- [ ] Vitest unit suite + Playwright smoke tests green.

## Notes

- **Don't put dynamic timestamps in the cached blocks.** A "current time" string in the system prompt invalidates the cache every request and you're back to $1/MTok. Pass time as part of the user message instead.
- The forecast block can change up to once per hour (when ISR regenerates). That's still a 90% cache hit ratio across many users in the same hour. Acceptable.
- If you want richer agentic behavior later (e.g., `compare_spots` tool that pulls another spot's data on demand), this is where tool-use would slot in. Out of scope for phase 4 — keep it as a Q&A bot.
- Streaming format: the Anthropic SDK's `stream.toReadableStream()` emits SSE. The client-side parser above is intentionally minimal; for production consider the SDK's official `MessageStream` consumer.
