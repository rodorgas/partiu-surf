import { describe, expect, it } from "vitest";
import { MOCK_FORECAST, dirLabel, scoreColor, scoreEmoji } from "./data";
import type { ForecastHour, TideState } from "./data";

const VALID_TIDES: TideState[] = ["subindo", "descendo", "alta", "baixa"];

describe("MOCK_FORECAST", () => {
  it("matches the Forecast shape with 14 hourly entries", () => {
    expect(MOCK_FORECAST.hours).toHaveLength(14);
    for (const h of MOCK_FORECAST.hours as ForecastHour[]) {
      expect(typeof h.h).toBe("string");
      expect(h.score).toBeGreaterThanOrEqual(0);
      expect(h.score).toBeLessThanOrEqual(10);
      expect(VALID_TIDES).toContain(h.tide);
      expect(h.swH).toBeGreaterThan(0);
      expect(h.swT).toBeGreaterThan(0);
    }
  });

  it("includes the canonical spot + welcome strings", () => {
    expect(MOCK_FORECAST.spot.name).toBe("Itamambuca");
    expect(MOCK_FORECAST.spot.todayPeak).toBe(8.9);
    expect(MOCK_FORECAST.welcome).toContain("partiu.surf");
    expect(MOCK_FORECAST.suggestions.length).toBeGreaterThanOrEqual(3);
  });

  it("has 4 nearby spots", () => {
    expect(MOCK_FORECAST.spots).toHaveLength(4);
  });
});

describe("scoring helpers", () => {
  it("bins scores into green/amber/red", () => {
    expect(scoreColor(8.9)).toBe("green");
    expect(scoreColor(5)).toBe("amber");
    expect(scoreColor(3.5)).toBe("red");
  });

  it("emits the matching emoji", () => {
    expect(scoreEmoji(9)).toBe("🟢");
    expect(scoreEmoji(5)).toBe("🟡");
    expect(scoreEmoji(1)).toBe("🔴");
  });
});

describe("dirLabel", () => {
  it("rounds compass degrees to pt-BR labels", () => {
    expect(dirLabel(0)).toBe("N");
    expect(dirLabel(90)).toBe("L");
    expect(dirLabel(180)).toBe("S");
    expect(dirLabel(270)).toBe("O");
    expect(dirLabel(185)).toBe("S");
    expect(dirLabel(165)).toBe("SSE");
  });

  it("handles wrap-around and negative degrees", () => {
    expect(dirLabel(360)).toBe("N");
    expect(dirLabel(-90)).toBe("O");
  });
});
