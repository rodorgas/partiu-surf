/**
 * In-memory mock of @upstash/redis Redis client.
 *
 * Why not ioredis-mock? @upstash/redis speaks HTTP REST, ioredis-mock speaks
 * the binary Redis protocol — they're not wire-compatible, and bridging them
 * is more work than the methods we actually use here.
 *
 * Supports the subset of methods used by `cache.ts`:
 *   - get<T>(key)
 *   - set(key, value, { ex }?)
 *   - del(...keys)
 *   - scan(cursor, { match, count })
 *   - ttl(key)            (used by tests, returns -1 / -2 / seconds)
 *   - ping()
 *   - flushall()          (test helper)
 */

import { vi } from "vitest";

type Entry = {
  value: unknown;
  /** epoch ms when this entry expires, or null for no expiry */
  expiresAt: number | null;
};

export class MemoryRedis {
  private store = new Map<string, Entry>();
  /** Override `Date.now()` for deterministic TTL tests. */
  public now: () => number = () => Date.now();

  private isExpired(entry: Entry): boolean {
    return entry.expiresAt !== null && this.now() >= entry.expiresAt;
  }

  private read(key: string): Entry | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (this.isExpired(entry)) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }

  async ping(): Promise<"PONG"> {
    return "PONG";
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const entry = this.read(key);
    if (!entry) return null;
    // Upstash returns deserialized JSON when stored as object; mimic that.
    return entry.value as T;
  }

  async set(
    key: string,
    value: unknown,
    opts?: { ex?: number },
  ): Promise<"OK"> {
    const expiresAt =
      opts && typeof opts.ex === "number" ? this.now() + opts.ex * 1000 : null;
    this.store.set(key, { value, expiresAt });
    return "OK";
  }

  async del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const k of keys) {
      if (this.store.delete(k)) deleted++;
    }
    return deleted;
  }

  /**
   * Mimics Upstash SCAN: takes a cursor and options, returns [nextCursor, keys].
   * Single-shot implementation — returns every matching key in one call and a
   * cursor of "0" indicating completion.
   */
  async scan(
    _cursor: number | string,
    opts: { match: string; count?: number } = { match: "*" },
  ): Promise<[string, string[]]> {
    const pattern = opts.match ?? "*";
    const re = new RegExp(
      "^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$",
    );
    const keys: string[] = [];
    for (const [k, entry] of this.store.entries()) {
      if (this.isExpired(entry)) continue;
      if (re.test(k)) keys.push(k);
    }
    return ["0", keys];
  }

  /** seconds remaining, -1 if no TTL, -2 if key missing. */
  async ttl(key: string): Promise<number> {
    const entry = this.store.get(key);
    if (!entry) return -2;
    if (this.isExpired(entry)) {
      this.store.delete(key);
      return -2;
    }
    if (entry.expiresAt === null) return -1;
    return Math.max(0, Math.ceil((entry.expiresAt - this.now()) / 1000));
  }

  /** Test helper — not part of @upstash/redis surface. */
  async flushall(): Promise<"OK"> {
    this.store.clear();
    return "OK";
  }

  /** Test helper — set the clock for deterministic TTL behavior. */
  setNow(fn: () => number): void {
    this.now = fn;
  }
}

/**
 * Builds a vi.mock factory for `@upstash/redis` that wires both `Redis` and
 * `Redis.fromEnv()` to a shared MemoryRedis instance.
 *
 * Usage:
 *   const memory = new MemoryRedis();
 *   vi.mock('@upstash/redis', () => mockUpstashRedis(memory));
 */
export function mockUpstashRedis(memory: MemoryRedis) {
  const Redis = vi.fn(() => memory) as unknown as {
    new (...args: unknown[]): MemoryRedis;
    fromEnv: () => MemoryRedis;
  };
  Redis.fromEnv = () => memory;
  return { Redis };
}
