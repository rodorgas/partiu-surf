import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Stub next/font/google for unit tests — returns inert className+variable strings
// so components that import via app/layout still work in unit tests if needed.
vi.mock("next/font/google", () => {
  const fontStub = () => ({
    className: "stub-font",
    variable: "stub-font-var",
    style: { fontFamily: "stub" },
  });
  return {
    Space_Grotesk: fontStub,
    Bricolage_Grotesque: fontStub,
  };
});

// Phase 2 puts Upstash env behind a check; pre-stub for safety so future tests
// that import lib/redis don't blow up on missing config.
process.env.UPSTASH_REDIS_REST_URL ??= "http://localhost:0";
process.env.UPSTASH_REDIS_REST_TOKEN ??= "test-token";
