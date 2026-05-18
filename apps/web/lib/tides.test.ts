import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { memory } = await vi.hoisted(async () => {
  const { MemoryRedis } = await import("./__mocks__/upstash-redis-memory");
  return { memory: new MemoryRedis() };
});

vi.mock("@upstash/redis", () => ({
  Redis: Object.assign(vi.fn(() => memory), { fromEnv: () => memory }),
}));

const { getTideHeights } = await import("./tides");

function fakeWorldTidesResponse(dateISO: string) {
  // Produce 24 hourly samples. Tide chart: simple sine for shape — values
  // don't matter beyond confirming the bucketing logic.
  return {
    heights: Array.from({ length: 24 }, (_, h) => ({
      date: `${dateISO}T${String(h).padStart(2, "0")}:00-03:00`,
      height: Math.sin((h / 24) * Math.PI * 2),
    })),
  };
}

function mockFetch(handler: (url: URL) => unknown) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new URL(
      typeof input === "string" ? input : (input as URL | Request).toString(),
    );
    const body = handler(url);
    return new Response(JSON.stringify(body), { status: 200 });
  });
}

describe("tides.ts", () => {
  beforeEach(async () => {
    await memory.flushall();
    process.env.WORLDTIDES_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.WORLDTIDES_API_KEY;
  });

  it("returns null when WORLDTIDES_API_KEY is unset", async () => {
    delete process.env.WORLDTIDES_API_KEY;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const out = await getTideHeights(-22.989, -43.193, "2026-05-18");
    expect(out).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fetches heights and buckets keys as YYYY-MM-DDTHH:00", async () => {
    mockFetch(() => fakeWorldTidesResponse("2026-05-18"));
    const out = await getTideHeights(-22.989, -43.193, "2026-05-18");
    expect(out).not.toBeNull();
    const keys = Object.keys(out!).sort();
    expect(keys).toHaveLength(24);
    expect(keys[0]).toBe("2026-05-18T00:00");
    expect(keys[23]).toBe("2026-05-18T23:00");
    expect(out!["2026-05-18T06:00"]).toBeCloseTo(Math.sin((6 / 24) * Math.PI * 2));
  });

  it("caches per (lat-zone, date) so adjacent spots share an entry", async () => {
    const fetchSpy = mockFetch(() => fakeWorldTidesResponse("2026-05-18"));

    // Arpoador.
    await getTideHeights(-22.989, -43.193, "2026-05-18");
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Leblon — different coords but rounds to the same -23.0_-43.2 zone.
    await getTideHeights(-22.988, -43.222, "2026-05-18");
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Different date — fetches again.
    await getTideHeights(-22.989, -43.193, "2026-05-19");
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // Different zone (Prainha rounds to -23.0_-43.5).
    await getTideHeights(-23.044, -43.504, "2026-05-18");
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("returns null and does not cache when WorldTides reports an error", async () => {
    mockFetch(() => ({ status: 400, error: "Not enough credits" }));
    const out = await getTideHeights(-22.989, -43.193, "2026-05-18");
    expect(out).toBeNull();
    // No entry written — next call will retry.
    const ttl = await memory.ttl("tide:-23.0_-43.2:2026-05-18");
    expect(ttl).toBe(-2);
  });

  it("returns null when fetch itself throws", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const out = await getTideHeights(-22.989, -43.193, "2026-05-18");
    expect(out).toBeNull();
  });

  it("spans two days when date is null and days=1 (today+tomorrow rule)", async () => {
    const fetchSpy = mockFetch((url) => {
      const startTs = Number(url.searchParams.get("start"));
      // Recover the date the request maps to (SP-local midnight).
      const date = new Date(startTs * 1000).toLocaleDateString("sv-SE", {
        timeZone: "America/Sao_Paulo",
      });
      return fakeWorldTidesResponse(date);
    });

    const out = await getTideHeights(-22.989, -43.193, null, 1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(out).not.toBeNull();
    expect(Object.keys(out!)).toHaveLength(48);
  });

  it("sends the API key from the env to WorldTides", async () => {
    const fetchSpy = mockFetch(() => fakeWorldTidesResponse("2026-05-18"));
    await getTideHeights(-22.989, -43.193, "2026-05-18");
    const url = new URL(
      (fetchSpy.mock.calls[0][0] as URL | string).toString(),
    );
    expect(url.searchParams.get("key")).toBe("test-key");
    expect(url.searchParams.get("step")).toBe("3600");
    expect(url.searchParams.get("length")).toBe("86400");
    expect(url.searchParams.get("localtime")).toBe("true");
  });
});
