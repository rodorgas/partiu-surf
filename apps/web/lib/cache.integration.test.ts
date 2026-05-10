import { beforeEach, describe, expect, it, vi } from "vitest";

const { memory } = await vi.hoisted(async () => {
  const { MemoryRedis } = await import("./__mocks__/upstash-redis-memory");
  return { memory: new MemoryRedis() };
});

vi.mock("@upstash/redis", () => ({
  Redis: Object.assign(vi.fn(() => memory), { fromEnv: () => memory }),
}));

const { getCached, setCached, todayISO } = await import("./cache");

describe("cache integration", () => {
  beforeEach(async () => {
    await memory.flushall();
    memory.setNow(() => Date.now());
  });

  it("handles 100 parallel writes + reads with no data races", async () => {
    const today = todayISO();
    const writes = Array.from({ length: 100 }, (_, i) =>
      setCached(`forecast:spot${i}`, today, { i, score: 5 + (i % 5) }),
    );
    await Promise.all(writes);

    const reads = await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        getCached<{ i: number; score: number }>(`forecast:spot${i}`, today),
      ),
    );

    for (let i = 0; i < 100; i++) {
      expect(reads[i]).toEqual({ i, score: 5 + (i % 5) });
    }
  });

  it("preserves TTL semantics across many past + today + future writes", async () => {
    const today = todayISO();
    const yesterday = (() => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - 1);
      return d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    })();
    const tomorrow = (() => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + 1);
      return d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    })();

    await setCached("forecast:arpoador", yesterday, { a: 1 });
    await setCached("forecast:arpoador", today, { a: 2 });
    await setCached("forecast:arpoador", tomorrow, { a: 3 });

    expect(await memory.ttl(`forecast:arpoador:${yesterday}`)).toBe(-1);
    expect(await memory.ttl(`forecast:arpoador:${today}`)).toBeGreaterThan(0);
    expect(await memory.ttl(`forecast:arpoador:${tomorrow}`)).toBeGreaterThan(
      0,
    );
  });

  it("TTL math is robust across a São Paulo DST-like date (historical past date)", async () => {
    // São Paulo abolished DST in 2019; verify a date that historically fell
    // inside the old DST window still classifies as 'past' and stores without TTL.
    const dstHistoricalDate = "2018-10-21"; // old "spring forward" date
    await setCached("forecast:arpoador", dstHistoricalDate, { dst: true });
    expect(
      await memory.ttl(`forecast:arpoador:${dstHistoricalDate}`),
    ).toBe(-1);
    expect(
      await getCached("forecast:arpoador", dstHistoricalDate),
    ).toEqual({ dst: true });
  });
});
