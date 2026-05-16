import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Desktop } from "./Desktop";
import { MOCK_FORECAST } from "@/lib/data";

describe("<Desktop />", () => {
  it("renders without crashing and shows the spot h1 + score", () => {
    render(<Desktop data={MOCK_FORECAST} spot="itamambuca" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Itamambuca");
    // Score 8.9 appears in the wedge svg as text.
    expect(screen.getAllByText("8.9").length).toBeGreaterThan(0);
  });

  it("renders 14 hourly rows in the table", () => {
    const { container } = render(<Desktop data={MOCK_FORECAST} spot="itamambuca" />);
    // Each row has a label like "05h", "06h", ... "18h".
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

// ---- chat behavior (Phase 4) ---------------------------------------------

type StreamControls = {
  push: (text: string) => Promise<void>;
  close: () => Promise<void>;
};

/**
 * Build a Response with a manually-driven SSE body. Each `push(text)` enqueues
 * a content_block_delta frame; `close()` closes the stream so the consumer's
 * reader loop exits.
 */
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
          JSON.stringify({
            type: "content_block_delta",
            delta: { type: "text_delta", text },
          }) + "\n",
        ),
      );
    },
    async close() {
      controller.enqueue(
        encoder.encode(JSON.stringify({ type: "message_stop" }) + "\n"),
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

describe("<Desktop /> chat", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts to /api/chat on submit and renders tokens progressively", async () => {
    const { res, ctrl } = fakeSSEResponse();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(res);

    render(<Desktop data={MOCK_FORECAST} spot="itamambuca" />);
    const input = screen.getByPlaceholderText("pergunta sobre a previsão…");
    fireEvent.change(input, { target: { value: "vale ir agora?" } });
    fireEvent.submit(input.closest("form")!);

    // User message appears immediately.
    await waitFor(() => {
      expect(screen.getByText("vale ir agora?")).toBeInTheDocument();
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/chat",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("itamambuca"),
      }),
    );

    // First chunk → streaming bubble grows.
    await act(async () => {
      await ctrl.push("bom dia,");
    });
    await waitFor(() => {
      expect(screen.getByTestId("chat-streaming")).toHaveTextContent("bom dia,");
    });

    await act(async () => {
      await ctrl.push(" tá rendendo.");
    });
    await waitFor(() => {
      expect(screen.getByTestId("chat-streaming")).toHaveTextContent(
        "bom dia, tá rendendo.",
      );
    });

    // Close the stream → final message moves into history.
    await act(async () => {
      await ctrl.close();
    });

    await waitFor(() => {
      expect(screen.queryByTestId("chat-streaming")).toBeNull();
      expect(
        screen.getByText("bom dia, tá rendendo.", { exact: false }),
      ).toBeInTheDocument();
    });
  });

  it("renders an amber rate-limit bubble on 429", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "rate_limited",
          message: "Volta em 12 min.",
          remaining: 0,
        }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<Desktop data={MOCK_FORECAST} spot="itamambuca" />);
    const input = screen.getByPlaceholderText("pergunta sobre a previsão…");
    fireEvent.change(input, { target: { value: "spam" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => {
      expect(screen.getByTestId("chat-error-rate_limit")).toHaveTextContent(
        "Volta em 12 min.",
      );
    });
  });

  it("clicking a suggestion fires a chat send (no second click)", async () => {
    const { res, ctrl } = fakeSSEResponse();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(res);

    render(<Desktop data={MOCK_FORECAST} spot="itamambuca" />);
    const first = MOCK_FORECAST.suggestions[0];
    fireEvent.click(
      screen.getByRole("button", {
        name: new RegExp(first.replace(/\?/g, "\\?")),
      }),
    );

    // The user bubble (full match) shows up — proof the send fired without
    // a second button click on submit.
    await waitFor(() => {
      expect(screen.getByText(first)).toBeInTheDocument();
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Drain so the test cleans up.
    await act(async () => {
      await ctrl.push("ok");
      await ctrl.close();
    });
  });
});
