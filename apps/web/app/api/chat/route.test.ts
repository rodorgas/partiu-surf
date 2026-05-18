import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Wire @upstash/redis to a stub so the lib imports don't blow up. The route
// goes through chatLimiter (mocked below) so the actual redis client is not
// exercised.
vi.mock("@upstash/redis", () => {
  const stub = {} as Record<string, unknown>;
  return {
    Redis: Object.assign(vi.fn(() => stub), { fromEnv: () => stub }),
  };
});

// Mock the rate limiter directly — Upstash's Ratelimit uses Redis Lua scripts
// (evalsha) that the in-memory mock doesn't support. Easier to substitute the
// limiter with a deterministic counter for this test.
const { ratelimitState } = vi.hoisted(() => ({
  ratelimitState: {
    requests: new Map<string, number>(),
    cap: 10,
    enabled: true,
  },
}));

vi.mock("@/lib/ratelimit", () => ({
  chatLimiter: {
    limit: vi.fn(async (id: string) => {
      if (!ratelimitState.enabled) {
        return { success: true, remaining: 999, reset: Date.now() + 3600_000 };
      }
      const used = ratelimitState.requests.get(id) ?? 0;
      ratelimitState.requests.set(id, used + 1);
      const success = used < ratelimitState.cap;
      return {
        success,
        remaining: Math.max(0, ratelimitState.cap - used - 1),
        reset: Date.now() + 60_000,
      };
    }),
  },
  clientId: (req: Request) =>
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon",
}));

// Stub the Langfuse singleton — the real client tries to ship events on a
// background timer which leaks across tests. Returning null exercises the
// no-op branch in the route handler.
vi.mock("@/lib/langfuse", () => ({
  langfuse: () => null,
}));

// Stub next/server `after`: Vitest's environment doesn't provide a request
// context, so the real implementation throws. We just invoke the callback
// synchronously here — the route's after() block is exercised by the
// langfuse-enabled path which is null-stubbed above, so this is effectively
// inert in unit tests but keeps the import resolvable.
vi.mock("next/server", () => ({
  after: (cb: () => unknown | Promise<unknown>) => {
    void cb();
  },
}));

// Stub getForecast so we don't hit Open-Meteo or spawn Python.
vi.mock("@/lib/forecast", () => ({
  getForecast: vi.fn(async (slug: string, date: string) => ({
    spot: {
      name: slug === "itamambuca" ? "Itamambuca" : slug,
      region: "Ubatuba · SP",
      facing: 165,
      breakType: "beach",
      waterTemp: 24,
      sunrise: "05:21",
      sunset: "18:43",
      bestWindow: "08h–10h",
      todayPeak: 8.9,
    },
    hours: [],
    spots: [],
    suggestions: ["q?"],
    welcome: "hi",
    historic: { avgScore: 6, avgSwH: 1, avgSwT: 9 },
    _date: date,
  })),
}));

// Spy on the Anthropic SDK so we can inspect the request shape and avoid
// any real network call.
type StreamCall = {
  model: string;
  max_tokens: number;
  system: unknown;
  messages: unknown;
};
const streamCalls: StreamCall[] = [];

function makeFakeStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const text of chunks) {
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              type: "content_block_delta",
              delta: { type: "text_delta", text },
            }) + "\n",
          ),
        );
      }
      controller.enqueue(
        encoder.encode(JSON.stringify({ type: "message_stop" }) + "\n"),
      );
      controller.close();
    },
  });
}

vi.mock("@anthropic-ai/sdk", () => {
  class FakeAnthropic {
    messages = {
      stream: (params: StreamCall) => {
        streamCalls.push(params);
        const readable = makeFakeStream(["bom dia, ", "tá ", "rendendo."]);
        return {
          toReadableStream: () => readable,
        };
      },
    };
  }
  return { default: FakeAnthropic };
});

const { POST } = await import("./route");

function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: body === null ? undefined : JSON.stringify(body),
  });
}

describe("POST /api/chat", () => {
  beforeEach(() => {
    ratelimitState.requests.clear();
    ratelimitState.cap = 10;
    ratelimitState.enabled = true;
    streamCalls.length = 0;
    // Force the route into "real Anthropic" branch.
    process.env.ANTHROPIC_API_KEY = "sk-test-fake";
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("400 when body is not valid JSON", async () => {
    const r = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(r);
    expect(res.status).toBe(400);
  });

  it("400 when spot is missing", async () => {
    const res = await POST(req({ message: "oi" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("invalid_request");
  });

  it("400 when message is missing", async () => {
    const res = await POST(req({ spot: "itamambuca" }));
    expect(res.status).toBe(400);
  });

  it("400 when spot is unknown", async () => {
    const res = await POST(req({ spot: "atlantis", message: "vale ir?" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toContain("atlantis");
  });

  it("400 when history is not an array of {role,content}", async () => {
    const res = await POST(
      req({ spot: "itamambuca", message: "oi", history: [{ role: "bogus" }] }),
    );
    expect(res.status).toBe(400);
  });

  it("streams a ReadableStream and sends both cache_control blocks", async () => {
    const res = await POST(
      req(
        { spot: "itamambuca", message: "vale ir agora?", history: [] },
        { "x-forwarded-for": "1.1.1.1" },
      ),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.body).toBeInstanceOf(ReadableStream);

    // Drain the stream end-to-end and rebuild the assistant text.
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const json = line.trim();
        if (!json) continue;
        try {
          const evt = JSON.parse(json) as {
            type?: string;
            delta?: { type?: string; text?: string };
          };
          if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
            text += evt.delta.text ?? "";
          }
        } catch {
          /* ignore */
        }
      }
    }
    expect(text).toBe("bom dia, tá rendendo.");

    // Assert the request shape we sent to Anthropic.
    expect(streamCalls).toHaveLength(1);
    const call = streamCalls[0];
    expect(call.model).toBe("claude-haiku-4-5-20251001");
    const sys = call.system as Array<{ type: string; cache_control?: unknown; text: string }>;
    expect(sys).toHaveLength(3);
    expect(sys[0].cache_control).toEqual({ type: "ephemeral" });
    expect(sys[1].cache_control).toEqual({ type: "ephemeral" });
    expect(sys[0].text).toMatch(/assistente do partiu\.surf/);
    expect(sys[1].text).toMatch(/Forecast for Itamambuca/);
    // The forecast block embeds the JSON dump so the model can read it.
    expect(sys[1].text).toMatch(/"spot"/);
    // Third block carries the current time — uncached, so cache_control absent.
    expect(sys[2].cache_control).toBeUndefined();
    expect(sys[2].text).toMatch(/^Hora atual: .+\d{2}:\d{2}.+America\/Sao_Paulo/);
  });

  it("429 once the rate-limit window is exhausted", async () => {
    const headers = { "x-forwarded-for": "9.9.9.9" };
    // chatLimiter is 10/h. Exhaust it.
    for (let i = 0; i < 10; i++) {
      const res = await POST(
        req({ spot: "itamambuca", message: "oi " + i }, headers),
      );
      // Important: consume the stream body so the underlying mock controller
      // closes — otherwise we can leak handles across iterations.
      if (res.body) await res.body.cancel();
      expect(res.status).toBe(200);
    }
    const res = await POST(req({ spot: "itamambuca", message: "uma a mais" }, headers));
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error).toBe("rate_limited");
    expect(data.message).toMatch(/min/);
  });

  it("falls back to a stub stream when ANTHROPIC_API_KEY is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(
      req(
        { spot: "itamambuca", message: "tá bom?", history: [] },
        { "x-forwarded-for": "2.2.2.2" },
      ),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Chat-Stub")).toBe("1");
    expect(streamCalls).toHaveLength(0); // we did NOT call Anthropic
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
    }
    expect(buf).toMatch(/\[stub\] Sem ANTHROPIC_API_KEY/);
  });
});
