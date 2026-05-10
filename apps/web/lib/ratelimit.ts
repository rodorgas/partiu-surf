import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "./cache";

/**
 * Public forecast JSON — generous, mostly defended by edge cache.
 * 60 requests per minute, sliding window.
 */
export const forecastLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "1 m"),
  prefix: "rl:forecast",
});

/**
 * LLM chat — strict, costs real money.
 * 10 requests per hour, sliding window.
 */
export const chatLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 h"),
  prefix: "rl:chat",
});

/**
 * Best-effort client identifier from request headers.
 * Order: x-forwarded-for[0] → x-real-ip → 'anon'.
 */
export function clientId(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "anon";
}
