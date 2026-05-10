import { describe, expect, it, beforeAll } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Mobile } from "./Mobile";
import { MOCK_FORECAST } from "@/lib/data";

beforeAll(() => {
  // jsdom defaults innerHeight = 768; we make it deterministic.
  Object.defineProperty(window, "innerHeight", { value: 1000, writable: true });
});

function drag(startY: number, endY: number) {
  const grabber = screen.getByTestId("sheet-grabber");
  fireEvent.touchStart(grabber, { touches: [{ clientY: startY }] });
  fireEvent.touchMove(grabber, { touches: [{ clientY: endY }] });
  fireEvent.touchEnd(grabber, { changedTouches: [{ clientY: endY }] });
}

describe("<Mobile /> sheet drag", () => {
  it("dragging the grabber up enough lands on half", () => {
    render(<Mobile data={MOCK_FORECAST} spot="itamambuca" />);
    // Start at peek (18%). Drag up 35% of viewport (350px) -> final ≈ 53% -> half snap.
    drag(900, 550);
    expect(screen.getByTestId("mobile-sheet").getAttribute("data-state")).toBe("half");
  });

  it("dragging the grabber up far snaps to full", () => {
    render(<Mobile data={MOCK_FORECAST} spot="itamambuca" />);
    // Drag from 900 to 200 -> +70% -> ~88% -> full snap.
    drag(900, 200);
    expect(screen.getByTestId("mobile-sheet").getAttribute("data-state")).toBe("full");
  });

  it("releasing near the peek zone snaps back to peek", () => {
    render(<Mobile data={MOCK_FORECAST} spot="itamambuca" />);
    // Drag up only 5% -> still close to peek.
    drag(900, 850);
    expect(screen.getByTestId("mobile-sheet").getAttribute("data-state")).toBe("peek");
  });
});
