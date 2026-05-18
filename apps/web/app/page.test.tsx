import { describe, expect, it, vi } from "vitest";

// next/navigation's `redirect` throws a NEXT_REDIRECT sentinel — we just verify
// that Page() invokes it with the default slug. No DOM rendering needed.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`__REDIRECT__:${url}`);
  }),
}));

describe("<Page /> (root)", () => {
  it("redirects to the default spot slug", async () => {
    const { default: Page } = await import("./page");
    const { DEFAULT_SPOT_SLUG } = await import("@/lib/spots");
    expect(() => Page()).toThrowError(
      new RegExp(`__REDIRECT__:/${DEFAULT_SPOT_SLUG}`),
    );
  });
});
