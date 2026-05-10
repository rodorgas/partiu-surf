import { describe, expect, it } from "vitest";
import {
  addDaysISO,
  dateKicker,
  diffDaysISO,
  forecastDates,
  formatDateLong,
  formatDayMonth,
  formatWeekday,
  isValidISODate,
} from "./date";

describe("isValidISODate", () => {
  it("accepts well-formed real dates", () => {
    expect(isValidISODate("2026-05-10")).toBe(true);
    expect(isValidISODate("2024-02-29")).toBe(true); // leap year
  });

  it("rejects bad shape", () => {
    expect(isValidISODate("2026/05/10")).toBe(false);
    expect(isValidISODate("26-05-10")).toBe(false);
    expect(isValidISODate("")).toBe(false);
    expect(isValidISODate(undefined)).toBe(false);
  });

  it("rejects impossible calendar dates", () => {
    expect(isValidISODate("2026-02-30")).toBe(false);
    expect(isValidISODate("2026-13-01")).toBe(false);
    expect(isValidISODate("2023-02-29")).toBe(false); // not a leap year
  });
});

describe("addDaysISO", () => {
  it("walks forward across a month boundary", () => {
    expect(addDaysISO("2026-01-30", 3)).toBe("2026-02-02");
  });

  it("walks backward across a year boundary", () => {
    expect(addDaysISO("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("diffDaysISO", () => {
  it("returns positive when a is after b", () => {
    expect(diffDaysISO("2026-05-12", "2026-05-10")).toBe(2);
  });
  it("returns negative when a is before b", () => {
    expect(diffDaysISO("2026-05-10", "2026-05-12")).toBe(-2);
  });
});

describe("forecastDates", () => {
  it("returns N sequential dates starting at today", () => {
    const out = forecastDates("2026-05-10", 7);
    expect(out).toEqual([
      "2026-05-10",
      "2026-05-11",
      "2026-05-12",
      "2026-05-13",
      "2026-05-14",
      "2026-05-15",
      "2026-05-16",
    ]);
  });
});

describe("formatters", () => {
  it("formatDateLong drops trailing punctuation", () => {
    const s = formatDateLong("2026-05-10"); // dom 10 mai
    expect(s).not.toContain(",");
    expect(s).not.toContain(".");
    expect(s.length).toBeGreaterThan(0);
  });

  it("formatWeekday and formatDayMonth are non-empty", () => {
    expect(formatWeekday("2026-05-10")).toMatch(/\w+/);
    expect(formatDayMonth("2026-05-10")).toMatch(/\d{2}/);
  });
});

describe("dateKicker", () => {
  it("returns Hoje for today and Amanhã for tomorrow", () => {
    expect(dateKicker("2026-05-10", "2026-05-10")).toBe("Hoje");
    expect(dateKicker("2026-05-11", "2026-05-10")).toBe("Amanhã");
  });
  it("returns null otherwise", () => {
    expect(dateKicker("2026-05-12", "2026-05-10")).toBeNull();
  });
});
