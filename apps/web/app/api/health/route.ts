import { redis } from "@/lib/cache";

/**
 * Smoke route — confirms Upstash is reachable from a deployed function.
 * Returns `{ ok: boolean, latencyMs: number }`.
 */
export async function GET() {
  const start = Date.now();
  try {
    const pong = await redis.ping();
    return Response.json({
      ok: pong === "PONG",
      latencyMs: Date.now() - start,
    });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 503 },
    );
  }
}
