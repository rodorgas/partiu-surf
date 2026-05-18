import { beforeEach, describe, expect, it, vi } from "vitest";

const { memory } = await vi.hoisted(async () => {
  const { MemoryRedis } = await import("@/lib/__mocks__/upstash-redis-memory");
  return { memory: new MemoryRedis() };
});

vi.mock("@upstash/redis", () => ({
  Redis: Object.assign(vi.fn(() => memory), { fromEnv: () => memory }),
}));

const {
  validate,
  normalizeContact,
  createPending,
  confirm,
  unsubscribe,
  getById,
  listActiveDaily,
  listActiveWeekly,
} = await import("./subscriptions");

beforeEach(async () => {
  await memory.flushall();
});

describe("validate", () => {
  it("accepts a well-formed daily email subscription", () => {
    const r = validate({
      channel: "email",
      contact: "Foo@Example.COM",
      frequency: "daily",
      spots: ["arpoador", "leblon"],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.normalizedContact).toBe("foo@example.com");
      expect(r.value.weekday).toBeNull();
    }
  });

  it("requires weekday for weekly", () => {
    const r = validate({
      channel: "email",
      contact: "foo@bar.com",
      frequency: "weekly",
      spots: ["arpoador"],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.field === "weekday")).toBe(true);
    }
  });

  it("rejects weekday on daily frequency", () => {
    const r = validate({
      channel: "email",
      contact: "foo@bar.com",
      frequency: "daily",
      weekday: 3,
      spots: ["arpoador"],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects unknown spots", () => {
    const r = validate({
      channel: "email",
      contact: "foo@bar.com",
      frequency: "daily",
      spots: ["arpoador", "not-a-real-spot"],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.field === "spots")).toBe(true);
    }
  });

  it("rejects empty spots", () => {
    const r = validate({
      channel: "email",
      contact: "foo@bar.com",
      frequency: "daily",
      spots: [],
    });
    expect(r.ok).toBe(false);
  });

  it("deduplicates spots", () => {
    const r = validate({
      channel: "email",
      contact: "foo@bar.com",
      frequency: "daily",
      spots: ["arpoador", "arpoador", "leblon"],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.spots).toEqual(["arpoador", "leblon"]);
    }
  });

  it("validates email format", () => {
    expect(
      validate({
        channel: "email",
        contact: "not-an-email",
        frequency: "daily",
        spots: ["arpoador"],
      }).ok,
    ).toBe(false);
  });

  it("normalizes WhatsApp phone numbers", () => {
    expect(normalizeContact("whatsapp", "+55 (21) 98765-4321")).toBe(
      "+5521987654321",
    );
    expect(normalizeContact("whatsapp", "5521987654321")).toBe("5521987654321");
  });

  it("rejects phone numbers that are too short or too long", () => {
    expect(
      validate({
        channel: "whatsapp",
        contact: "+1234",
        frequency: "daily",
        spots: ["arpoador"],
      }).ok,
    ).toBe(false);
    expect(
      validate({
        channel: "whatsapp",
        contact: "+1234567890123456",
        frequency: "daily",
        spots: ["arpoador"],
      }).ok,
    ).toBe(false);
  });
});

describe("subscribe → confirm → unsubscribe lifecycle", () => {
  it("creates pending, confirms into active, indexes into daily set", async () => {
    const r = await createPending({
      channel: "email",
      contact: "rider@example.com",
      frequency: "daily",
      spots: ["arpoador"],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const sub = r.subscription;
    expect(sub.status).toBe("pending");
    expect(sub.confirmToken).toBeTruthy();

    // Not in active index yet.
    expect(await listActiveDaily()).toEqual([]);

    const confirmed = await confirm(sub.confirmToken!);
    expect(confirmed?.status).toBe("active");
    expect(confirmed?.confirmedAt).toBeTruthy();
    expect(confirmed?.confirmToken).toBeNull();

    const daily = await listActiveDaily();
    expect(daily.length).toBe(1);
    expect(daily[0].id).toBe(sub.id);
  });

  it("indexes weekly subs under the right weekday", async () => {
    const wed = await createPending({
      channel: "whatsapp",
      contact: "+5521987654321",
      frequency: "weekly",
      weekday: 3,
      spots: ["prainha", "macumba"],
    });
    expect(wed.ok).toBe(true);
    if (!wed.ok) return;
    await confirm(wed.subscription.confirmToken!);

    expect((await listActiveWeekly(3)).length).toBe(1);
    expect(await listActiveWeekly(2)).toEqual([]);
    expect(await listActiveDaily()).toEqual([]);
  });

  it("re-subscribing with same contact updates the same record", async () => {
    const first = await createPending({
      channel: "email",
      contact: "rider@example.com",
      frequency: "daily",
      spots: ["arpoador"],
    });
    if (!first.ok) throw new Error("first failed");
    await confirm(first.subscription.confirmToken!);

    const second = await createPending({
      channel: "email",
      contact: "RIDER@example.com",
      frequency: "weekly",
      weekday: 5,
      spots: ["prainha"],
    });
    if (!second.ok) throw new Error("second failed");

    // Same id — dedupe on normalized contact.
    expect(second.subscription.id).toBe(first.subscription.id);
    // Unsubscribe token is preserved across updates.
    expect(second.subscription.unsubscribeToken).toBe(
      first.subscription.unsubscribeToken,
    );

    // Old confirm token is invalidated.
    expect(await confirm(first.subscription.confirmToken!)).toBeNull();

    // New confirm token works and moves the record off the daily index
    // onto the weekly Friday index.
    const confirmed = await confirm(second.subscription.confirmToken!);
    expect(confirmed?.frequency).toBe("weekly");
    expect(confirmed?.weekday).toBe(5);
    expect(await listActiveDaily()).toEqual([]);
    expect((await listActiveWeekly(5)).length).toBe(1);
  });

  it("invalidates the confirm token after use", async () => {
    const r = await createPending({
      channel: "email",
      contact: "once@example.com",
      frequency: "daily",
      spots: ["arpoador"],
    });
    if (!r.ok) throw new Error("create failed");
    const token = r.subscription.confirmToken!;
    expect((await confirm(token))?.status).toBe("active");
    expect(await confirm(token)).toBeNull();
  });

  it("unsubscribe removes from active index but keeps the record", async () => {
    const r = await createPending({
      channel: "email",
      contact: "leaver@example.com",
      frequency: "daily",
      spots: ["arpoador"],
    });
    if (!r.ok) throw new Error("create failed");
    const sub = r.subscription;
    await confirm(sub.confirmToken!);

    const result = await unsubscribe(sub.unsubscribeToken);
    expect(result?.status).toBe("unsubscribed");
    expect(await listActiveDaily()).toEqual([]);

    // Record itself is still retrievable for audit.
    expect((await getById(sub.id))?.status).toBe("unsubscribed");
  });

  it("unsubscribe is idempotent on already-unsubscribed records", async () => {
    const r = await createPending({
      channel: "email",
      contact: "double@example.com",
      frequency: "daily",
      spots: ["arpoador"],
    });
    if (!r.ok) throw new Error("create failed");
    await confirm(r.subscription.confirmToken!);
    await unsubscribe(r.subscription.unsubscribeToken);
    // Second call still resolves (token never expires) and returns the record.
    const again = await unsubscribe(r.subscription.unsubscribeToken);
    expect(again?.status).toBe("unsubscribed");
  });

  it("confirm returns null for unknown tokens", async () => {
    expect(await confirm("bogus")).toBeNull();
  });
});
