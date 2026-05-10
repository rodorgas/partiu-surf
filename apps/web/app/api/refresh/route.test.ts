import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { memory } = await vi.hoisted(async () => {
  const { MemoryRedis } = await import("@/lib/__mocks__/upstash-redis-memory");
  return { memory: new MemoryRedis() };
});

vi.mock("@upstash/redis", () => ({
  Redis: Object.assign(vi.fn(() => memory), { fromEnv: () => memory }),
}));

const revalidateTagMock = vi.fn();
vi.mock("next/cache", () => ({
  revalidateTag: (tag: string, profile: string) =>
    revalidateTagMock(tag, profile),
}));

const { POST } = await import("./route");
const { setCached, getCached } = await import("@/lib/cache");

function req(body: object | null, secret?: string) {
  return new Request("http://localhost/api/refresh", {
    method: "POST",
    headers: secret ? { "x-refresh-secret": secret } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("POST /api/refresh", () => {
  beforeEach(async () => {
    await memory.flushall();
    revalidateTagMock.mockClear();
    process.env.REFRESH_SECRET = "shh";
  });

  afterEach(() => {
    delete process.env.REFRESH_SECRET;
  });

  it("503 when REFRESH_SECRET is not configured", async () => {
    delete process.env.REFRESH_SECRET;
    const res = await POST(req({}));
    expect(res.status).toBe(503);
  });

  it("403 when secret header is missing or wrong", async () => {
    expect((await POST(req({}))).status).toBe(403);
    expect((await POST(req({}, "wrong"))).status).toBe(403);
  });

  it("clears the whole forecast namespace when no body is provided", async () => {
    await setCached("forecast", "itamambuca:2026-05-11", { ok: 1 });
    await setCached("forecast", "arpoador:2026-05-11", { ok: 2 });
    // Keep an unrelated namespace untouched.
    await setCached("tide:foo", "2026-05-11", { ok: 3 });

    const res = await POST(req(null, "shh"));
    expect(res.status).toBe(200);
    expect(await getCached("forecast", "itamambuca:2026-05-11")).toBeNull();
    expect(await getCached("forecast", "arpoador:2026-05-11")).toBeNull();
    expect(await getCached("tide:foo", "2026-05-11")).toEqual({ ok: 3 });
    expect(revalidateTagMock).toHaveBeenCalledWith("forecast", "max");
  });

  it("clears a single spot+date when provided", async () => {
    await setCached("forecast", "itamambuca:2026-05-11", { ok: 1 });
    await setCached("forecast", "itamambuca:2026-05-12", { ok: 2 });

    const res = await POST(
      req({ slug: "itamambuca", date: "2026-05-11" }, "shh"),
    );
    expect(res.status).toBe(200);
    expect(await getCached("forecast", "itamambuca:2026-05-11")).toBeNull();
    expect(await getCached("forecast", "itamambuca:2026-05-12")).toEqual({
      ok: 2,
    });
  });
});
