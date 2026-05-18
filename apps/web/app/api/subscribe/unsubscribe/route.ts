// GET /api/subscribe/unsubscribe?token=...
//
// Unsubscribe links land here. Idempotent on the success path — the token
// stays valid even after the first hit so accidental re-clicks don't 404.
// The record is moved to status="unsubscribed" and pulled from the active
// index. Re-subscribing creates a new record from scratch.

import { unsubscribe } from "@/lib/subscriptions";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return Response.json(
      { ok: false, error: "missing token" },
      { status: 400 },
    );
  }
  const sub = await unsubscribe(token);
  if (!sub) {
    return Response.json(
      { ok: false, error: "invalid token" },
      { status: 404 },
    );
  }
  return Response.json({ ok: true, status: sub.status });
}
