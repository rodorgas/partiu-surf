import { test, expect } from "@playwright/test";

/**
 * Smoke test for /api/health.
 *
 * Locally: requires `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` in
 * `.env.local`. Without them, the route returns 503 and this test fails — which
 * is expected until the user provisions Upstash via the Vercel Marketplace.
 *
 * Production (post-deploy):
 *   curl -fsS https://partiu-surf.vercel.app/api/health | jq -e '.ok == true'
 */
test("GET /api/health returns ok=true with numeric latency", async ({
  request,
}) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { ok: boolean; latencyMs: number };
  expect(body.ok).toBe(true);
  expect(typeof body.latencyMs).toBe("number");
  // Local should be <500ms; from a Vercel POP <100ms.
  expect(body.latencyMs).toBeLessThan(500);
});
