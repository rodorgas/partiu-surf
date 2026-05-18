// POST /api/subscribe — create or update a newsletter subscription.
//
// Body:
//   {
//     channel: "email" | "whatsapp",
//     contact: string,
//     frequency: "daily" | "weekly",
//     weekday?: 0..6   // required when frequency=weekly (Sun=0)
//     spots: string[]
//   }
//
// Response 200:
//   { ok: true, id, status: "pending" | "active", confirmToken }
//
// Response 400:
//   { ok: false, errors: [{ field, message }] }
//
// Delivery is not wired up yet — the confirmToken is returned in the response
// so the client can show a confirm link, and so the integration test can
// drive the full flow. Once we wire Resend / WhatsApp, drop confirmToken
// from the response and send it out-of-band.

import { clientId, subscribeLimiter } from "@/lib/ratelimit";
import { createPending } from "@/lib/subscriptions";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const id = clientId(req);
  const { success, remaining, reset } = await subscribeLimiter.limit(id);
  if (!success) {
    const minutes = Math.max(1, Math.ceil((reset - Date.now()) / 60_000));
    return Response.json(
      {
        ok: false,
        error: "rate_limited",
        message: `Muitas tentativas. Tenta de novo em ${minutes} min.`,
      },
      {
        status: 429,
        headers: {
          "X-RateLimit-Remaining": String(remaining),
          "Retry-After": String(Math.max(1, Math.ceil((reset - Date.now()) / 1000))),
        },
      },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { ok: false, errors: [{ field: "body", message: "invalid JSON" }] },
      { status: 400 },
    );
  }

  const input = body as Parameters<typeof createPending>[0];
  const result = await createPending(input);
  if (!result.ok) {
    return Response.json({ ok: false, errors: result.errors }, { status: 400 });
  }

  const { subscription } = result;
  return Response.json(
    {
      ok: true,
      id: subscription.id,
      status: subscription.status,
      confirmToken: subscription.confirmToken,
    },
    { headers: { "X-RateLimit-Remaining": String(remaining) } },
  );
}
