import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { memory } = await vi.hoisted(async () => {
  const { MemoryRedis } = await import("./__mocks__/upstash-redis-memory");
  return { memory: new MemoryRedis() };
});

vi.mock("@upstash/redis", () => ({
  Redis: Object.assign(vi.fn(() => memory), { fromEnv: () => memory }),
}));

// Import AFTER the mock — cache.ts captures `Redis.fromEnv()` at module load.
const { getCached, setCached, invalidate, redis, todayISO } = await import(
  "./cache"
);

const TWELVE_HOURS_S = 12 * 60 * 60;

function isoOffsetDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

describe("cache.ts", () => {
  beforeEach(async () => {
    await memory.flushall();
    memory.setNow(() => Date.now());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shares the same Redis instance as the consumer module", () => {
    expect(redis).toBe(memory);
  });

  it("todayISO() returns a YYYY-MM-DD string", () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  describe("setCached", () => {
    it("stores without TTL for a past date", async () => {
      const past = isoOffsetDays(-7);
      await setCached("forecast:arpoador", past, { temp: 20 });
      const ttl = await memory.ttl(`forecast:arpoador:${past}`);
      expect(ttl).toBe(-1); // -1 == no expiry
    });

    it("stores with 12h TTL for today's date", async () => {
      const today = todayISO();
      await setCached("forecast:arpoador", today, { temp: 22 });
      const ttl = await memory.ttl(`forecast:arpoador:${today}`);
      expect(ttl).toBeGreaterThan(TWELVE_HOURS_S - 5);
      expect(ttl).toBeLessThanOrEqual(TWELVE_HOURS_S);
    });

    it("stores with 12h TTL for a future date", async () => {
      const future = isoOffsetDays(3);
      await setCached("forecast:arpoador", future, { temp: 24 });
      const ttl = await memory.ttl(`forecast:arpoador:${future}`);
      expect(ttl).toBeGreaterThan(TWELVE_HOURS_S - 5);
      expect(ttl).toBeLessThanOrEqual(TWELVE_HOURS_S);
    });
  });

  describe("getCached", () => {
    it("returns null for a missing key", async () => {
      const v = await getCached("forecast:arpoador", "1999-01-01");
      expect(v).toBeNull();
    });

    it("roundtrips JSON value (deep equal)", async () => {
      const payload = {
        hours: [{ t: "2026-05-10T06:00", score: 7.3 }],
        meta: { spot: "arpoador", source: "open-meteo" },
        nested: { a: [1, 2, 3] },
      };
      const today = todayISO();
      await setCached("forecast:arpoador", today, payload);
      const got = await getCached<typeof payload>("forecast:arpoador", today);
      expect(got).toEqual(payload);
    });

    it("returns null once the TTL has elapsed", async () => {
      const today = todayISO();
      const base = Date.now();
      memory.setNow(() => base);
      await setCached("forecast:arpoador", today, { temp: 22 });

      // Jump 13h ahead — past the 12h TTL.
      memory.setNow(() => base + 13 * 60 * 60 * 1000);
      const got = await getCached("forecast:arpoador", today);
      expect(got).toBeNull();
    });
  });

  describe("invalidate", () => {
    it("removes a single key when targetDate is provided", async () => {
      const today = todayISO();
      await setCached("forecast:arpoador", today, { a: 1 });
      await invalidate("forecast:arpoador", today);
      expect(await getCached("forecast:arpoador", today)).toBeNull();
    });

    it("removes every key in a namespace and leaves other namespaces intact", async () => {
      const today = todayISO();
      await setCached("forecast:arpoador", today, { a: 1 });
      await setCached("forecast:arpoador", isoOffsetDays(1), { a: 2 });
      await setCached("forecast:prainha", today, { b: 1 });
      await setCached("tide:arpoador", today, { c: 1 });

      await invalidate("forecast:arpoador");

      expect(await getCached("forecast:arpoador", today)).toBeNull();
      expect(
        await getCached("forecast:arpoador", isoOffsetDays(1)),
      ).toBeNull();
      // Other namespaces untouched.
      expect(await getCached("forecast:prainha", today)).toEqual({ b: 1 });
      expect(await getCached("tide:arpoador", today)).toEqual({ c: 1 });
    });
  });
});
