import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    render(<Mobile data={MOCK_FORECAST} spot="itamambuca" />);
    const sheet = screen.getByTestId("mobile-sheet");
    expect(sheet.getAttribute("data-state")).toBe("peek");
  });

  it("cycles state peek → half → full → peek when the grabber is clicked", () => {
    render(<Mobile data={MOCK_FORECAST} spot="itamambuca" />);
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
    render(<Mobile data={MOCK_FORECAST} spot="itamambuca" />);
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

// ---- chat behavior (Phase 4) ---------------------------------------------

type StreamControls = {
  push: (text: string) => Promise<void>;
  close: () => Promise<void>;
};

function fakeSSEResponse(status = 200): { res: Response; ctrl: StreamControls } {
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  const ctrl: StreamControls = {
    async push(text: string) {
      controller.enqueue(
        encoder.encode(
          `event: content_block_delta\ndata: ${JSON.stringify({
            type: "content_block_delta",
            delta: { type: "text_delta", text },
          })}\n\n`,
        ),
      );
    },
    async close() {
      controller.enqueue(
        encoder.encode(
          `event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`,
        ),
      );
      controller.close();
    },
  };
  return {
    res: new Response(body, {
      status,
      headers: { "Content-Type": "text/event-stream" },
    }),
    ctrl,
  };
}

describe("<Mobile /> chat", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("tapping a peek-state suggestion expands the sheet to full AND fires send", async () => {
    const { res, ctrl } = fakeSSEResponse();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(res);

    render(<Mobile data={MOCK_FORECAST} spot="itamambuca" />);
    // Peek shows the first 3 suggestions as SuggestionPill buttons.
    const first = MOCK_FORECAST.suggestions[0];
    fireEvent.click(
      screen.getByRole("button", {
        name: new RegExp(first.replace(/\?/g, "\\?")),
      }),
    );

    // Sheet must expand to full.
    await waitFor(() => {
      expect(screen.getByTestId("mobile-sheet").getAttribute("data-state")).toBe(
        "full",
      );
    });

    // And the chat send fired with the suggestion text.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByText(first)).toBeInTheDocument();
    });

    await act(async () => {
      await ctrl.push("ok");
      await ctrl.close();
    });
  });

  it("renders streamed tokens in the full-state thread", async () => {
    const { res, ctrl } = fakeSSEResponse();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(res);

    render(<Mobile data={MOCK_FORECAST} spot="itamambuca" />);
    // Open full sheet by tapping a suggestion.
    fireEvent.click(
      screen.getByRole("button", {
        name: new RegExp(MOCK_FORECAST.suggestions[0].replace(/\?/g, "\\?")),
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("mobile-sheet").getAttribute("data-state")).toBe(
        "full",
      );
    });

    await act(async () => {
      await ctrl.push("vai com calma");
    });

    await waitFor(() => {
      expect(screen.getByTestId("chat-streaming-full")).toHaveTextContent(
        "vai com calma",
      );
    });

    await act(async () => {
      await ctrl.close();
    });
  });

  it("renders an amber rate-limit error in the full thread on 429", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "rate_limited",
          message: "Volta em 7 min.",
          remaining: 0,
        }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<Mobile data={MOCK_FORECAST} spot="itamambuca" />);
    fireEvent.click(
      screen.getByRole("button", {
        name: new RegExp(MOCK_FORECAST.suggestions[0].replace(/\?/g, "\\?")),
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("chat-error-rate_limit")).toHaveTextContent(
        "Volta em 7 min.",
      );
    });
  });
});
