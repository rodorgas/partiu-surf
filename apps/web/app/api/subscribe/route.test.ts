import { beforeEach, describe, expect, it, vi } from "vitest";

const { memory } = await vi.hoisted(async () => {
  const { MemoryRedis } = await import("@/lib/__mocks__/upstash-redis-memory");
  return { memory: new MemoryRedis() };
});

vi.mock("@upstash/redis", () => ({
  Redis: Object.assign(vi.fn(() => memory), { fromEnv: () => memory }),
}));

// Substitute the rate limiter — Upstash's Ratelimit uses Lua scripts
// (evalsha) the in-memory mock can't run. Same approach as chat/route.test.ts.
const { ratelimitState } = vi.hoisted(() => ({
  ratelimitState: {
    requests: new Map<string, number>(),
    cap: 5,
  },
}));

vi.mock("@/lib/ratelimit", () => ({
  subscribeLimiter: {
    limit: vi.fn(async (id: string) => {
      const used = ratelimitState.requests.get(id) ?? 0;
      ratelimitState.requests.set(id, used + 1);
      const success = used < ratelimitState.cap;
      return {
        success,
        remaining: Math.max(0, ratelimitState.cap - used - 1),
        reset: Date.now() + 600_000,
      };
    }),
  },
  clientId: (req: Request) =>
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon",
}));

const { POST } = await import("./route");
const { GET: confirmGET } = await import("./confirm/route");
const { GET: unsubGET } = await import("./unsubscribe/route");

function postSubscribe(body: object) {
  return POST(
    new Request("http://localhost/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(async () => {
  await memory.flushall();
  ratelimitState.requests.clear();
});

describe("POST /api/subscribe", () => {
  it("429s after the per-IP limit is exhausted", async () => {
    const ip = "203.0.113.42";
    const body = {
      channel: "email",
      contact: "rl@example.com",
      frequency: "daily",
      spots: ["arpoador"],
    };
    const headers = { "Content-Type": "application/json", "x-forwarded-for": ip };

    // Limit is 5/10min — burn through them.
    for (let i = 0; i < 5; i++) {
      const res = await POST(
        new Request("http://localhost/api/subscribe", {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        }),
      );
      expect(res.status).toBe(200);
    }

    const blocked = await POST(
      new Request("http://localhost/api/subscribe", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }),
    );
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
  });

  it("400s on invalid JSON", async () => {
    const res = await POST(
      new Request("http://localhost/api/subscribe", {
        method: "POST",
        body: "not json",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("400s on validation errors with field-level messages", async () => {
    const res = await postSubscribe({
      channel: "email",
      contact: "not-an-email",
      frequency: "daily",
      spots: ["arpoador"],
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; errors: { field: string }[] };
    expect(body.ok).toBe(false);
    expect(body.errors.some((e) => e.field === "contact")).toBe(true);
  });

  it("creates a pending subscription and returns its confirm token", async () => {
    const res = await postSubscribe({
      channel: "email",
      contact: "rider@example.com",
      frequency: "weekly",
      weekday: 3,
      spots: ["arpoador", "prainha"],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      id: string;
      status: string;
      confirmToken: string;
    };
    expect(body.ok).toBe(true);
    expect(body.status).toBe("pending");
    expect(body.confirmToken).toBeTruthy();
    expect(body.id).toBeTruthy();
  });

  it("full lifecycle: subscribe → confirm → unsubscribe", async () => {
    const subRes = await postSubscribe({
      channel: "email",
      contact: "lifecycle@example.com",
      frequency: "daily",
      spots: ["arpoador"],
    });
    const sub = (await subRes.json()) as { confirmToken: string; id: string };

    const confirmRes = await confirmGET(
      new Request(
        `http://localhost/api/subscribe/confirm?token=${sub.confirmToken}`,
      ),
    );
    expect(confirmRes.status).toBe(200);
    const confirmed = (await confirmRes.json()) as {
      ok: boolean;
      status: string;
    };
    expect(confirmed.status).toBe("active");

    // Read unsubscribe token off the stored record (it's not returned to the
    // client from /api/subscribe — only from confirm-emails we'll add later).
    const { getById } = await import("@/lib/subscriptions");
    const stored = await getById(sub.id);
    expect(stored?.unsubscribeToken).toBeTruthy();

    const unsubRes = await unsubGET(
      new Request(
        `http://localhost/api/subscribe/unsubscribe?token=${stored!.unsubscribeToken}`,
      ),
    );
    expect(unsubRes.status).toBe(200);
    const unsubBody = (await unsubRes.json()) as { status: string };
    expect(unsubBody.status).toBe("unsubscribed");
  });
});

describe("GET /api/subscribe/confirm", () => {
  it("400 without token", async () => {
    const res = await confirmGET(
      new Request("http://localhost/api/subscribe/confirm"),
    );
    expect(res.status).toBe(400);
  });

  it("404 for unknown token", async () => {
    const res = await confirmGET(
      new Request("http://localhost/api/subscribe/confirm?token=bogus"),
    );
    expect(res.status).toBe(404);
  });
});

describe("GET /api/subscribe/unsubscribe", () => {
  it("400 without token", async () => {
    const res = await unsubGET(
      new Request("http://localhost/api/subscribe/unsubscribe"),
    );
    expect(res.status).toBe(400);
  });

  it("404 for unknown token", async () => {
    const res = await unsubGET(
      new Request("http://localhost/api/subscribe/unsubscribe?token=bogus"),
    );
    expect(res.status).toBe(404);
  });
});
