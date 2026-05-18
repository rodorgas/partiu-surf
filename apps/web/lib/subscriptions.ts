// Newsletter subscription storage on Upstash Redis.
//
// Schema:
//   sub:{id}                       JSON blob (canonical record)
//   sub:contact:{normalized}       id  (one subscription per contact)
//   sub:confirm:{token}            id  (24h TTL, cleared on confirm)
//   sub:unsubscribe:{token}        id  (permanent until used)
//   sub:active:daily               SET of ids
//   sub:active:weekly:{0..6}       SET of ids (weekday 0=Sun..6=Sat)
//
// Phone numbers are stored in E.164 (digits only, with leading +). Emails are
// lowercased. The `contact` index key uses the normalized form so re-subscribing
// with "Foo@BAR.com" updates the same record as "foo@bar.com".
//
// Migration note: when we outgrow Redis (>~1K subs, or first time we need
// reporting/joins), port this module to Postgres without touching callers.

import { randomBytes } from "node:crypto";
import { redis } from "./cache";
import { SPOTS } from "./spots";

export type Channel = "email" | "whatsapp";
export type Frequency = "daily" | "weekly";
/** 0=Sun..6=Sat. JS Date.getDay() convention. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type Status = "pending" | "active" | "unsubscribed";

export type Subscription = {
  id: string;
  channel: Channel;
  contact: string;
  frequency: Frequency;
  /** Only set when frequency is "weekly". */
  weekday: Weekday | null;
  spots: string[];
  status: Status;
  /** Cleared once confirmed. */
  confirmToken: string | null;
  unsubscribeToken: string;
  createdAt: string;
  confirmedAt: string | null;
};

export type SubscribeInput = {
  channel: Channel;
  contact: string;
  frequency: Frequency;
  weekday?: number | null;
  spots: string[];
};

export type ValidationError = {
  field: string;
  message: string;
};

const CONFIRM_TTL_S = 24 * 60 * 60;

const KEY = {
  record: (id: string) => `sub:${id}`,
  contact: (normalized: string) => `sub:contact:${normalized}`,
  confirm: (token: string) => `sub:confirm:${token}`,
  unsubscribe: (token: string) => `sub:unsubscribe:${token}`,
  activeDaily: () => `sub:active:daily`,
  activeWeekly: (w: Weekday) => `sub:active:weekly:${w}`,
};

// ---------------------------------------------------------------------------
// Normalization + validation
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Strip everything but digits and a leading +. */
function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  return hasPlus ? `+${digits}` : digits;
}

/** Returns the storage form of a contact for a given channel. */
export function normalizeContact(channel: Channel, raw: string): string {
  if (channel === "email") return raw.trim().toLowerCase();
  return normalizePhone(raw);
}

/**
 * Validates input. Returns parsed/normalized values on success or a list of
 * field errors. Callers should treat a non-empty errors array as a 400.
 */
export function validate(
  input: SubscribeInput,
): { ok: true; value: NormalizedInput } | { ok: false; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  if (input.channel !== "email" && input.channel !== "whatsapp") {
    errors.push({ field: "channel", message: "must be 'email' or 'whatsapp'" });
  }

  const contact =
    typeof input.contact === "string" ? input.contact.trim() : "";
  if (!contact) {
    errors.push({ field: "contact", message: "required" });
  } else if (input.channel === "email") {
    if (!EMAIL_RE.test(contact)) {
      errors.push({ field: "contact", message: "invalid email" });
    }
  } else if (input.channel === "whatsapp") {
    const normalized = normalizePhone(contact);
    const digits = normalized.replace(/^\+/, "");
    if (digits.length < 8 || digits.length > 15) {
      errors.push({
        field: "contact",
        message: "phone must be 8-15 digits (E.164)",
      });
    }
  }

  if (input.frequency !== "daily" && input.frequency !== "weekly") {
    errors.push({ field: "frequency", message: "must be 'daily' or 'weekly'" });
  }

  let weekday: Weekday | null = null;
  if (input.frequency === "weekly") {
    const w = input.weekday;
    if (typeof w !== "number" || !Number.isInteger(w) || w < 0 || w > 6) {
      errors.push({
        field: "weekday",
        message: "weekly subscriptions require weekday 0-6 (Sun=0)",
      });
    } else {
      weekday = w as Weekday;
    }
  } else if (input.weekday !== undefined && input.weekday !== null) {
    errors.push({
      field: "weekday",
      message: "weekday is only valid for weekly frequency",
    });
  }

  if (!Array.isArray(input.spots) || input.spots.length === 0) {
    errors.push({ field: "spots", message: "pick at least one spot" });
  } else {
    const seen = new Set<string>();
    const cleaned: string[] = [];
    for (const slug of input.spots) {
      if (typeof slug !== "string") continue;
      if (seen.has(slug)) continue;
      if (!SPOTS[slug]) {
        errors.push({ field: "spots", message: `unknown spot: ${slug}` });
        continue;
      }
      seen.add(slug);
      cleaned.push(slug);
    }
    if (cleaned.length === 0 && errors.every((e) => e.field !== "spots")) {
      errors.push({ field: "spots", message: "pick at least one spot" });
    }
    if (errors.length === 0) {
      return {
        ok: true,
        value: {
          channel: input.channel as Channel,
          contact,
          normalizedContact: normalizeContact(input.channel as Channel, contact),
          frequency: input.frequency as Frequency,
          weekday,
          spots: cleaned,
        },
      };
    }
  }

  return { ok: false, errors };
}

type NormalizedInput = {
  channel: Channel;
  contact: string;
  normalizedContact: string;
  frequency: Frequency;
  weekday: Weekday | null;
  spots: string[];
};

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

function newId(): string {
  return randomBytes(12).toString("base64url");
}

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Creates or replaces the pending subscription for this contact. If a record
 * already exists for the contact, the id and unsubscribe token are preserved
 * but the status is reset to "pending" and the entry is removed from the
 * active index — the new preferences only take effect once the fresh confirm
 * token is hit. Treating re-subscribe as a re-confirmation keeps anyone who
 * doesn't actually own the contact from changing live preferences.
 *
 * Returns the new/updated record with a fresh confirmToken.
 */
export async function createPending(
  input: SubscribeInput,
): Promise<{ ok: true; subscription: Subscription } | { ok: false; errors: ValidationError[] }> {
  const v = validate(input);
  if (!v.ok) return v;

  const existingId = await redis.get<string>(KEY.contact(v.value.normalizedContact));
  let record: Subscription;

  if (existingId) {
    const existing = await getById(existingId);
    if (existing) {
      // Reuse id + unsubscribe token. Generate a fresh confirm token; drop
      // the prior confirm token from its lookup so it can't be used twice.
      if (existing.confirmToken) {
        await redis.del(KEY.confirm(existing.confirmToken));
      }
      // Clear the OLD index entry before we overwrite frequency/weekday —
      // otherwise the id can get stranded under the previous bucket.
      if (existing.status === "active") {
        await removeFromActiveIndex(existing);
      }
      record = {
        ...existing,
        channel: v.value.channel,
        contact: v.value.contact,
        frequency: v.value.frequency,
        weekday: v.value.weekday,
        spots: v.value.spots,
        status: "pending",
        confirmToken: newToken(),
        confirmedAt: null,
      };
    } else {
      record = freshRecord(v.value);
    }
  } else {
    record = freshRecord(v.value);
  }

  await persist(record);
  return { ok: true, subscription: record };
}

function freshRecord(v: NormalizedInput): Subscription {
  return {
    id: newId(),
    channel: v.channel,
    contact: v.contact,
    frequency: v.frequency,
    weekday: v.weekday,
    spots: v.spots,
    status: "pending",
    confirmToken: newToken(),
    unsubscribeToken: newToken(),
    createdAt: new Date().toISOString(),
    confirmedAt: null,
  };
}

async function persist(sub: Subscription): Promise<void> {
  const normalized = normalizeContact(sub.channel, sub.contact);
  await redis.set(KEY.record(sub.id), sub);
  await redis.set(KEY.contact(normalized), sub.id);
  await redis.set(KEY.unsubscribe(sub.unsubscribeToken), sub.id);
  if (sub.confirmToken) {
    await redis.set(KEY.confirm(sub.confirmToken), sub.id, {
      ex: CONFIRM_TTL_S,
    });
  }
}

export async function getById(id: string): Promise<Subscription | null> {
  return redis.get<Subscription>(KEY.record(id));
}

export async function confirm(
  token: string,
): Promise<Subscription | null> {
  const id = await redis.get<string>(KEY.confirm(token));
  if (!id) return null;
  const sub = await getById(id);
  if (!sub) return null;

  const next: Subscription = {
    ...sub,
    status: "active",
    confirmToken: null,
    confirmedAt: sub.confirmedAt ?? new Date().toISOString(),
  };

  await redis.set(KEY.record(sub.id), next);
  await redis.del(KEY.confirm(token));
  await addToActiveIndex(next);

  return next;
}

export async function unsubscribe(
  token: string,
): Promise<Subscription | null> {
  const id = await redis.get<string>(KEY.unsubscribe(token));
  if (!id) return null;
  const sub = await getById(id);
  if (!sub) return null;

  if (sub.status === "active") {
    await removeFromActiveIndex(sub);
  }
  const next: Subscription = { ...sub, status: "unsubscribed" };
  await redis.set(KEY.record(sub.id), next);
  return next;
}

async function addToActiveIndex(sub: Subscription): Promise<void> {
  if (sub.frequency === "daily") {
    await redis.sadd(KEY.activeDaily(), sub.id);
  } else if (sub.weekday !== null) {
    await redis.sadd(KEY.activeWeekly(sub.weekday), sub.id);
  }
}

async function removeFromActiveIndex(sub: Subscription): Promise<void> {
  if (sub.frequency === "daily") {
    await redis.srem(KEY.activeDaily(), sub.id);
  } else if (sub.weekday !== null) {
    await redis.srem(KEY.activeWeekly(sub.weekday), sub.id);
  }
}

// ---------------------------------------------------------------------------
// Cron-facing lookups
// ---------------------------------------------------------------------------

export async function listActiveDaily(): Promise<Subscription[]> {
  const ids = await redis.smembers(KEY.activeDaily());
  return hydrate(ids);
}

export async function listActiveWeekly(
  weekday: Weekday,
): Promise<Subscription[]> {
  const ids = await redis.smembers(KEY.activeWeekly(weekday));
  return hydrate(ids);
}

async function hydrate(ids: string[]): Promise<Subscription[]> {
  if (ids.length === 0) return [];
  const results = await Promise.all(ids.map((id) => getById(id)));
  // Filter out tombstones — possible if a record was deleted but the index
  // wasn't (shouldn't happen in normal flow but be defensive).
  return results.filter((s): s is Subscription => s !== null);
}
