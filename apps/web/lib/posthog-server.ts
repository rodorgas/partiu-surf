import { PostHog } from "posthog-node";

let client: PostHog | null = null;

export function getPostHogServer(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  if (!key) return null;
  if (!client) {
    client = new PostHog(key, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return client;
}

/**
 * Pulls the browser's PostHog distinct_id from its cookie so server-side
 * events join with client-side ones for the same visitor. Cookie name is
 * `ph_<project_key>_posthog` and its value is JSON with `distinct_id`.
 * Falls back to the provided anonymous id (e.g. the rate-limiter's IP hash).
 */
export function distinctIdFromRequest(req: Request, fallback: string): string {
  const key = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  if (!key) return fallback;
  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return fallback;
  const cookieName = `ph_${key}_posthog`;
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${cookieName}=`));
  if (!match) return fallback;
  try {
    const raw = decodeURIComponent(match.slice(cookieName.length + 1));
    const parsed = JSON.parse(raw) as { distinct_id?: unknown };
    if (typeof parsed.distinct_id === "string") return parsed.distinct_id;
  } catch {
    // fall through
  }
  return fallback;
}
