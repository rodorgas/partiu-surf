import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type { Forecast } from "@/lib/data";
import { MOCK_FORECAST } from "@/lib/data";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("__NOT_FOUND__");
  }),
}));

const getForecastMock =
  vi.fn<(slug: string, date: string, gear?: string) => Promise<Forecast>>();
vi.mock("@/lib/forecast", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/forecast")>();
  return {
    ...actual,
    getForecast: (slug: string, date: string, gear?: string) =>
      getForecastMock(slug, date, gear),
  };
});

describe("<SpotPage />", () => {
  it("generateStaticParams() includes every known slug", async () => {
    const { generateStaticParams } = await import("./page");
    const params = await generateStaticParams();
    const slugs = params.map((p) => p.spot).sort();
    expect(slugs).toContain("itamambuca");
    expect(slugs).toContain("arpoador");
  });

  it("renders the suspense shell with the spot name and kicks off the fetch", async () => {
    getForecastMock.mockResolvedValueOnce(MOCK_FORECAST);
    const mod = await import("./page");
    const SpotPage = mod.default;
    const ui = await SpotPage({
      params: Promise.resolve({ spot: "itamambuca" }),
      searchParams: Promise.resolve({}),
    });
    const { container } = render(ui);
    // The Suspense fallback (skeleton) renders synchronously and surfaces
    // the spot name immediately — the fast-paint shell that fixes the
    // cold-cache "blank page" experience. The post-fallback Desktop/Mobile
    // render is covered by component tests + Playwright e2e since async
    // server components don't auto-resolve under jsdom.
    expect(container.textContent).toContain("Itamambuca");
    expect(getForecastMock).toHaveBeenCalledWith(
      "itamambuca",
      expect.any(String),
      "auto",
    );
  });

  it("threads ?gear= through to getForecast", async () => {
    getForecastMock.mockResolvedValueOnce(MOCK_FORECAST);
    const mod = await import("./page");
    const SpotPage = mod.default;
    await SpotPage({
      params: Promise.resolve({ spot: "itamambuca" }),
      searchParams: Promise.resolve({ gear: "bodyboard" }),
    });
    expect(getForecastMock).toHaveBeenCalledWith(
      "itamambuca",
      expect.any(String),
      "bodyboard",
    );
  });

  it("maps legacy ?gear= keys to their canonical names", async () => {
    getForecastMock.mockResolvedValueOnce(MOCK_FORECAST);
    const mod = await import("./page");
    const SpotPage = mod.default;
    await SpotPage({
      params: Promise.resolve({ spot: "itamambuca" }),
      searchParams: Promise.resolve({ gear: "bb" }),
    });
    expect(getForecastMock).toHaveBeenCalledWith(
      "itamambuca",
      expect.any(String),
      "bodyboard",
    );
  });

  it("falls back to 'auto' when ?gear= is unknown", async () => {
    getForecastMock.mockResolvedValueOnce(MOCK_FORECAST);
    const mod = await import("./page");
    const SpotPage = mod.default;
    await SpotPage({
      params: Promise.resolve({ spot: "itamambuca" }),
      searchParams: Promise.resolve({ gear: "rocketship" }),
    });
    expect(getForecastMock).toHaveBeenCalledWith(
      "itamambuca",
      expect.any(String),
      "auto",
    );
  });

  it("threads ?date= through to getForecast when within window", async () => {
    getForecastMock.mockResolvedValueOnce(MOCK_FORECAST);
    const { todayISO, addDaysISO } = await import("@/lib/date");
    const future = addDaysISO(todayISO(), 3);
    const mod = await import("./page");
    const SpotPage = mod.default;
    await SpotPage({
      params: Promise.resolve({ spot: "itamambuca" }),
      searchParams: Promise.resolve({ date: future }),
    });
    expect(getForecastMock).toHaveBeenCalledWith(
      "itamambuca",
      future,
      "auto",
    );
  });

  it("falls back to today when ?date= is malformed or out of range", async () => {
    getForecastMock.mockResolvedValueOnce(MOCK_FORECAST);
    const { todayISO } = await import("@/lib/date");
    const today = todayISO();
    const mod = await import("./page");
    const SpotPage = mod.default;
    await SpotPage({
      params: Promise.resolve({ spot: "itamambuca" }),
      searchParams: Promise.resolve({ date: "2099-99-99" }),
    });
    expect(getForecastMock).toHaveBeenCalledWith(
      "itamambuca",
      today,
      "auto",
    );
  });

  it("calls notFound() for an unknown slug", async () => {
    const mod = await import("./page");
    const SpotPage = mod.default;
    await expect(
      SpotPage({
        params: Promise.resolve({ spot: "atlantis" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow(/__NOT_FOUND__/);
  });
});
