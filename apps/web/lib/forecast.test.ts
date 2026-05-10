import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawForecast } from "./forecast";
import { buildSpotUrl, normalizeDate, FORECAST_DAY_COUNT } from "./forecast";

const { memory } = await vi.hoisted(async () => {
  const { MemoryRedis } = await import("./__mocks__/upstash-redis-memory");
  return { memory: new MemoryRedis() };
});

vi.mock("@upstash/redis", () => ({
  Redis: Object.assign(vi.fn(() => memory), { fromEnv: () => memory }),
}));

const { getForecast, adaptRawToForecast } = await import("./forecast");
const { SPOTS } = await import("./spots");

function buildRawForecast(overrides?: Partial<RawForecast>): RawForecast {
  return {
    generatedAt: "2026-05-11T00:00:00-03:00",
    spot: {
      slug: "itamambuca",
      name: "Itamambuca",
      region: "Ubatuba · SP",
      facing: 165,
      breakType: "beach",
      tidePref: "any",
      waterTemp: 0,
      sunrise: "—",
      sunset: "—",
      bestWindow: "06h–18h",
      todayPeak: 8.9,
    },
    hours: [
      {
        h: "06h",
        isoTime: "2026-05-11T06:00",
        score: 7.4,
        swH: 1.5,
        swT: 11,
        swDir: 185,
        wKmh: 8,
        wDir: 230,
        gust: 14,
        tideH: 1.5,
        tide: "subindo",
        hasTide: false,
        flag: "",
      },
    ],
    hasTide: false,
    gear: "all",
    ...overrides,
  };
}

describe("adaptRawToForecast", () => {
  it("maps raw hours to ForecastHour preserving numbers", () => {
    const raw = buildRawForecast();
    const out = adaptRawToForecast(raw, SPOTS.itamambuca);
    expect(out.hours).toHaveLength(1);
    const h = out.hours[0];
    expect(h.score).toBe(7.4);
    expect(h.swH).toBe(1.5);
    expect(h.swT).toBe(11);
    expect(h.wDir).toBe(230);
  });

  it("falls back to mock metadata for chat/historic until later phases", () => {
    const raw = buildRawForecast();
    const out = adaptRawToForecast(raw, SPOTS.itamambuca);
    expect(out.suggestions.length).toBeGreaterThan(0);
    expect(out.spot.todayPeak).toBe(8.9);
    expect(out.spot.region).toBe("Ubatuba · SP");
  });
});

describe("normalizeDate", () => {
  const today = "2026-05-10";
  it("accepts today and dates within the forecast window", () => {
    expect(normalizeDate("2026-05-10", today)).toBe("2026-05-10");
    expect(normalizeDate("2026-05-16", today)).toBe("2026-05-16"); // today + 6
  });
  it("falls back to today for malformed input", () => {
    expect(normalizeDate(undefined, today)).toBe(today);
    expect(normalizeDate("not-a-date", today)).toBe(today);
    expect(normalizeDate("2026-13-01", today)).toBe(today);
  });
  it("falls back to today for past or far-future dates", () => {
    expect(normalizeDate("2026-05-09", today)).toBe(today);
    expect(normalizeDate("2026-05-17", today)).toBe(today); // today + 7
  });
  it("FORECAST_DAY_COUNT is the inclusive day count", () => {
    expect(FORECAST_DAY_COUNT).toBe(7);
  });
});

describe("buildSpotUrl", () => {
  const today = "2026-05-10";
  it("omits defaults", () => {
    expect(buildSpotUrl("arpoador", { today })).toBe("/arpoador");
    expect(buildSpotUrl("arpoador", { gear: "all", today })).toBe("/arpoador");
    expect(buildSpotUrl("arpoador", { date: today, today })).toBe("/arpoador");
  });
  it("emits only non-default params", () => {
    expect(buildSpotUrl("arpoador", { gear: "bb", today })).toBe(
      "/arpoador?gear=bb",
    );
    expect(buildSpotUrl("arpoador", { date: "2026-05-12", today })).toBe(
      "/arpoador?date=2026-05-12",
    );
    expect(
      buildSpotUrl("arpoador", { gear: "bb", date: "2026-05-12", today }),
    ).toBe("/arpoador?gear=bb&date=2026-05-12");
  });
});

describe("getForecast", () => {
  beforeEach(async () => {
    await memory.flushall();
    memory.setNow(() => Date.now());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hits the network on cache miss and stores the result", async () => {
    const raw = buildRawForecast();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify(raw), { status: 200 }),
      );

    const out = await getForecast("itamambuca", "2026-05-11");
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(out.spot.todayPeak).toBe(8.9);

    // Second call — cache hit, no further fetch.
    const out2 = await getForecast("itamambuca", "2026-05-11");
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(out2.spot.todayPeak).toBe(8.9);
  });

  it("throws on unknown spot", async () => {
    await expect(getForecast("atlantis", "2026-05-11")).rejects.toThrow(
      /unknown spot/,
    );
  });

  it("isolates cache by slug + date", async () => {
    const raw1 = buildRawForecast({
      spot: { ...buildRawForecast().spot, todayPeak: 8.9 },
    });
    const raw2 = buildRawForecast({
      spot: { ...buildRawForecast().spot, todayPeak: 6.1 },
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(raw1), { status: 200 }),
    );
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(raw2), { status: 200 }),
    );

    const day1 = await getForecast("itamambuca", "2026-05-11");
    const day2 = await getForecast("itamambuca", "2026-05-12");

    expect(day1.spot.todayPeak).toBe(8.9);
    expect(day2.spot.todayPeak).toBe(6.1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
