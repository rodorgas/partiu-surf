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
        winner: "shortboard",
      },
    ],
    hasTide: false,
    gear: "auto",
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

  it("falls back to mock metadata for chat suggestions until later phases", () => {
    const raw = buildRawForecast();
    const out = adaptRawToForecast(raw, SPOTS.itamambuca);
    expect(out.suggestions.length).toBeGreaterThan(0);
    expect(out.spot.todayPeak).toBe(8.9);
    expect(out.spot.region).toBe("Ubatuba · SP");
  });

  it("defaults historic to null when no climatology is supplied", () => {
    const raw = buildRawForecast();
    const out = adaptRawToForecast(raw, SPOTS.itamambuca);
    expect(out.historic).toBeNull();
  });

  it("passes through historic when provided", () => {
    const raw = buildRawForecast();
    const out = adaptRawToForecast(raw, SPOTS.itamambuca, {
      avgScore: 5.5,
      avgSwH: 1.1,
      avgSwT: 10.2,
      sampleDays: 90,
      yearsBack: 3,
    });
    expect(out.historic).toEqual({
      avgScore: 5.5,
      avgSwH: 1.1,
      avgSwT: 10.2,
      sampleDays: 90,
      yearsBack: 3,
    });
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
    expect(buildSpotUrl("arpoador", { gear: "auto", today })).toBe("/arpoador");
    expect(buildSpotUrl("arpoador", { date: today, today })).toBe("/arpoador");
  });
  it("emits only non-default params", () => {
    expect(buildSpotUrl("arpoador", { gear: "bodyboard", today })).toBe(
      "/arpoador?gear=bodyboard",
    );
    expect(buildSpotUrl("arpoador", { date: "2026-05-12", today })).toBe(
      "/arpoador?date=2026-05-12",
    );
    expect(
      buildSpotUrl("arpoador", { gear: "bodyboard", date: "2026-05-12", today }),
    ).toBe("/arpoador?gear=bodyboard&date=2026-05-12");
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

  /** Route `fetch` calls based on which endpoint they target. */
  function mockEndpoints(
    forecast: RawForecast,
    historic: { historic: unknown } = { historic: null },
    openMeteo: unknown = { hourly: { time: [] } },
  ) {
    return vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = typeof input === "string" ? input : (input as URL | Request).toString();
        if (url.includes("/api/climatology")) {
          return new Response(JSON.stringify(historic), { status: 200 });
        }
        if (url.includes("open-meteo.com")) {
          return new Response(JSON.stringify(openMeteo), { status: 200 });
        }
        return new Response(JSON.stringify(forecast), { status: 200 });
      });
  }

  it("caches Open-Meteo + climatology across calls, but rescores per request", async () => {
    const raw = buildRawForecast();
    // Provide non-null historic so it is cached on the first call; otherwise
    // the climatology refetches every request and the cache-hit assertion
    // below would never hold.
    const fetchSpy = mockEndpoints(raw, {
      historic: { avgScore: 5, avgSwH: 1, avgSwT: 9 },
    });

    const out = await getForecast("itamambuca", "2026-05-11");
    // First call: 2× Open-Meteo (marine + atmospheric) + 1× climatology +
    // 1× scoring lambda = 4 fetches.
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(out.spot.todayPeak).toBe(8.9);

    // Second call: Open-Meteo and climatology are Redis-cached, so only the
    // scoring lambda is called. Scoring runs per request (no scored cache).
    fetchSpy.mockClear();
    const out2 = await getForecast("itamambuca", "2026-05-11");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(
      fetchSpy.mock.calls.some(([input]) => {
        const url = typeof input === "string" ? input : (input as URL | Request).toString();
        return url.includes("/api/forecast");
      }),
    ).toBe(true);
    expect(out2.spot.todayPeak).toBe(8.9);
  });

  it("threads historic through to the returned Forecast when climatology returns it", async () => {
    const raw = buildRawForecast();
    const histPayload = {
      historic: { avgScore: 5.5, avgSwH: 1.1, avgSwT: 10, sampleDays: 90, yearsBack: 3 },
    };
    mockEndpoints(raw, histPayload);

    const out = await getForecast("itamambuca", "2026-05-11");
    expect(out.historic).toEqual(histPayload.historic);
  });

  it("treats a null climatology response as missing historic", async () => {
    const raw = buildRawForecast();
    mockEndpoints(raw, { historic: null });
    const out = await getForecast("itamambuca", "2026-05-11");
    expect(out.historic).toBeNull();
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
    let current = raw1;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as URL | Request).toString();
      if (url.includes("/api/climatology")) {
        return new Response(JSON.stringify({ historic: null }), { status: 200 });
      }
      return new Response(JSON.stringify(current), { status: 200 });
    });

    const day1 = await getForecast("itamambuca", "2026-05-11");
    current = raw2;
    const day2 = await getForecast("itamambuca", "2026-05-12");

    expect(day1.spot.todayPeak).toBe(8.9);
    expect(day2.spot.todayPeak).toBe(6.1);
  });
});
