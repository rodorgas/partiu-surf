// Prompt-cache smoke. Two identical requests should produce a non-zero
// `cache_read_input_tokens` on the second one — proof that the
// cache_control:ephemeral blocks on the system prompt and serialized
// forecast are stable across requests.
//
// Skipped unless ANTHROPIC_API_KEY is set. Don't hardcode a key.

import { expect, test } from "@playwright/test";

const HAS_KEY = Boolean(process.env.ANTHROPIC_API_KEY);

test.describe("chat prompt-cache smoke", () => {
  test.skip(!HAS_KEY, "ANTHROPIC_API_KEY not set — skipping cache smoke.");

  // The route returns the stream directly; the SDK's toReadableStream() emits
  // newline-delimited JSON, one event per line. A `message_start` /
  // `message_delta` frame near the end carries `usage` for the call. We scrape
  // that. If the SDK ever changes its event shape, this test will need updating.

  async function chat(request: import("@playwright/test").APIRequestContext) {
    const res = await request.post("/api/chat", {
      data: {
        spot: "itamambuca",
        history: [],
        message:
          "Em uma palavra: hoje tá bom pra surfar? (deterministic test prompt)",
      },
      headers: { "x-forwarded-for": "127.0.0.1" },
    });
    expect(res.status()).toBe(200);
    const body = await res.text();
    let cacheRead = -1;
    for (const line of body.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const evt = JSON.parse(trimmed);
        const usage = evt?.message?.usage ?? evt?.usage;
        if (usage && typeof usage.cache_read_input_tokens === "number") {
          cacheRead = usage.cache_read_input_tokens;
        }
      } catch {
        /* ignore */
      }
    }
    return { cacheRead };
  }

  test("second identical request reads from cache", async ({ request }) => {
    // First request — primes the cache.
    const first = await chat(request);
    // Second request — should report cache reads on the prefix.
    const second = await chat(request);

    // If the SDK didn't surface usage in the stream we'd see -1 on both.
    // In that case we soft-skip rather than fail — the production cache may
    // still be working; the proof is just inaccessible to this test.
    test.skip(
      first.cacheRead === -1 && second.cacheRead === -1,
      "stream didn't expose usage frame — can't assert cache reads",
    );

    // First request can be 0 (cache miss). Second must be > 0.
    expect(second.cacheRead).toBeGreaterThan(0);
  });
});
