import { describe, expect, it, vi } from "vitest";

const { memory } = await vi.hoisted(async () => {
  const { MemoryRedis } = await import("./__mocks__/upstash-redis-memory");
  return { memory: new MemoryRedis() };
});

vi.mock("@upstash/redis", () => ({
  Redis: Object.assign(vi.fn(() => memory), { fromEnv: () => memory }),
}));

const { forecastLimiter, chatLimiter, clientId } = await import("./ratelimit");
void memory; // referenced for side effects (mock binding above)

describe("ratelimit.ts", () => {
  describe("clientId()", () => {
    it("returns the first IP from x-forwarded-for", () => {
      const req = new Request("https://example.com", {
        headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
      });
      expect(clientId(req)).toBe("1.2.3.4");
    });

    it("trims whitespace from x-forwarded-for entries", () => {
      const req = new Request("https://example.com", {
        headers: { "x-forwarded-for": "  9.9.9.9  , 1.1.1.1" },
      });
      expect(clientId(req)).toBe("9.9.9.9");
    });

    it("falls back to x-real-ip when x-forwarded-for is absent", () => {
      const req = new Request("https://example.com", {
        headers: { "x-real-ip": "10.0.0.5" },
      });
      expect(clientId(req)).toBe("10.0.0.5");
    });

    it("returns 'anon' when no client headers are present", () => {
      const req = new Request("https://example.com");
      expect(clientId(req)).toBe("anon");
    });

    it("prefers x-forwarded-for over x-real-ip", () => {
      const req = new Request("https://example.com", {
        headers: {
          "x-forwarded-for": "1.2.3.4",
          "x-real-ip": "10.0.0.5",
        },
      });
      expect(clientId(req)).toBe("1.2.3.4");
    });

    it("falls back to x-real-ip when x-forwarded-for is empty", () => {
      const req = new Request("https://example.com", {
        headers: {
          "x-forwarded-for": "",
          "x-real-ip": "10.0.0.5",
        },
      });
      expect(clientId(req)).toBe("10.0.0.5");
    });
  });

  describe("limiter configuration", () => {
    it("forecastLimiter is configured with rl:forecast prefix", () => {
      // @ts-expect-error Ratelimit doesn't expose prefix on its public type
      expect(forecastLimiter.prefix).toBe("rl:forecast");
    });

    it("chatLimiter is configured with rl:chat prefix", () => {
      // @ts-expect-error see above
      expect(chatLimiter.prefix).toBe("rl:chat");
    });

    it("limiters use independent prefixes (no key collisions)", () => {
      // @ts-expect-error see above
      expect(forecastLimiter.prefix).not.toBe(chatLimiter.prefix);
    });
  });
});
