// GET /api/subscribe/confirm?token=...
//
// Idempotent: calling with an already-consumed token returns 404 because the
// token is deleted from Redis after first use. The /api/subscribe response
// includes a fresh token on each re-subscribe, so the user just hits POST
// again to get a new one.

import { confirm } from "@/lib/subscriptions";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return Response.json(
      { ok: false, error: "missing token" },
      { status: 400 },
    );
  }
  const sub = await confirm(token);
  if (!sub) {
    return Response.json(
      { ok: false, error: "invalid or expired token" },
      { status: 404 },
    );
  }
  return Response.json({
    ok: true,
    id: sub.id,
    status: sub.status,
    channel: sub.channel,
    frequency: sub.frequency,
    weekday: sub.weekday,
    spots: sub.spots,
  });
}
