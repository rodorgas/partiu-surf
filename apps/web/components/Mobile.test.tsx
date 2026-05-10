import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Mobile, nearestSnap, SNAPS } from "./Mobile";
import { MOCK_FORECAST } from "@/lib/data";

describe("nearestSnap()", () => {
  it("snaps to peek for low percentages", () => {
    expect(nearestSnap(10)).toBe("peek");
    expect(nearestSnap(28)).toBe("peek");
  });
  it("snaps to half in the middle", () => {
    expect(nearestSnap(40)).toBe("half");
    expect(nearestSnap(60)).toBe("half");
  });
  it("snaps to full at the top", () => {
    expect(nearestSnap(80)).toBe("full");
    expect(nearestSnap(95)).toBe("full");
  });
  it("uses the configured SNAPS values", () => {
    expect(SNAPS.peek).toBe(18);
    expect(SNAPS.half).toBe(52);
    expect(SNAPS.full).toBe(92);
  });
});

describe("<Mobile />", () => {
  it("renders with the sheet starting at peek state", () => {
    render(<Mobile data={MOCK_FORECAST} />);
    const sheet = screen.getByTestId("mobile-sheet");
    expect(sheet.getAttribute("data-state")).toBe("peek");
  });

  it("cycles state peek → half → full → peek when the grabber is clicked", () => {
    render(<Mobile data={MOCK_FORECAST} />);
    const grabber = screen.getByTestId("sheet-grabber");
    const sheet = screen.getByTestId("mobile-sheet");
    expect(sheet.getAttribute("data-state")).toBe("peek");
    fireEvent.click(grabber);
    expect(screen.getByTestId("mobile-sheet").getAttribute("data-state")).toBe("half");
    fireEvent.click(grabber);
    expect(screen.getByTestId("mobile-sheet").getAttribute("data-state")).toBe("full");
    fireEvent.click(grabber);
    expect(screen.getByTestId("mobile-sheet").getAttribute("data-state")).toBe("peek");
  });

  it("renders the dim overlay only in full state", () => {
    render(<Mobile data={MOCK_FORECAST} />);
    expect(screen.queryByTestId("mobile-dim")).toBeNull();
    const grabber = screen.getByTestId("sheet-grabber");
    fireEvent.click(grabber); // half
    expect(screen.queryByTestId("mobile-dim")).toBeNull();
    fireEvent.click(grabber); // full
    expect(screen.queryByTestId("mobile-dim")).not.toBeNull();
    fireEvent.click(grabber); // peek
    expect(screen.queryByTestId("mobile-dim")).toBeNull();
  });
});
