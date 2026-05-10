import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Desktop } from "./Desktop";
import { MOCK_FORECAST } from "@/lib/data";

describe("<Desktop />", () => {
  it("renders without crashing and shows the spot h1 + score", () => {
    render(<Desktop data={MOCK_FORECAST} spot="itamambuca" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Itamambuca");
    // Score 8.9 appears in the wedge svg as text.
    expect(screen.getAllByText("8.9").length).toBeGreaterThan(0);
  });

  it("renders 13 hourly rows in the table", () => {
    const { container } = render(<Desktop data={MOCK_FORECAST} spot="itamambuca" />);
    // Each row has a label like "06h", "07h", ... "18h".
    for (const r of MOCK_FORECAST.hours) {
      expect(container.textContent).toContain(r.h);
    }
  });

  it("score wedge SVG arc path uses the correct endpoint for score=8.9", () => {
    const { container } = render(<Desktop data={MOCK_FORECAST} spot="itamambuca" />);
    // Replicate the geometry from the component: cx=110, cy=116, r=86, t=0.89.
    const t = 0.89;
    const ang = Math.PI * (1 - t);
    const x = (110 + 86 * Math.cos(ang)).toFixed(2);
    const y = (116 - 86 * Math.sin(ang)).toFixed(2);
    const expectedFragment = `A 86 86 0 0 1 ${x} ${y}`;
    const svgs = container.querySelectorAll("path");
    const matched = Array.from(svgs).some((p) => p.getAttribute("d")?.includes(expectedFragment));
    expect(matched).toBe(true);
  });

  it("peak hour (09h) gets coral text color in the hour table", () => {
    const { container } = render(<Desktop data={MOCK_FORECAST} spot="itamambuca" />);
    const spans = container.querySelectorAll("span");
    const peakLabel = Array.from(spans).find((s) => s.textContent === "09h");
    expect(peakLabel).toBeTruthy();
    expect(peakLabel?.getAttribute("style")?.toLowerCase()).toContain("rgb(226, 106, 74)");
  });

  it("shows suggestion buttons matching the data", () => {
    render(<Desktop data={MOCK_FORECAST} spot="itamambuca" />);
    for (const s of MOCK_FORECAST.suggestions) {
      expect(screen.getByRole("button", { name: new RegExp(s.replace(/\?/g, "\\?")) })).toBeInTheDocument();
    }
  });
});
