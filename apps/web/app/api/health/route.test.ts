import { describe, expect, it, vi } from "vitest";

const { memory } = await vi.hoisted(async () => {
  const { MemoryRedis } = await import("@/lib/__mocks__/upstash-redis-memory");
  return { memory: new MemoryRedis() };
});

vi.mock("@upstash/redis", () => ({
  Redis: Object.assign(vi.fn(() => memory), { fromEnv: () => memory }),
}));

const { GET } = await import("./route");

describe("GET /api/health", () => {
  it("returns ok=true and a numeric latency", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.latencyMs).toBe("number");
    expect(body.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("responds in well under 500ms with the in-memory mock", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.latencyMs).toBeLessThan(500);
  });

  it("returns ok=false with 503 when Redis ping rejects", async () => {
    const spy = vi
      .spyOn(memory, "ping")
      .mockRejectedValueOnce(new Error("upstream down"));
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain("upstream down");
    spy.mockRestore();
  });
});
