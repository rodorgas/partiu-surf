import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type { Forecast } from "@/lib/data";
import { MOCK_FORECAST } from "@/lib/data";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("__NOT_FOUND__");
  }),
}));

const getForecastMock = vi.fn<(slug: string, date: string) => Promise<Forecast>>();
vi.mock("@/lib/forecast", () => ({
  getForecast: (slug: string, date: string) => getForecastMock(slug, date),
}));

describe("<SpotPage />", () => {
  it("generateStaticParams() includes every known slug", async () => {
    const { generateStaticParams } = await import("./page");
    const params = await generateStaticParams();
    const slugs = params.map((p) => p.spot).sort();
    expect(slugs).toContain("itamambuca");
    expect(slugs).toContain("arpoador");
  });

  it("renders both desktop and mobile layouts with real forecast data", async () => {
    getForecastMock.mockResolvedValueOnce(MOCK_FORECAST);
    const mod = await import("./page");
    const SpotPage = mod.default;
    const ui = await SpotPage({ params: Promise.resolve({ spot: "itamambuca" }) });
    const { container } = render(ui);
    expect(container.querySelector(".layout-desktop")).not.toBeNull();
    expect(container.querySelector(".layout-mobile")).not.toBeNull();
    expect(container.textContent).toContain("Itamambuca");
  });

  it("calls notFound() for an unknown slug", async () => {
    const mod = await import("./page");
    const SpotPage = mod.default;
    await expect(
      SpotPage({ params: Promise.resolve({ spot: "atlantis" }) }),
    ).rejects.toThrow(/__NOT_FOUND__/);
  });
});
